import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

// ── Approval Registry ─────────────────────────────────────────────────────────
export const APPROVAL_REQUIRED = {
    // Always require human confirmation — no exceptions
    always: [
        'exec_command',
        'run_python',
        'gmail_send',
        'calendar_create',
        'calendar_delete',
        'delete_file',
    ],
    // Auto-approved — never require confirmation
    auto: [
        'search_web',
        'web_fetch',
        'read_file',
        'list_dir',
        'file_exists',
        'append_file',
        'move_file',
        'create_directory',
        'gmail_list',
        'gmail_read',
        'gmail_draft',
        'calendar_list',
        'browser_open',
        'browser_get_text',
        'browser_screenshot',
        'browser_close',
        'memory_save',
        'memory_search',
        'memory_forget',
        'generate_image',
        'generate_artifact',
        'assign_task',
        'check_budget',
        'log_apl_event',
    ],
};

/** Returns true if the given tool name requires human approval before execution. */
export function needsApproval(toolName: string): boolean {
    return APPROVAL_REQUIRED.always.includes(toolName);
}

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
            description: "Write content to a file. Used to build artifacts, code, or content. IMPORTANT: If the file may already exist, always call read_file first to understand the current content before overwriting it.",
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
            name: "web_fetch",
            description: "Fetch the full text content of any URL. Use this when you have a specific URL — it's faster and more complete than web_search. Returns page text, stripped of HTML.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "Full URL including https://" },
                    extract: {
                        type: "string",
                        enum: ["text", "links", "json"],
                        description: "What to extract. Default: text. Use 'links' to get all hrefs. Use 'json' for API endpoints."
                    }
                },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "delete_file",
            description: "Delete a file or directory. REQUIRES APPROVAL before executing.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "File or directory path relative to project root." },
                    recursive: { type: "boolean", description: "Delete directory and all contents. Default false." }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "move_file",
            description: "Move or rename a file or directory.",
            parameters: {
                type: "object",
                properties: {
                    source: { type: "string", description: "Current path." },
                    destination: { type: "string", description: "Target path." }
                },
                required: ["source", "destination"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_directory",
            description: "Create a directory and all parent directories (like mkdir -p).",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "exec_command",
            description: "Run a shell command on the server. Use for scripts, package installs, system state checks, git commands, or any terminal operation. REQUIRES APPROVAL before executing.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "Shell command to run. Use absolute paths where possible." },
                    cwd: { type: "string", description: "Working directory. Defaults to project root." },
                    timeout_ms: { type: "number", description: "Max runtime in milliseconds. Default 30000." }
                },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "run_python",
            description: "Execute a Python code snippet and return stdout + stderr. Use for data processing, calculations, CSV/JSON parsing, or anything that benefits from Python libraries.",
            parameters: {
                type: "object",
                properties: {
                    code: { type: "string", description: "Complete Python code to execute." },
                    packages: {
                        type: "array",
                        items: { type: "string" },
                        description: "pip packages to install before running. e.g. ['pandas', 'requests']"
                    }
                },
                required: ["code"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "append_file",
            description: "Append content to the end of an existing file without overwriting it.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    content: { type: "string" }
                },
                required: ["path", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "file_exists",
            description: "Check whether a file or directory exists at a given path. Returns true/false and file metadata if it exists.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" }
                },
                required: ["path"]
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
            name: "browser_open",
            description: "Navigate to a URL in a real browser (handles JS-rendered content). Returns page text and optionally a screenshot. Use when web_fetch fails due to JS rendering.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string" },
                    wait_for: { type: "string", description: "CSS selector to wait for before capturing. Optional." },
                    screenshot: { type: "boolean", description: "Return a base64 screenshot PNG. Default false." }
                },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "browser_click",
            description: "Click an element on the current browser page by CSS selector.",
            parameters: {
                type: "object",
                properties: {
                    selector: { type: "string", description: "CSS selector of element to click." },
                    timeout_ms: { type: "number", description: "Wait timeout. Default 5000." }
                },
                required: ["selector"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "browser_fill",
            description: "Type text into a form field on the current browser page.",
            parameters: {
                type: "object",
                properties: {
                    selector: { type: "string", description: "CSS selector of the input field." },
                    value: { type: "string", description: "Text to type." }
                },
                required: ["selector", "value"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "browser_get_text",
            description: "Get the current text content of the open browser page, or a specific element.",
            parameters: {
                type: "object",
                properties: {
                    selector: { type: "string", description: "CSS selector to extract text from. If omitted, returns full page text." }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "browser_screenshot",
            description: "Take a screenshot of the current browser page and return it as base64 PNG.",
            parameters: {
                type: "object",
                properties: {
                    full_page: { type: "boolean", description: "Capture full scrollable page. Default false (viewport only)." }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "browser_close",
            description: "Close the current browser session and free resources.",
            parameters: { type: "object", properties: {}, required: [] }
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
    },
    // Gmail Tools
    { type: "function", function: { name: "gmail_list", description: "List Gmail messages matching a search query (e.g. 'from:boss@company.com is:unread'). Returns message IDs, senders, subjects.", parameters: { type: "object", properties: { query: { type: "string" }, max_results: { type: "number" } }, required: ["query"] } } },
    { type: "function", function: { name: "gmail_read", description: "Read the full content of a specific Gmail message by ID.", parameters: { type: "object", properties: { message_id: { type: "string" } }, required: ["message_id"] } } },
    { type: "function", function: { name: "gmail_send", description: "Send an email via Gmail. REQUIRES APPROVAL.", parameters: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, cc: { type: "string" }, reply_to_id: { type: "string" } }, required: ["to", "subject", "body"] } } },
    { type: "function", function: { name: "gmail_draft", description: "Save an email as a Gmail draft without sending it.", parameters: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] } } },
    // Calendar Tools
    { type: "function", function: { name: "calendar_list", description: "List upcoming Google Calendar events.", parameters: { type: "object", properties: { days_ahead: { type: "number" }, calendar_id: { type: "string" } }, required: [] } } },
    { type: "function", function: { name: "calendar_create", description: "Create a Google Calendar event. REQUIRES APPROVAL.", parameters: { type: "object", properties: { title: { type: "string" }, start: { type: "string" }, end: { type: "string" }, description: { type: "string" }, attendees: { type: "array", items: { type: "string" } }, location: { type: "string" } }, required: ["title", "start", "end"] } } },
    { type: "function", function: { name: "calendar_delete", description: "Delete a calendar event by ID. REQUIRES APPROVAL.", parameters: { type: "object", properties: { event_id: { type: "string" } }, required: ["event_id"] } } }
];

async function callBackend(endpoint: string, body: any) {
    try {
        const apiUrl = "http://localhost:3001"; // Loopback to self
        const res = await fetch(`${apiUrl}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": process.env.API_KEY || "test"
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        return data.result || JSON.stringify(data);
    } catch (e: any) {
        return `Error calling tool: ${e.message}`;
    }
}

export async function handleToolCall(name: string, args: any, context?: { sessionId: string, agentDbId: string }) {
    console.log(`[Tool Call] ${name}:`, args);
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    switch (name) {
        case "web_fetch": return await callBackend('/tools/web_fetch', args);
        case "delete_file": return await callBackend('/tools/delete_file', args);
        case "move_file": return await callBackend('/tools/move_file', args);
        case "create_directory": return await callBackend('/tools/create_directory', args);
        case "exec_command": return await callBackend('/tools/exec_command', args);
        case "run_python": return await callBackend('/tools/run_python', args);
        case "append_file": return await callBackend('/tools/append_file', args);
        case "file_exists": return await callBackend('/tools/file_exists', args);

        case "browser_open": return await callBackend('/tools/browser/open', { ...args, session_id: context?.sessionId });
        case "browser_click": return await callBackend('/tools/browser/click', { ...args, session_id: context?.sessionId });
        case "browser_fill": return await callBackend('/tools/browser/fill', { ...args, session_id: context?.sessionId });
        case "browser_get_text": return await callBackend('/tools/browser/get_text', { ...args, session_id: context?.sessionId });
        case "browser_screenshot": return await callBackend('/tools/browser/screenshot', { ...args, session_id: context?.sessionId });
        case "browser_close": return await callBackend('/tools/browser/close', { session_id: context?.sessionId });

        case "search_web": return await callBackend('/tools/web_search', args);

        case "list_dir":
            try {
                // IMPORTANT: For API running in root or apps/api, cwd might vary.
                // Assuming project root is where start.sh runs (HiveDemo)
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
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': process.env.API_KEY || "test"
                    },
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

        case 'gmail_list': return await callBackend('/tools/gmail/list', args);
        case 'gmail_read': return await callBackend('/tools/gmail/read', args);
        case 'gmail_send': return await callBackend('/tools/gmail/send', args);
        case 'gmail_draft': return await callBackend('/tools/gmail/draft', args);
        case 'calendar_list': return await callBackend('/tools/calendar/list', args);
        case 'calendar_create': return await callBackend('/tools/calendar/create', args);
        case 'calendar_delete': return await callBackend('/tools/calendar/delete', args);

        default:
            return `Tool ${name} not implemented.`;
    }
}
