import { z } from 'zod'

export const CreateGoalSchema = z.object({
    goal: z.string().min(5).max(2000),
    budget_usd: z.number().min(0.01).max(100).default(2),
})

export const SubtaskSchema = z.object({
    title: z.string(),
    spec: z.string(),
    acceptance_criteria: z.array(z.string()),
    estimated_cost_usd: z.number(),
})

export const PMResponseSchema = z.object({
    subtasks: z.array(SubtaskSchema).default([]),
    direct_answer: z.string().optional(),
})

export type CreateGoal = z.infer<typeof CreateGoalSchema>
export type Subtask = z.infer<typeof SubtaskSchema>
export type PMResponse = z.infer<typeof PMResponseSchema>
