import { z } from 'zod'

export const CreateGoalSchema = z.object({
    goal: z.string().min(5).max(2000),
    budget_usd: z.number().min(0.01).max(100).default(2),
    integrations: z.record(z.boolean()).optional().default({}),
})

export const SubtaskSchema = z.object({
    title: z.string().optional(),
    task: z.string().optional(),
    spec: z.string().optional(),
    description: z.string().optional(),
    details: z.string().optional(),
    acceptance_criteria: z.array(z.string()).default([]),
    estimated_cost_usd: z.union([z.number(), z.string()]).optional().default(0),
}).passthrough().transform((data) => ({
    title: data.title || data.task || data.description || "Untitled Task",
    spec: data.spec || data.description || data.details || "",
    acceptance_criteria: data.acceptance_criteria,
    estimated_cost_usd: typeof data.estimated_cost_usd === 'string' ? parseFloat(data.estimated_cost_usd) || 0 : data.estimated_cost_usd,
}))

export const PMResponseSchema = z.object({
    subtasks: z.array(SubtaskSchema).default([]),
    direct_answer: z.string().optional().default(""),
}).describe(
    'Respond ONLY with valid JSON matching this schema. For complex goals that require implementation work, populate "subtasks" (2-5 items) and leave "direct_answer" empty. For simple questions or greetings, populate "direct_answer" and leave "subtasks" as an empty array. Never both. No markdown, no explanation outside the JSON object.'
)

export type CreateGoal = z.infer<typeof CreateGoalSchema>
export type Subtask = z.infer<typeof SubtaskSchema>
export type PMResponse = z.infer<typeof PMResponseSchema>
