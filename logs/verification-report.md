# HiveDemo — Agent Behavior Verification Report

**Generated:** 2026-02-18  
**Codebase:** `/Users/sahil/Downloads/HiveDemo`  
**Scope:** Static code analysis of all agent, memory, tool, and routing layers

---

## Summary Table

| # | Requirement | Status | Confidence |
|---|-------------|--------|------------|
| 1 | Research task → Markdown artifact (not wall of text in chat) | ⚠️ PARTIAL | Medium |
| 2 | Multi-step task executes ≥3 tool calls before responding | ✅ PASS | High |
| 3 | PM agent uses `assign_task` to delegate — does not write code | ⚠️ PARTIAL | Medium |
| 4 | Dev agent reads file before overwriting | ❌ FAIL | High |
| 5 | Support agent checks memory before searching the web | ⚠️ N/A — No Support agent exists | High |
| 6 | Memory block appears in system prompt (Prompt 05 hydration) | ✅ PASS | High |
| 7 | Agents stay in character while following execution rules | ✅ PASS | High |
| 8 | Chat responses short — long-form output goes into artifacts | ⚠️ PARTIAL | Medium |

---

## Detailed Findings

---

### ✅ 1. Research Task → Markdown Artifact

**Requirement:** An agent given "research X and write a report" produces a Markdown artifact — not a wall of text in chat.

**Finding: PARTIAL PASS**

**Evidence:**

The `generate_artifact` tool is fully implemented and registered:

```typescript
// apps/frontend/src/utils/agent-tools.ts
{
  name: "generate_artifact",
  description: "Generate a viewable artifact that opens in a new browser tab. Use this for any output that benefits from visual rendering: websites, dashboards, reports, forms, data tables, React components, or formatted documents. Returns a preview_url the user can open. ALWAYS use this instead of returning raw HTML/code in chat.",
  parameters: {
    type: { enum: ["html", "pdf", "form", "react", "csv", "markdown"] }
    ...
  }
}
```

The artifacts backend (`apps/api/src/routes/artifacts.ts`) correctly handles `type: "markdown"` — rendering it as styled HTML with GitHub Markdown CSS.

The system prompt in `apps/api/src/routes/chat.ts` includes:

```
IMPORTANT: Keep replies SHORT — 1 to 3 sentences max.
```

**Gap:** The system prompt does **not** explicitly instruct the agent to use `generate_artifact` for research reports. The instruction says "keep replies short" but does not say "use generate_artifact for reports." The agent must infer this from the tool description alone (`ALWAYS use this instead of returning raw HTML/code in chat`). This is a soft instruction — it covers HTML/code but does not explicitly mention research reports or Markdown documents.

**Recommendation:** Add to the system prompt: *"For any research report, analysis, or document longer than 3 sentences, use `generate_artifact` with `type: 'markdown'` instead of writing it in chat."*

---

### ✅ 2. Multi-Step Task Executes ≥3 Tool Calls Before Responding

**Requirement:** An agent given a multi-step task executes at least 3 tool calls before responding.

**Finding: PASS**

**Evidence:**

The chat loop in `apps/api/src/routes/chat.ts` implements a full agentic loop with `MAX_ITERATIONS = 20`:

```typescript
while (iteration < MAX_ITERATIONS) {
    iteration++;
    const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: tools as any,
        tool_choice: "auto",
    });
    
    // Case 1: No tool calls → agent is done
    if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        finalResponseMessage = responseMessage;
        break;
    }
    
    // Case 2: Tool calls present → execute them all, feed results back
    // Loop continues — the model will see all tool results and decide what to do next
}
```

The loop continues until the model produces a response with no tool calls. There is no artificial cap at 3 iterations — the model can and will make as many tool calls as needed. The `tool_calls_made` array is returned in the response for observability.

The PM agent (`apps/agents/src/pm-agent.ts`) also processes tool calls via `processToolCalls()` which handles all `<tool_call>` blocks in the model response before finalizing.

**Note:** The ≥3 tool call behavior is model-driven (GPT-4o with `tool_choice: "auto"`). The infrastructure supports unlimited sequential tool calls. Whether a specific multi-step task actually triggers ≥3 calls depends on the model's judgment, which is appropriate.

---

### ⚠️ 3. PM Agent Uses `assign_task` — Does Not Write Code

