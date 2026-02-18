import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { createClient } from "@/utils/supabase/server";
import { tools, handleToolCall, needsApproval } from "@/utils/agent-tools";

// Allow this route to run for up to 300 seconds (Vercel Pro / self-hosted).
// This is required because the approval gate can wait up to 5 minutes for user input.
export const maxDuration = 300;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ── Approval Gate ─────────────────────────────────────────────────────────────
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function requestAndWaitForApproval(
    toolName: string,
    args: Record<string, unknown>,
    sessionId: string,
    agentId: string
): Promise<{ decision: 'approved' | 'denied' | 'timeout'; requestId: string }> {
    const supabase = await createClient();
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

export async function POST(req: Request) {
    const supabase = await createClient();
    try {
        const { agentId, message, history, inlineConfig, sessionId } = await req.json();

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
                .eq('agent_id', agentId)
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
                const agentPath = path.join(process.cwd(), "agents", folder);

                soul = fs.readFileSync(path.join(agentPath, "soul.md"), "utf8");
                personality = JSON.parse(fs.readFileSync(path.join(agentPath, "personality.json"), "utf8"));
                memory = JSON.parse(fs.readFileSync(path.join(agentPath, "memory.json"), "utf8"));
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

Your mission is to respond as this HIVE V1 agent. 
Keep it spatial, context-aware, and aligned with your role.
You have access to tools to help you research and build. Use them when appropriate.
Always provide a concise "Action Taken" and "Confidence Score" (0.0 to 1.0) at the end of your response if a task was attempted.

IMPORTANT: Keep replies SHORT — 1 to 3 sentences max.
`;

        const MAX_ITERATIONS = 20;
        let iteration = 0;
        const toolCallLog: { tool: string; iteration: number }[] = [];
        let hiveSessionId: string | null = null;

        // Start with system prompt + history + new user message
        let messages: any[] = [
            { role: "system", content: systemPrompt },
            ...history.slice(-20),               // keep last 20 turns for context
            { role: "user", content: message }
        ];

        let finalResponseMessage: any = null;

        while (iteration < MAX_ITERATIONS) {
            iteration++;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",                   // REQUIRED: upgrade from gpt-4o-mini
                messages,
                tools: tools as any,
                tool_choice: "auto",
            });

            const choice = completion.choices[0];
            const responseMessage = choice.message;

            // ── Case 1: No tool calls → agent is done, return final text ──
            if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
                finalResponseMessage = responseMessage;
                break;
            }

            // ── Case 2: Tool calls present → execute them all, feed results back ──
            messages.push(responseMessage);      // add assistant turn with tool_calls

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
                        result = await handleToolCall(toolName, toolArgs, {
                            sessionId: currentSessionId,
                            agentDbId: agentDbId || "",
                        });
                    } else if (decision === 'denied') {
                        result = `Tool "${toolName}" was denied by the user. Do not retry this tool. Find an alternative approach or ask the user what they'd like to do instead.`;
                    } else {
                        result = `Tool "${toolName}" timed out waiting for approval (5 minutes elapsed). Proceeding without it.`;
                    }
                } else {
                    // Auto-approved — execute immediately
                    result = await handleToolCall(toolName, toolArgs, {
                        sessionId,
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

        // 3. Simple "Memory" logic for new learnings (to be expanded)
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

        return Response.json({
            text: responseText,
            memoryCount: memory.learnings.length,
            updatedMemory: inlineConfig ? memory : undefined,
            hive_session_id: hiveSessionId,
            iterations_used: iteration,
            tool_calls_made: toolCallLog,
            partial: iteration >= MAX_ITERATIONS && !finalResponseMessage,
        });

    } catch (error: any) {
        console.error("Chat Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
