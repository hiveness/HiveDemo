import { supabase } from '@hive/db'
import type { CoreMemory } from './types'

export async function getCoreMemory(agentId: string): Promise<CoreMemory | null> {
    const { data, error } = await supabase
        .from('agents')
        .select('core_memory, name, role, persona, companies(name, description, industry, stage, core_values)')
        .eq('id', agentId)
        .single()

    if (error || !data) return null

    // Merge DB fields into typed CoreMemory shape
    const cm = data.core_memory as Partial<CoreMemory>
    const company = (data as any).companies

    return {
        identity: {
            name: data.name,
            role: data.role,
            persona: data.persona ?? cm.identity?.persona ?? 'Professional and efficient.',
        },
        company: {
            name: company?.name ?? cm.company?.name ?? 'Unknown',
            description: company?.description ?? cm.company?.description ?? '',
            industry: company?.industry ?? cm.company?.industry ?? '',
            stage: company?.stage ?? cm.company?.stage ?? 'idea',
            core_values: company?.core_values ?? cm.company?.core_values ?? [],
        },
        current_directives: cm.current_directives ?? [],
        pinned_facts: cm.pinned_facts ?? [],
    }
}

export async function updateCoreMemory(
    agentId: string,
    patch: Partial<CoreMemory>
): Promise<void> {
    const current = await getCoreMemory(agentId)
    if (!current) throw new Error(`Agent ${agentId} not found`)

    const updated = deepMerge(current, patch)

    await supabase
        .from('agents')
        .update({ core_memory: updated })
        .eq('id', agentId)
}

export async function addDirective(agentId: string, directive: string): Promise<void> {
    const mem = await getCoreMemory(agentId)
    if (!mem) return
    const directives = [...(mem.current_directives ?? []), directive].slice(-10) // keep last 10
    await updateCoreMemory(agentId, { current_directives: directives })
}

export async function addPinnedFact(agentId: string, fact: string): Promise<void> {
    const mem = await getCoreMemory(agentId)
    if (!mem) return
    const facts = [...(mem.pinned_facts ?? []), fact].slice(-20) // keep last 20
    await updateCoreMemory(agentId, { pinned_facts: facts })
}

function deepMerge(target: any, source: any): any {
    const output = { ...target }
    for (const key of Object.keys(source ?? {})) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            output[key] = deepMerge(target[key] ?? {}, source[key])
        } else {
            output[key] = source[key]
        }
    }
    return output
}