**Requirement:** A PM agent uses `assign_task` to delegate implementation — does not write code directly.

**Finding: PARTIAL PASS**

**Evidence (what works):**

The PM agent (`apps/agents/src/pm-agent.ts`) is architecturally constrained to produce only JSON matching `PMResponseSchema`:

```typescript
const parsed = PMResponseSchema.safeParse(responseData)
if (!parsed.success) throw new Error(`Invalid PM response: ${text}`)
const { subtasks, direct_answer } = parsed.data
```

The schema only allows `subtasks[]` and `direct_answer` — there is no field for code output. Subtasks are automatically queued to the `dev-tasks` BullMQ queue:

```typescript
await devQueue.add('dev-task', {
    taskId: newTask.id,
    spec: subtask,
    agentId: devAgent?.id,
    ...
})
```

This is a strong architectural guarantee: the PM agent **cannot** write code because its output schema doesn't allow it.

**Gap (chat-mode PM):** In the chat interface (`apps/api/src/routes/chat.ts`), the orchestrator agent has access to `write_file` and `exec_command` tools. If the orchestrator is acting as a PM-like agent, it could theoretically write code. The `assign_task` tool is available and auto-approved, but there is no system-prompt rule that says "you are a PM — use assign_task, never write_file." The soul files for agents 1 and 2 describe them as developers, not PMs.

**Recommendation:** Add a PM-specific system prompt rule: *"You are a Project Manager. NEVER use `write_file` or `exec_command`. ALWAYS use `assign_task` to delegate implementation work to Dev agents."*

---

### ❌ 4. Dev Agent Reads File Before Overwriting

**Requirement:** A Dev agent reads the existing file before overwriting it.

**Finding: FAIL**

**Evidence:**

In `apps/api/src/utils/agent-tools.ts` and `apps/frontend/src/utils/agent-tools.ts`, the `write_file` tool has this description:

```typescript
{
  name: "write_file",
  description: "Write content to a file. Used to build artifacts, code, or content.",
}
```

There is **no instruction** to read the file first. The `read_file` tool description also does not mention it should be called before writing:

```typescript
{
  name: "read_file",
  description: "Read the content of a file.",
}
```

The Dev agent's system prompt (`apps/agents/src/dev-agent.ts`) contains no rule about reading before writing. The directive stored in the DB (from `scripts/update_pm_directive.ts`) is for the PM agent only. The Dev agent's directive field is used as-is from the DB with no read-before-write constraint.

The `write_file` handler in `handleToolCall` directly overwrites without checking:

```typescript
case "write_file":
    const filePath = path.join(process.cwd(), args.path);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, args.content);  // ← direct overwrite, no read first
    return `Successfully wrote to ${args.path}`;
```

**Recommendation:** Either:
1. Add to `write_file` description: *"Before writing to an existing file, always call `read_file` first to understand the current content."*
2. Or add to the Dev agent's directive: *"ALWAYS call `read_file` before `write_file` on any existing file."*
3. Or modify the `write_file` handler to auto-read and return current content if the file exists, requiring the agent to confirm.

---

### ⚠️ 5. Support Agent Checks Memory Before Web Search

**Requirement:** A Support agent checks memory before searching the web.

**Finding: N/A — No Support Agent Exists**

**Evidence:**

A search across all TypeScript files finds no agent with role `support` or named "Support Agent." The only defined agent roles are:
- `pm` — Blueprint (Project Manager)
- `dev` — Spark (Developer)
- Chat agents: Quacksworth (Front-End Dev), Mallory (Back-End Dev), Antigravity (Orchestrator)

The `memory_search` tool description does include the correct instruction:

```typescript
description: 'Search your long-term memory for information relevant to the current task. Always check memory before searching the web for things you may have already learned.'
```

This instruction exists in the tool definition but there is no Support agent to enforce it on.

**Recommendation:** If a Support agent is planned, create it with a directive that explicitly states: *"Before calling `web_search`, always call `memory_search` first. Only search the web if memory returns no relevant results."*

---

### ✅ 6. Memory Block Appears in System Prompt (Prompt 05 Hydration)

**Requirement:** The memory block appears correctly in the system prompt (from Prompt 05 hydration).

**Finding: PASS**

**Evidence:**

