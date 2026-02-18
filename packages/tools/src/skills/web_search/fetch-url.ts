import axios from 'axios'
import type { ToolDefinition, ToolOutput } from '../../types'

export const fetchUrlTool: ToolDefinition = {
    name: 'fetch_url',
    description: 'Fetch the text content of a webpage or API endpoint.',
    category: 'research',
    inputSchema: {
        url: { type: 'string', description: 'URL to fetch', required: true },
        max_chars: { type: 'number', description: 'Max characters to return (default: 3000)', required: false },
    },

    async execute({ url, max_chars = 3000 }): Promise<ToolOutput> {
        try {
            const { data, headers } = await axios.get(String(url), {
                timeout: 10_000,
                headers: { 'User-Agent': 'HIVE-Agent/1.0 (AI research assistant)' },
                maxContentLength: 500_000,
            })

            let text: string
            const contentType = headers['content-type'] ?? ''

            if (contentType.includes('json')) {
                text = JSON.stringify(data, null, 2)
            } else if (typeof data === 'string') {
                // Strip HTML tags
                text = data
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim()
            } else {
                text = String(data)
            }

            return {
                success: true,
                result: {
                    url,
                    content: text.slice(0, Number(max_chars)),
                    truncated: text.length > Number(max_chars),
                    content_type: contentType,
                }
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}
