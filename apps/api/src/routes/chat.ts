import { FastifyInstance } from 'fastify'
import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { performance } from 'perf_hooks';
import { createClient } from "@supabase/supabase-js";
import { tools, handleToolCall, needsApproval } from "../utils/agent-tools";
import { logTelemetryEvent } from "./telemetry";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ── Cost Estimator ────────────────────────────────────────────────────────────

function estimateCost(model: string, tokens: number): number {
    const rates: Record<string, number> = {
        'gpt-4o': 0.000005,       // $5 per 1M tokens (blended)
        'gpt-4o-mini': 0.0000003, // $0.30 per 1M tokens
    };
    return (rates[model] ?? 0) * tokens;
}

// ── Approval Gate ─────────────────────────────────────────────────────────────
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function requestAndWaitForApproval(
    toolName: string,
    args: Record<string, unknown>,
    sessionId: string,
    agentId: string
): Promise<{ decision: 'approved' | 'denied' | 'timeout'; requestId: string }> {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const requestId = crypto.randomUUID();

    // 1. Create the approval request in Supabase
    await supabase.from('approval_requests').insert({
        id: requestId,
        session_id: sessionId,
        agent_id: agentId,
        tool: toolName,
        args,
        status: 'pending',
    });

    // 2. Poll Supabase for a resolution (approved/denied)
    const pollInterval = 1000;
    const maxPolls = APPROVAL_TIMEOUT_MS / pollInterval;

    for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, pollInterval));

        const { data } = await supabase
            .from('approval_requests')
            .select('status')
            .eq('id', requestId)
            .single();

        if (data?.status === 'approved') return { decision: 'approved', requestId };
        if (data?.status === 'denied') return { decision: 'denied', requestId };
    }

    // 3. Timeout — mark and return
    await supabase
        .from('approval_requests')
        .update({ status: 'timeout', resolved_at: new Date().toISOString() })
        .eq('id', requestId);

    return { decision: 'timeout', requestId };
}

// ── Telemetry-wrapped Tool Executor ──────────────────────────────────────────

async function executeToolCallWithTelemetry(
    toolName: string,
    toolArgs: Record<string, unknown>,
    context: { sessionId: string; agentId: string; agentDbId: string }
): Promise<string> {
    const start = performance.now();
    let success = true;
    let error: string | undefined;
    let result = '';

    try {
        result = await handleToolCall(toolName, toolArgs, {
            sessionId: context.sessionId,
            agentDbId: context.agentDbId,
        });
    } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        result = `ERROR: ${error}`;
    }

    const latencyMs = Math.round(performance.now() - start);

    // Fire telemetry — non-blocking, never awaited in the hot path
    logTelemetryEvent({
        event_type: 'tool_call',
        agent_id: context.agentId,
        payload: {
            tool: toolName,
            args_preview: JSON.stringify(toolArgs).slice(0, 300),
            result_preview: result.slice(0, 300),
            error,
        },
        latency_ms: latencyMs,
        success,
    }).catch(() => { }); // fire-and-forget

    return result;
}

