import { Resend } from 'resend'
import type { ToolDefinition, ToolOutput } from '../../types'

export const sendEmailTool: ToolDefinition = {
    name: 'send_email',
    description: 'Send an email to one or more recipients.',
    category: 'communication',
    inputSchema: {
        to: { type: 'string', description: 'Recipient email address (comma-separated for multiple)', required: true },
        subject: { type: 'string', description: 'Email subject', required: true },
        body: { type: 'string', description: 'Email body (HTML or plain text)', required: true },
        from: { type: 'string', description: 'Sender address (optional, must be verified in Resend)', required: false },
    },

    async execute({ to, subject, body, from }): Promise<ToolOutput> {
        const apiKey = process.env.RESEND_API_KEY
        if (!apiKey) return { success: false, error: 'RESEND_API_KEY not set' }

        const resend = new Resend(apiKey)

        try {
            const { data, error } = await resend.emails.send({
                from: (from as string) || 'HIVE Agent <onboarding@resend.dev>',
                to: (to as string).split(',').map(e => e.trim()),
                subject: String(subject),
                html: String(body),
            })

            if (error) return { success: false, error: error.message }
            return { success: true, result: { id: data?.id } }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}
