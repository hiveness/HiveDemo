import fs from "fs";
import path from "path";
import { createClient } from "@/utils/supabase/server";

export const tools = [
    {
        type: "function",
        function: {
            name: "search_web",
            description: "Search the web for information, trends, or documentation. Use this to research topics.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The search query." }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_dir",
            description: "List files and directories in a given path relative to project root.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "The directory path (e.g. '.' or 'components')." }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read the content of a file.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "The file path (relative to project root)." }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Write content to a file. Used to build artifacts, code, or content.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "The file path (relative to project root)." },
                    content: { type: "string", description: "The content to write." }
                },
                required: ["path", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "generate_image",
            description: "Generate an image asset based on a prompt.",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "Description of the image to generate." }
                },
                required: ["prompt"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "assign_task",
            description: "Create a new task for another agent. Use this to delegate work.",
            parameters: {
                type: "object",
                properties: {
                    assignee_role: { type: "string", description: "Role of the agent to assign to (e.g. 'PM', 'Dev')." },
                    title: { type: "string", description: "Short title of the task." },
                    spec: { type: "string", description: "Detailed specification or instructions for the task." },
                    priority: { type: "integer", description: "Priority level (1-5)." }
                },
                required: ["assignee_role", "title", "spec"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "message_agent",
            description: "Send a message to another agent to share information or ask for help.",
            parameters: {
                type: "object",
                properties: {
                    receiver_role: { type: "string", description: "Role of the agent to message (e.g. 'PM', 'Dev')." },
                    message: { type: "string", description: "The message content." }
                },
                required: ["receiver_role", "message"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "launch_hive_session",
            description: "Launch a full HIVE multi-agent session to accomplish a goal. Use this when the user asks you to BUILD, CREATE, or MAKE something that requires multiple steps or agents. This spawns the orchestrator, PM, and developer agents to work together.",
            parameters: {
                type: "object",
                properties: {
                    goal: { type: "string", description: "The goal to accomplish (e.g. 'Build a landing page for an RSS feed')." }
                },
                required: ["goal"]
            }
        }
    }
];

export async function handleToolCall(name: string, args: any, context?: { sessionId: string, agentDbId: string }) {
    console.log(`[Tool Call] ${name}:`, args);
    const supabase = createClient();

    switch (name) {
        case "search_web":
            // Mocking search for now
            return `Search results for "${args.query}":
            1. [SEO Trends 2024] Focus on user intent, high-quality content, and technical SEO.
            2. [React Performance] Memoization and code-splitting are key.
            3. [Supabase] Open source Firebase alternative with Postgres.`;

        case "list_dir":
            try {
                const dirPath = path.join(process.cwd(), args.path || ".");
                if (!fs.existsSync(dirPath)) return `Directory not found: ${args.path}`;
                const files = fs.readdirSync(dirPath);
                return JSON.stringify(files.slice(0, 20)); // Limit output
            } catch (e: any) {
                return `Error listing directory: ${e.message}`;
            }

        case "read_file":
            try {
                const filePath = path.join(process.cwd(), args.path);
                if (!fs.existsSync(filePath)) return `File not found: ${args.path}`;
                const content = fs.readFileSync(filePath, "utf8");
                return content.slice(0, 2000); // Limit output length
            } catch (e: any) {
                return `Error reading file: ${e.message}`;
            }

        case "write_file":
            try {
                const filePath = path.join(process.cwd(), args.path);
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(filePath, args.content);
                return `Successfully wrote to ${args.path}`;
            } catch (e: any) {
                return `Error writing file: ${e.message}`;
            }

        case "generate_image":
            return `Successfully generated image for prompt: ${args.prompt}. (Mocked)`;

        case "assign_task":
            if (!context?.sessionId || !context?.agentDbId) return "Error: Missing session context for task assignment.";

            // Find assignee ID based on role
            // Mapping roles to IDs (approximate for HIVE V1)
            let assigneeId = null;
            if (args.assignee_role.toLowerCase().includes('pm')) {
                const { data } = await supabase.from('agents').select('id').eq('agent_id', 'agent2').single();
                assigneeId = data?.id;
            } else if (args.assignee_role.toLowerCase().includes('dev')) {
                const { data } = await supabase.from('agents').select('id').eq('agent_id', 'agent1').single();
                assigneeId = data?.id;
            }

            if (!assigneeId) return `Error: Could not find agent with role ${args.assignee_role}`;

            const { data: taskData, error: taskError } = await supabase.from('tasks').insert({
                session_id: context.sessionId,
                creator_id: context.agentDbId,
                assignee_id: assigneeId,
                status: 'pending',
                spec: { title: args.title, description: args.spec },
                priority: args.priority || 1
            }).select();

            if (taskError) return `Error creating task: ${taskError.message}`;
            return `Task assigned successfully to ${args.assignee_role} (Task ID: ${taskData[0].id})`;

        case "message_agent":
            if (!context?.sessionId || !context?.agentDbId) return "Error: Missing session context for messaging.";

            let receiverId = null;
            if (args.receiver_role.toLowerCase().includes('pm')) {
                const { data } = await supabase.from('agents').select('id').eq('agent_id', 'agent2').single();
                receiverId = data?.id;
            } else if (args.receiver_role.toLowerCase().includes('dev')) {
                const { data } = await supabase.from('agents').select('id').eq('agent_id', 'agent1').single();
                receiverId = data?.id;
            }

            if (!receiverId) return `Error: Could not find agent with role ${args.receiver_role}`;

            const { error: msgError } = await supabase.from('messages').insert({
                session_id: context.sessionId,
                sender_id: context.agentDbId,
                receiver_id: receiverId,
                payload: args.message,
                type: 'agent_message'
            });

            if (msgError) return `Error sending message: ${msgError.message}`;
            return `Message sent to ${args.receiver_role}`;

        case "launch_hive_session":
            try {
                const hiveUrl = process.env.HIVE_SERVICE_URL || 'http://localhost:8000';
                const hiveRes = await fetch(`${hiveUrl}/run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ goal: args.goal }),
                });
                if (!hiveRes.ok) {
                    const errText = await hiveRes.text();
                    return `Error launching HIVE session: ${errText}`;
                }
                const hiveData = await hiveRes.json();
                return JSON.stringify({
                    success: true,
                    session_id: hiveData.session_id,
                    message: `HIVE session launched! Session ID: ${hiveData.session_id}. The swarm is now working on: "${args.goal}". Open the HIVE panel (🐝) to monitor progress.`
                });
            } catch (e: any) {
                return `Error: Cannot reach HIVE backend (${e.message}). Make sure the Python backend is running on port 8000.`;
            }

        default:
            return `Tool ${name} not implemented.`;
    }
}
