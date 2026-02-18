export interface Integration {
    name: string;
    description: string;
    scopes: string[];
    auth_type: 'oauth2' | 'api_key';
    icon: string;
}

export const INTEGRATION_REGISTRY: Record<string, Integration> = {
    gmail: {
        name: 'Gmail',
        description: 'Read, send, and watch Gmail messages.',
        scopes: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.modify'
        ],
        auth_type: 'oauth2',
        icon: '📧'
    },
    notion: {
        name: 'Notion',
        description: 'Read and write to Notion pages and databases.',
        scopes: [],
        auth_type: 'oauth2',
        icon: '📝'
    },
    github: {
        name: 'GitHub',
        description: 'Access repositories, create issues, and manage PRs.',
        scopes: ['repo', 'user'],
        auth_type: 'oauth2',
        icon: '🐙'
    }
};

export default INTEGRATION_REGISTRY;
