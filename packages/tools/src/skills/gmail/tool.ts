import { google } from 'googleapis';
import type { ToolDefinition, ToolOutput } from '../../types';
import { getGoogleAuth } from '../../utils/auth';

export const gmailListMessagesTool: ToolDefinition = {
    name: 'gmail_list_messages',
    description: 'Search and list Gmail messages.',
    category: 'communication',
    inputSchema: {
        query: { type: 'string', description: 'Gmail search query (e.g. "from:boss", "subject:urgent")', required: true },
        max_results: { type: 'number', description: 'Max results to return (default: 5)', required: false },
    },

    async execute({ query, max_results = 5 }): Promise<ToolOutput> {
        try {
            const auth = await getGoogleAuth();
            const gmail = google.gmail({ version: 'v1', auth });

            const { data } = await gmail.users.messages.list({
                userId: 'me',
                q: String(query),
                maxResults: Number(max_results),
            });

            const messages = await Promise.all(
                (data.messages ?? []).map(async (m) => {
                    const { data: detail } = await gmail.users.messages.get({
                        userId: 'me',
                        id: m.id!,
                        format: 'minimal'
                    });
                    return { id: m.id, snippet: detail.snippet };
                })
            );

            return { success: true, result: messages };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
};

export const gmailSendMessageTool: ToolDefinition = {
    name: 'gmail_send_message',
    description: 'Send an email via Gmail.',
    category: 'communication',
    inputSchema: {
        to: { type: 'string', description: 'Recipient email address', required: true },
        subject: { type: 'string', description: 'Email subject', required: true },
        body: { type: 'string', description: 'Email body', required: true },
    },

    async execute({ to, subject, body }): Promise<ToolOutput> {
        try {
            const auth = await getGoogleAuth();
            const gmail = google.gmail({ version: 'v1', auth });

            const utf8Subject = `=?utf-8?B?${Buffer.from(String(subject)).toString('base64')}?=`;
            const messageParts = [
                `To: ${to}`,
                `Subject: ${utf8Subject}`,
                'Content-Type: text/html; charset=utf-8',
                'MIME-Version: 1.0',
                '',
                body,
            ];
            const message = messageParts.join('\n');
            const encodedMessage = Buffer.from(message)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const { data } = await gmail.users.messages.send({
                userId: 'me',
                requestBody: { raw: encodedMessage },
            });

            return { success: true, result: { id: data.id } };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
};
