import { OpenAI } from "openai";
import fs from "fs";
import path from "path";
import { createClient } from "@/utils/supabase/server";
import { tools, handleToolCall } from "@/utils/agent-tools";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    const supabase = createClient();
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

        let currentMessages: any[] = [
            { role: "system", content: systemPrompt },
            ...history.slice(-10),
            { role: "user", content: message }
        ];

        // 1. Get Response from OpenAI with Tool Support
        let completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: currentMessages,
            tools: tools as any,
            tool_choice: "auto",
        });

        let responseMessage = completion.choices[0].message;

        // 2. Handle Tool Calls Loop
        let hiveSessionId: string | null = null;

        if (responseMessage.tool_calls) {
            currentMessages.push(responseMessage);

            for (const toolCall of responseMessage.tool_calls) {
                const tc = toolCall as any;
                if (!tc.function) continue;

                const result = await handleToolCall(tc.function.name, JSON.parse(tc.function.arguments), {
                    sessionId,
                    agentDbId: agentDbId || ""
                });

                // Extract HIVE session ID if launch_hive_session was called
                if (tc.function.name === 'launch_hive_session') {
                    try {
                        const parsed = JSON.parse(result);
                        if (parsed.session_id) hiveSessionId = parsed.session_id;
                    } catch { }
                }

                currentMessages.push({
                    tool_call_id: tc.id,
                    role: "tool",
                    name: tc.function.name,
                    content: result,
                });
            }

            // Get final response after tool execution
            completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: currentMessages,
            });
            responseMessage = completion.choices[0].message;
        }

        const responseText = responseMessage.content || "";

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
        });

    } catch (error: any) {
        console.error("Chat Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