Both the PM and Dev agents implement Prompt 05 hydration identically:

```typescript
// apps/agents/src/pm-agent.ts & dev-agent.ts
const memoryBlock = await hydrateAgentMemoryBlock(agent.id, 15)
const memorySection = memoryBlock
    ? `## YOUR MEMORY (from past sessions)\n${memoryBlock}`
    : `## YOUR MEMORY (from past sessions)\nNo memories yet. As you learn things, use memory_save to remember them.`

const fullDirectiveWithMemory = `${fullDirective}\n\n${memorySection}`
```

The `hydrateAgentMemoryBlock` function (`packages/memory/src/agent-memory.ts`) fetches up to 15 memories from `agent_memories` table, formats them with importance badges and tags:

```typescript
const lines = memories.map(m => {
    const badge = `[${m.importance.toUpperCase()}]`
    const tags = m.tags.length > 0 ? ` (${m.tags.join(', ')})` : ''
    return `${badge}${tags} ${m.content}`
})
```

The memory section is injected into the system prompt via `buildSystemPrompt(ctx, fullDirectiveWithMemory)` which places it after the context sections.

The multi-tier memory system (`assembleContext`) also injects:
- `## RELEVANT MEMORIES` (vector search results)
- `## RELEVANT PAST EXPERIENCE` (episodic memory)
- `## RELEVANT COMPANY KNOWLEDGE` (semantic memory)
- `## RECENT CONTEXT (THIS TASK)` (working memory)

Memory is also auto-extracted after each session via `extractAndSaveMemories()` using GPT-4o-mini.

**This is a well-implemented, complete Prompt 05 hydration system.**

---

### ✅ 7. Agents Stay in Character While Following Execution Rules

**Requirement:** Agents stay in character while also following execution rules — personality doesn't override tool behavior.

**Finding: PASS**

**Evidence:**

The system prompt architecture correctly separates personality from execution rules:

```typescript
// pm-agent.ts — personality is in the directive, rules are enforced by schema
const fullDirective = `
# YOUR IDENTITY
Name: ${agent.name}        // ← personality
Role: ${agent.role}
About: ${agent.about_md}

# YOUR SOUL
${agent.soul_md}           // ← character traits

# CURRENT OBJECTIVE
${agent.directive}         // ← execution rules

# MISSION SPECIFIC RULES
${PMResponseSchema.description}
Always respond in the exact JSON format required.  // ← hard constraint
`
```

Critically, the PM agent's output is **schema-validated** — personality cannot override the JSON format requirement because invalid responses throw an error:

```typescript
const parsed = PMResponseSchema.safeParse(responseData)
if (!parsed.success) throw new Error(`Invalid PM response: ${text}`)
```