export async function chatRoutes(app: FastifyInstance) {
    app.post('/chat', async (req, reply) => {
        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
        try {
            const { agentId, message, history, inlineConfig, sessionId } = req.body as any;

            let soul: string;
            let personality: any;
            let memory: any;
            let agentDbId: string | null = null;

            if (inlineConfig) {
                // Dynamic session-based agent
                soul = inlineConfig.soul;
                personality = inlineConfig.personality;
                memory = inlineConfig.memory || { learnings: [], blink_count: 0 };
            } else {
                // Check Supabase first
                const { data: agentData } = await supabase
                    .from('agents')
                    .select('*')
                    .eq('agent_id', agentId) // 'orchestrator'
                    .single();

                if (agentData) {
                    soul = agentData.soul;
                    personality = agentData.personality;
                    agentDbId = agentData.id;
                    // Fetch structured memory from DB
                    const { data: memData } = await supabase
                        .from('agent_memory')
                        .select('data')
                        .eq('agent_db_id', agentDbId)
                        .order('created_at', { ascending: false })
                        .limit(10);

                    const learnings = memData?.map(m => (m.data as any).text) || [];
                    memory = { learnings, blink_count: 0 };
                } else {
                    // Fallback: read from filesystem (static agents)
                    const agentMap: Record<string, string> = {
                        "Agent 1": "agent1",
                        "Agent 2": "agent2",
                        "All Agents": "orchestrator",
                        "orchestrator": "orchestrator"
                    };

                    const folder = agentMap[agentId] || "agent1";

                    // Try multiple paths to find the agents folder
                    const candidates = [
                        path.join(process.cwd(), "agents", folder),
                        path.join(process.cwd(), "../frontend/agents", folder),
                        path.join(__dirname, "../../../../frontend/agents", folder)
                    ];

                    let agentPath = "";
                    for (const p of candidates) {
                        if (fs.existsSync(p)) {
                            agentPath = p;
                            break;
                        }
                    }

                    if (!agentPath) {
                        soul = "You are a helpful assistant.";
                        personality = {};
                        memory = { learnings: [] };
                    } else {
                        soul = fs.readFileSync(path.join(agentPath, "soul.md"), "utf8");
                        personality = JSON.parse(fs.readFileSync(path.join(agentPath, "personality.json"), "utf8"));
                        memory = JSON.parse(fs.readFileSync(path.join(agentPath, "memory.json"), "utf8"));
                    }
                }
            }

            // Log User Message to Supabase if session exists
            if (sessionId && agentDbId) {
                await supabase.from('messages').insert({
                    session_id: sessionId,
                    sender_id: null, // From User
                    receiver_id: agentDbId,
                    payload: message,
                    type: 'user_message'
                });
            }

            // Prepare System Prompt
            const systemPrompt = `
${soul}

Personality Metadata:
${JSON.stringify(personality, null, 2)}

Long-term Memory (Learned Facts/Summaries):
${memory.learnings.length > 0 ? memory.learnings.join("\n") : "No specific memories yet."}

Current Date: ${new Date().toISOString()}

Your mission is to respond as this HIVE V1 agent. 
Keep it spatial, context-aware, and aligned with your role.
You have access to tools to help you research and build. Use them when appropriate.
Always provide a concise "Action Taken" and "Confidence Score" (0.0 to 1.0) at the end of your response if a task was attempted.

## EXECUTION RULES (always follow, regardless of personality)
1. KEEP REPLIES SHORT — 1 to 3 sentences max in chat. Never write long-form content directly in chat.
2. ARTIFACTS FOR LONG OUTPUT — For any research report, analysis, document, code file, or any output longer than 3 sentences, use generate_artifact (type: 'markdown' for reports/docs, 'html' for web pages, 'react' for components, 'csv' for data). Never dump a wall of text in chat.
3. MEMORY BEFORE WEB — Before calling search_web for any topic, first call memory_search to check if you already know the answer. Only search the web if memory returns no relevant results.
4. READ BEFORE WRITE — Before calling write_file on any file that may already exist, always call read_file first to understand the current content.
5. DELEGATE DON'T CODE — If you are acting as a PM or orchestrator, use assign_task to delegate implementation work. Do not write code directly.
`;

            const MAX_ITERATIONS = 20;
            const MODEL = 'gpt-4o';
            let iteration = 0;
            const toolCallLog: { tool: string; iteration: number }[] = [];
            let hiveSessionId: string | null = null;

            // Resolved agent identity for telemetry
            const telemetryAgentId = agentDbId || agentId || 'unknown';
            const telemetrySessionId = sessionId || `session-${Date.now()}`;

            // Start with system prompt
            let messages: any[] = [
                { role: "system", content: systemPrompt }
            ];

            // Hydrate history from DB if not provided by client (e.g. Telegram)
            if (!Array.isArray(history) || history.length === 0) {
                if (sessionId) {
                    const { data: dbHistory } = await supabase
                        .from('messages')
                        .select('*')
                        .eq('session_id', sessionId)
                        .order('created_at', { ascending: false })
                        .limit(20);

                    if (dbHistory && dbHistory.length > 0) {
                        const formattedHistory = dbHistory
                            .reverse()
                            .map((msg: any) => {
                                if (msg.type === 'user_message') return { role: 'user', content: msg.payload };
                                if (msg.type === 'agent_response') return { role: 'assistant', content: msg.payload };
                                return null;
                            })
                            .filter(Boolean);

                        messages.push(...formattedHistory);
                    }
                }
            } else {
                // Use client-provided history
                messages.push(...history.slice(-20));
            }

            // Add the new user message
            messages.push({ role: "user", content: message });

            let finalResponseMessage: any = null;

            while (iteration < MAX_ITERATIONS) {
                iteration++;

                // ── Model Call ────────────────────────────────────────────────
                const modelCallStart = performance.now();
                const completion = await openai.chat.completions.create({
                    model: MODEL,
                    messages,
                    tools: tools as any,
                    tool_choice: "auto",
                });
                const modelLatencyMs = Math.round(performance.now() - modelCallStart);

                // Log model call telemetry — fire-and-forget
                logTelemetryEvent({
                    event_type: 'model_call',
                    agent_id: telemetryAgentId,
                    model_used: MODEL,
                    input_tokens: completion.usage?.prompt_tokens ?? 0,
                    output_tokens: completion.usage?.completion_tokens ?? 0,
                    cost_usd: estimateCost(MODEL, completion.usage?.total_tokens ?? 0),
                    latency_ms: modelLatencyMs,
                    success: true,
                    payload: {
                        iteration,
                        message_count: messages.length,
                    },
                }).catch(() => { });

                const choice = completion.choices[0];
                const responseMessage = choice.message;

                // ── Case 1: No tool calls → agent is done, return final text ──
                if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
                    finalResponseMessage = responseMessage;
                    break;
                }

                // ── Case 2: Tool calls present → execute them all, feed results back ──
                messages.push(responseMessage);

                for (const toolCall of responseMessage.tool_calls) {
                    const toolName = toolCall.function.name;
                    const toolArgs = JSON.parse(toolCall.function.arguments);

                    let result: string;

                    // ── Approval Gate ──────────────────────────────────────────────
                    if (needsApproval(toolName)) {
                        const currentSessionId = sessionId || `session-${Date.now()}`;
                        const currentAgentId = agentDbId || agentId || 'unknown';

                        const { decision, requestId } = await requestAndWaitForApproval(
                            toolName,
                            toolArgs,
                            currentSessionId,
                            currentAgentId
                        );

                        if (decision === 'approved') {
                            // Execute with telemetry after approval
                            result = await executeToolCallWithTelemetry(toolName, toolArgs, {
                                sessionId: currentSessionId,
                                agentId: currentAgentId,
                                agentDbId: agentDbId || "",
                            });
                        } else if (decision === 'denied') {
                            // Log the denied approval as a telemetry event
                            logTelemetryEvent({
                                event_type: 'approval',
                                agent_id: currentAgentId,
                                payload: { tool: toolName, decision: 'denied', request_id: requestId, error: 'denied_by_user' },
                                success: false,
                            }).catch(() => { });
                            result = `Tool "${toolName}" was denied by the user. Do not retry this tool. Find an alternative approach or ask the user what they'd like to do instead.`;
                        } else {
                            // Timeout
                            logTelemetryEvent({
                                event_type: 'approval',
                                agent_id: currentAgentId,
                                payload: { tool: toolName, decision: 'timeout', request_id: requestId, error: 'approval_timeout' },
                                success: false,
                            }).catch(() => { });
                            result = `Tool "${toolName}" timed out waiting for approval (5 minutes elapsed). Proceeding without it.`;
                        }
                    } else {
                        // Auto-approved — execute with telemetry immediately
                        result = await executeToolCallWithTelemetry(toolName, toolArgs, {
                            sessionId: telemetrySessionId,
                            agentId: telemetryAgentId,
                            agentDbId: agentDbId || "",
                        });
                    }

                    // Extract HIVE session ID if launch_hive_session was called
                    if (toolName === 'launch_hive_session') {
                        try {
                            const parsed = JSON.parse(result);
                            if (parsed.session_id) hiveSessionId = parsed.session_id;
                        } catch { }
                    }

                    // Track for response metadata
                    toolCallLog.push({ tool: toolName, iteration });

                    // Feed result back as a tool message
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: result,
                    });
                }

                // Loop continues — the model will see all tool results and decide what to do next
            }

            const responseText = finalResponseMessage?.content || (messages.findLast((m: any) => m.role === "assistant" && typeof m.content === "string")?.content ?? "I've been working on this for a while, but couldn't reach a final conclusion.");

            // Log Agent Message to Supabase
            if (sessionId && agentDbId) {
                await supabase.from('messages').insert({
                    session_id: sessionId,
                    sender_id: agentDbId,
                    receiver_id: null,
                    payload: responseText,
                    type: 'agent_response'
                });
            }

            // Simple "Memory" logic for new learnings
            if (responseText.includes("Learned:") || responseText.includes("Memory:")) {
                if (agentDbId) {
                    await supabase.from('agent_memory').insert({
                        agent_db_id: agentDbId,
                        session_id: sessionId,
                        memory_type: 'learned_fact',
                        data: { text: responseText.split("Learned:")[1]?.trim() }
                    });
                }
            }

            return {
                text: responseText,
                memoryCount: memory.learnings.length,
                updatedMemory: inlineConfig ? memory : undefined,
                hive_session_id: hiveSessionId,
                iterations_used: iteration,
                tool_calls_made: toolCallLog,
                partial: iteration >= MAX_ITERATIONS && !finalResponseMessage,
            };

        } catch (error: any) {
            console.error("Chat Error:", error);
            reply.status(500).send({ error: error.message });
        }
    });
}
