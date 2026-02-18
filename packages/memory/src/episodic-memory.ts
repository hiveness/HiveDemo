import { supabase } from '@hive/db'
import type { Episode } from './types'

// Write a new episode after a task ends
export async function writeEpisode(episode: Omit<Episode, 'id' | 'created_at'>): Promise<void> {
    const { error } = await supabase.from('agent_episodes').insert(episode)
    if (error) console.error('[episodic] write failed:', error.message)
}

// Recall recent episodes for an agent — most important first, then most recent
export async function recallEpisodes(
    agentId: string,
    options: {
        limit?: number
        minImportance?: number
        episodeType?: Episode['episode_type']
    } = {}
): Promise<Episode[]> {
    const { limit = 10, minImportance = 3, episodeType } = options

    let query = supabase
        .from('agent_episodes')
        .select('*')
        .eq('agent_id', agentId)
        .gte('importance', minImportance)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)

    if (episodeType) query = query.eq('episode_type', episodeType)

    const { data, error } = await query
    if (error) { console.error('[episodic] recall failed:', error.message); return [] }
    return (data ?? []) as Episode[]
}

// After a human correction, write a high-importance episode
export async function recordCorrection(
    agentId: string,
    companyId: string,
    taskId: string,
    what_happened: string,
    what_should_have_happened: string
): Promise<void> {
    await writeEpisode({
        agent_id: agentId,
        company_id: companyId,
        task_id: taskId,
        episode_type: 'correction',
        summary: `CORRECTION: ${what_happened}. Should have: ${what_should_have_happened}`,
        outcome: 'failure',
        importance: 9,             // corrections are always high importance
        metadata: { what_happened, what_should_have_happened },
    })
}

// Promote an episode (e.g. founder liked the result)
export async function boostEpisode(episodeId: string, newImportance: number): Promise<void> {
    await supabase
        .from('agent_episodes')
        .update({ importance: Math.min(newImportance, 10) })
        .eq('id', episodeId)
}
