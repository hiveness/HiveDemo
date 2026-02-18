import axios from 'axios'
import type { ToolDefinition, ToolOutput } from '../../types'

export const webSearchTool: ToolDefinition = {
    name: 'web_search',
    description: 'Search the web for current information, news, research, and facts.',
    category: 'research',
    inputSchema: {
        query: { type: 'string', description: 'Search query', required: true },
        max_results: { type: 'number', description: 'Max results to return (default: 5)', required: false },
    },

    async execute({ query, max_results = 5 }): Promise<ToolOutput> {
        const apiKey = process.env.BRAVE_SEARCH_API_KEY
        if (!apiKey) return { success: false, error: 'BRAVE_SEARCH_API_KEY not set' }

        try {
            const { data } = await axios.get('https://api.search.brave.com/res/v1/web/search', {
                headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
                params: { q: query, count: Math.min(Number(max_results), 10) },
            })

            const results = (data.web?.results ?? []).map((r: any) => ({
                title: r.title,
                url: r.url,
                snippet: r.description,
            }))

            return { success: true, result: results }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}
