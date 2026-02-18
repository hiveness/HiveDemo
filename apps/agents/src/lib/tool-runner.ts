import { executeTool } from '@hive/tools'

const TOOL_CALL_REGEX = /<tool_call>([\s\S]*?)<\/tool_call>/g

export async function processToolCalls(
    text: string,
    context: { agentId: string; taskId: string }
): Promise<{ finalText: string; toolsUsed: string[] }> {
    const toolsUsed: string[] = []
    let result = text
    const matches = [...text.matchAll(TOOL_CALL_REGEX)]

    for (const match of matches) {
        let callJson: { tool: string; input: Record<string, unknown> }
        try {
            callJson = JSON.parse(match[1])
        } catch {
            continue
        }

        console.log(`[Tool] Executing: ${callJson.tool}`)

        // Inject _agent_id into the input for memory tools (and any future
        // tools that need agent-scoped access).  The underscore prefix signals
        // that this field is system-injected and should not be supplied by the
        // LLM.  Agents cannot override it because we always overwrite it here.
        const enrichedInput = {
            ...callJson.input,
            _agent_id: context.agentId,
            _task_id: context.taskId,
        }

        const output = await executeTool(callJson.tool, enrichedInput, context)
        toolsUsed.push(callJson.tool)

        // Replace the tool call block with the tool result or error
        const resultBlock = output.success
            ? `<tool_result tool="${callJson.tool}">\n${JSON.stringify(output.result, null, 2)}\n</tool_result>`
            : `<tool_error tool="${callJson.tool}">${output.error}</tool_error>`

        result = result.replace(match[0], resultBlock)
    }

    return { finalText: result, toolsUsed }
}
