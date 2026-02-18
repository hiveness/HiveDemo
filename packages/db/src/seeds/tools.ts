import 'dotenv/config'
import { supabase } from '../client'

const TOOLS = [
    {
        name: 'web_search',
        description: 'Search the web for current information, news, and research.',
        category: 'research',
        requires_key: 'BRAVE_SEARCH_API_KEY',
        policy_level: 'auto',
        input_schema: { query: 'string', max_results: 'number?' },
        output_schema: { results: 'array' },
    },
    {
        name: 'fetch_url',
        description: 'Fetch the content of any webpage or API endpoint.',
        category: 'research',
        requires_key: null,
        policy_level: 'auto',
        input_schema: { url: 'string', max_chars: 'number?' },
        output_schema: { content: 'string', truncated: 'boolean' },
    },
    {
        name: 'github_read_file',
        description: 'Read a file from a GitHub repository.',
        category: 'code',
        requires_key: 'GITHUB_TOKEN',
        policy_level: 'auto',
        input_schema: { owner: 'string', repo: 'string', path: 'string' },
        output_schema: { content: 'string', sha: 'string' },
    },
    {
        name: 'github_create_file',
        description: 'Create or update a file in a GitHub repository.',
        category: 'code',
        requires_key: 'GITHUB_TOKEN',
        policy_level: 'approval_required',
        input_schema: { owner: 'string', repo: 'string', path: 'string', content: 'string', message: 'string' },
        output_schema: { sha: 'string', url: 'string' },
    },
    {
        name: 'github_create_pr',
        description: 'Create a pull request in a GitHub repository.',
        category: 'code',
        requires_key: 'GITHUB_TOKEN',
        policy_level: 'approval_required',
        input_schema: { owner: 'string', repo: 'string', title: 'string', body: 'string', head: 'string' },
        output_schema: { number: 'number', url: 'string' },
    },
    {
        name: 'memory_query',
        description: 'Search company memory for past decisions and knowledge.',
        category: 'data',
        requires_key: null,
        policy_level: 'auto',
        input_schema: { query: 'string', company_id: 'string', limit: 'number?' },
        output_schema: { results: 'array' },
    },
    {
        name: 'send_email',
        description: 'Send an email to one or more recipients.',
        category: 'communication',
        requires_key: 'RESEND_API_KEY',
        policy_level: 'auto',
        input_schema: { to: 'string', subject: 'string', body: 'string' },
        output_schema: { id: 'string' },
    },
]

async function seed() {
    for (const tool of TOOLS) {
        const { error } = await supabase.from('tools').upsert(tool, { onConflict: 'name' })
        if (error) console.error(`Failed to seed ${tool.name}:`, error.message)
        else console.log(`Seeded: ${tool.name}`)
    }
    console.log('Done.')
    process.exit(0)
}

seed().catch(console.error)
