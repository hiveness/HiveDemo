import { ALL_SKILLS } from './skills'
import { supabase } from '@hive/db'
import type { ToolDefinition, ToolInput, ToolOutput } from './types'

export function getToolDefinitions(enabledSkillNames?: string[]): ToolDefinition[] {
    const skills = enabledSkillNames
        ? ALL_SKILLS.filter(s => s.manifest.enabled_by_default || enabledSkillNames.includes(s.manifest.name))
        : ALL_SKILLS

    return skills.flatMap(s => s.tools)
}

export function getTool(name: string): ToolDefinition | undefined {
    for (const skill of ALL_SKILLS) {
        const tool = skill.tools.find(t => t.name === name)
        if (tool) return tool
    }
    return undefined
}

// Format tool definitions for injection into agent system prompt
export function buildToolsPrompt(enabledSkillNames?: string[]): string {
    const defs = getToolDefinitions(enabledSkillNames)
    const lines = defs.map(t => {
        const params = Object.entries(t.inputSchema)
            .map(([k, v]) => `  ${k}${v.required ? '*' : ''}: ${v.type} — ${v.description}`)
            .join('\n')
        return `### ${t.name}\n${t.description}\nInputs (* = required):\n${params}`
    })

    return `## TOOLS AVAILABLE\nYou can call these tools by including a JSON block in your response.\nFormat: <tool_call>{"tool": "tool_name", "input": {...}}</tool_call>\n\n${lines.join('\n\n')}`
}

// Execute a tool call and log it
export async function executeTool(
    toolName: string,
    input: ToolInput,
    context: { agentId?: string; taskId?: string }
): Promise<ToolOutput> {
    const tool = getTool(toolName)
    if (!tool) return { success: false, error: `Tool "${toolName}" not found` }

    // Check if tool is enabled in DB
    const { data: dbTool } = await supabase
        .from('tools')
        .select('enabled, policy_level')
        .eq('name', toolName)
        .single()

    if (dbTool && !dbTool.enabled) return { success: false, error: `Tool "${toolName}" is disabled` }
    if (dbTool?.policy_level === 'blocked') return { success: false, error: `Tool "${toolName}" is blocked by policy` }

    const start = Date.now()
    let output: ToolOutput

    try {
        output = await tool.execute(input)
    } catch (err: any) {
        output = { success: false, error: err.message }
    }

    const latency = Date.now() - start

    // Log the call
    await supabase.from('tool_calls').insert({
        tool_name: toolName,
        agent_id: context.agentId,
        task_id: context.taskId,
        input,
        output,
        success: output.success,
        error_message: output.error,
        latency_ms: latency,
    })

    return output
}