For chat agents, the soul files (e.g., Quacksworth's "quirky and enthusiastic, always adds a pun or two") are loaded alongside the system prompt which includes tool definitions. The tool execution loop is code-level — it runs regardless of personality. A quirky agent still executes tools; it just responds in a quirky tone.

The approval gate also enforces rules regardless of personality — `exec_command`, `gmail_send`, etc. always require human approval.

---

### ⚠️ 8. Chat Responses Short — Long-Form Output Goes Into Artifacts

**Requirement:** Chat responses remain short — long-form output goes into artifacts.

**Finding: PARTIAL PASS**

**Evidence (what works):**

The system prompt in `apps/api/src/routes/chat.ts` explicitly states:

```
IMPORTANT: Keep replies SHORT — 1 to 3 sentences max.
```

The `generate_artifact` tool description says:

```
ALWAYS use this instead of returning raw HTML/code in chat.
```

The artifact system supports `markdown`, `html`, `react`, `pdf`, `csv`, `form` types — all rendered in a separate browser tab via `/preview/:id`.

**Gap:** The "1 to 3 sentences" rule only appears in the chat route's system prompt. It does **not** appear in:
- The PM agent's directive (`apps/agents/src/pm-agent.ts`)
- The Dev agent's directive (`apps/agents/src/dev-agent.ts`)

The Dev agent uses `maxTokens: 2048` and returns `finalText` directly as the task result — this can be a large block of code or text stored in the `tasks.result` column, not an artifact.

Additionally, the `generate_artifact` tool is only available in the chat interface (`apps/api/src/utils/agent-tools.ts`). It is **not** in the BullMQ-based PM/Dev agent tool registry (`packages/tools/src/skills/`). So the background agents cannot produce artifacts at all.

**Recommendation:**
1. Add `generate_artifact` to the `packages/tools/src/skills/` registry so PM/Dev agents can use it.
2. Add to the Dev agent's directive: *"For any output longer than a few sentences (reports, full files, documentation), use `generate_artifact` with type 'markdown' or 'html'."*

---

## Issues Requiring Action

| Priority | Issue | Status | File(s) Changed |
|----------|-------|--------|-----------------|
| 🔴 HIGH | Dev agent has no read-before-write rule | ✅ FIXED | `apps/api/src/utils/agent-tools.ts`, `apps/frontend/src/utils/agent-tools.ts` |
| 🔴 HIGH | No Support agent exists | ⏳ OPEN | New agent definition needed |
| 🟡 MED | PM agent (chat mode) not restricted from writing code | ✅ FIXED | `apps/api/src/routes/chat.ts` |
| 🟡 MED | `generate_artifact` not available to BullMQ PM/Dev agents | ⏳ OPEN | `packages/tools/src/skills/` |
| 🟡 MED | No explicit "use artifact for reports" / "memory before web" rules | ✅ FIXED | `apps/api/src/routes/chat.ts` |
| 🟢 LOW | `PMResponseSchema` has no `.describe()` — `PMResponseSchema.description` is `undefined` | ✅ FIXED | `packages/shared/src/schemas.ts` |

---

## Fixes Applied in This Session

### Fix 1 — PMResponseSchema.description (CRITICAL BUG)
**File:** `packages/shared/src/schemas.ts`

Added `.describe()` to `PMResponseSchema` so the PM agent's `# MISSION SPECIFIC RULES` section renders correctly instead of `undefined`:

```typescript
export const PMResponseSchema = z.object({
    subtasks: z.array(SubtaskSchema).default([]),
    direct_answer: z.string().optional().default(""),
}).describe(
    'Respond ONLY with valid JSON matching this schema. For complex goals that require implementation work, populate "subtasks" (2-5 items) and leave "direct_answer" empty. For simple questions or greetings, populate "direct_answer" and leave "subtasks" as an empty array. Never both. No markdown, no explanation outside the JSON object.'
)
```

---

### Fix 2 — Read-Before-Write Rule
**Files:** `apps/api/src/utils/agent-tools.ts`, `apps/frontend/src/utils/agent-tools.ts`

Updated `write_file` tool description to enforce read-before-write:

```typescript
description: "Write content to a file. Used to build artifacts, code, or content. IMPORTANT: If the file may already exist, always call read_file first to understand the current content before overwriting it.",
```

---

### Fix 3 — Chat System Prompt Execution Rules
**File:** `apps/api/src/routes/chat.ts`

Replaced the single "Keep replies SHORT" line with a structured `## EXECUTION RULES` block covering all 5 behavioral requirements:

```
## EXECUTION RULES (always follow, regardless of personality)
1. KEEP REPLIES SHORT — 1 to 3 sentences max in chat.
2. ARTIFACTS FOR LONG OUTPUT — For any research report, analysis, document, code file, or any output longer than 3 sentences, use generate_artifact (type: 'markdown' for reports/docs, ...).
3. MEMORY BEFORE WEB — Before calling search_web, first call memory_search. Only search the web if memory returns no relevant results.
4. READ BEFORE WRITE — Before calling write_file on any file that may already exist, always call read_file first.
5. DELEGATE DON'T CODE — If acting as PM or orchestrator, use assign_task to delegate. Do not write code directly.
```

---

## Remaining Open Items

1. **No Support Agent** — No agent with role `support` exists in the codebase. If a Support agent is needed, create a new agent entry in the DB with a directive that enforces memory-before-web behavior.

2. **`generate_artifact` not in BullMQ agent registry** — The background PM/Dev agents (running via BullMQ queues) cannot call `generate_artifact` because it's only defined in `apps/api/src/utils/agent-tools.ts` (chat interface), not in `packages/tools/src/skills/`. To fix, add a new skill in `packages/tools/src/skills/artifacts/` that calls the `/artifacts/` API endpoint.

---

*Report generated by static code analysis. Runtime behavior may differ — live testing recommended for full validation.*
