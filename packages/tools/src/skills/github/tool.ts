import { Octokit } from '@octokit/rest'
import type { ToolDefinition, ToolOutput } from '../../types'

function getOctokit() {
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN not set')
    return new Octokit({ auth: token })
}

export const githubReadFileTool: ToolDefinition = {
    name: 'github_read_file',
    description: 'Read a file from a GitHub repository.',
    category: 'code',
    inputSchema: {
        owner: { type: 'string', description: 'Repo owner', required: true },
        repo: { type: 'string', description: 'Repo name', required: true },
        path: { type: 'string', description: 'File path', required: true },
        branch: { type: 'string', description: 'Branch name', required: false },
    },

    async execute({ owner, repo, path, branch = 'main' }): Promise<ToolOutput> {
        try {
            const octokit = getOctokit()
            const { data } = await octokit.repos.getContent({
                owner: String(owner), repo: String(repo),
                path: String(path), ref: String(branch),
            })

            if ('content' in data && typeof data.content === 'string') {
                const content = Buffer.from(data.content, 'base64').toString('utf-8')
                return { success: true, result: { path, content, sha: data.sha } }
            }

            return { success: false, error: 'Not a file or content unavailable' }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}

export const githubCreateFileTool: ToolDefinition = {
    name: 'github_create_file',
    description: 'Create or update a file in a GitHub repository.',
    category: 'code',
    inputSchema: {
        owner: { type: 'string', description: 'Repo owner', required: true },
        repo: { type: 'string', description: 'Repo name', required: true },
        path: { type: 'string', description: 'File path', required: true },
        content: { type: 'string', description: 'File content', required: true },
        message: { type: 'string', description: 'Commit message', required: true },
        branch: { type: 'string', description: 'Branch (default main)', required: false },
        sha: { type: 'string', description: 'Existing file SHA for updates', required: false },
    },

    async execute({ owner, repo, path, content, message, branch = 'main', sha }): Promise<ToolOutput> {
        try {
            const octokit = getOctokit()
            const encoded = Buffer.from(String(content)).toString('base64')

            const { data } = await octokit.repos.createOrUpdateFileContents({
                owner: String(owner),
                repo: String(repo),
                path: String(path),
                message: String(message),
                content: encoded,
                branch: String(branch),
                sha: sha ? String(sha) : undefined,
            })

            return { success: true, result: { sha: data.content?.sha, url: data.content?.html_url } }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}

export const githubCreatePRTool: ToolDefinition = {
    name: 'github_create_pr',
    description: 'Create a pull request in a GitHub repository.',
    category: 'code',
    inputSchema: {
        owner: { type: 'string', description: 'Repo owner', required: true },
        repo: { type: 'string', description: 'Repo name', required: true },
        title: { type: 'string', description: 'PR title', required: true },
        body: { type: 'string', description: 'PR body', required: true },
        head: { type: 'string', description: 'Head branch', required: true },
        base: { type: 'string', description: 'Base branch', required: false },
    },

    async execute({ owner, repo, title, body, head, base = 'main' }): Promise<ToolOutput> {
        try {
            const octokit = getOctokit()
            const { data } = await octokit.pulls.create({
                owner: String(owner), repo: String(repo),
                title: String(title), body: String(body),
                head: String(head), base: String(base),
            })
            return { success: true, result: { number: data.number, url: data.html_url } }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}
