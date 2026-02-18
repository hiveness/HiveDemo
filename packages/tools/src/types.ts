export interface ToolInput { [key: string]: unknown }
export interface ToolOutput {
    success: boolean
    result?: unknown
    error?: string
}

export interface ToolDefinition {
    name: string
    description: string
    category: 'research' | 'code' | 'data' | 'communication'
    inputSchema: Record<string, { type: string; description: string; required?: boolean }>
    execute: (input: ToolInput) => Promise<ToolOutput>
}

export interface SkillManifest {
    name: string
    display_name: string
    description: string
    version: string
    icon: string
    category: 'research' | 'code' | 'data' | 'communication' | 'automation'
    requires_auth?: boolean
    config_schema?: Record<string, { type: string; secret?: boolean }>
    enabled_by_default?: boolean
}

export interface Skill {
    manifest: SkillManifest
    tools: ToolDefinition[]
}
