import type { AssembledContext } from './types'

export function buildContext(ctx: AssembledContext): string {
    const sections: string[] = []

    // ── Core Memory (always first)
    sections.push(`## WHO YOU ARE
Name: ${ctx.core.identity.name}
Role: ${ctx.core.identity.role}
Persona: ${ctx.core.identity.persona}`)

    sections.push(`## YOUR COMPANY
Name: ${ctx.core.company.name}
What we do: ${ctx.core.company.description}
Industry: ${ctx.core.company.industry}
Stage: ${ctx.core.company.stage}
Core values: ${ctx.core.company.core_values.join(', ')}`)

    if (ctx.core.current_directives.length > 0) {
        sections.push(`## STANDING ORDERS\n${ctx.core.current_directives.map(d => `- ${d}`).join('\n')}`)
    }

    if (ctx.core.pinned_facts.length > 0) {
        sections.push(`## ALWAYS REMEMBER\n${ctx.core.pinned_facts.map(f => `- ${f}`).join('\n')}`)
    }

    // ── Episodic Memory
    if (ctx.episodes.length > 0) {
        const lines = ctx.episodes.map(e =>
            `[${e.outcome ?? 'unknown'} | importance:${e.importance}] ${e.summary}`
        )
        sections.push(`## RELEVANT PAST EXPERIENCE\n${lines.join('\n')}`)
    }

    // ── Semantic Memory
    if (ctx.semantic.length > 0) {
        const lines = ctx.semantic.map(s =>
            `[${s.scope} | relevance:${s.similarity?.toFixed(2) ?? '?'}] ${s.content}`
        )
        sections.push(`## RELEVANT COMPANY KNOWLEDGE\n${lines.join('\n')}`)
    }

    // ── Working Memory (recent task messages — last, closest to the task)
    if (ctx.working.length > 0) {
        const lines = ctx.working.map(w => `[${w.role}]: ${w.content}`)
        sections.push(`## RECENT CONTEXT (THIS TASK)\n${lines.join('\n')}`)
    }

    return sections.join('\n\n')
}

// Returns just the system prompt string ready to pass to the model
export function buildSystemPrompt(ctx: AssembledContext, baseDirective: string): string {
    return `${buildContext(ctx)}\n\n---\n\n## YOUR TASK\n${baseDirective}`
}
