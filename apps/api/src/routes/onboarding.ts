import type { FastifyInstance } from 'fastify'
import { supabase } from '@hive/db'
import { seedOnboardingMemory, updateCoreMemory } from '@hive/memory'
import { z } from 'zod'

const OnboardingSchema = z.object({
    name: z.string(),
    description: z.string(),
    industry: z.string(),
    stage: z.string(), // 'idea' | 'mvp' | 'growth' | 'scale'
    core_values: z.array(z.string()),
    founder_id: z.string().optional(),
})

export async function onboardingRoutes(app: FastifyInstance) {
    app.post('/', async (req, reply) => {
        const body = OnboardingSchema.safeParse(req.body)
        if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

        const companyData = body.data

        // 1. Create company
        const { data: company, error: companyError } = await supabase
            .from('companies')
            .insert(companyData)
            .select()
            .single()

        if (companyError || !company) {
            app.log.error(companyError)
            return reply.status(500).send({ error: 'Failed to create company' })
        }

        // 2. Associate existing agents with this company for Phase 2 demo
        // In a real multi-tenant app, we'd create new agents per company
        const { data: agents } = await supabase.from('agents').select('id')

        if (agents) {
            const onboardingFacts = [
                `Company name: ${company.name}`,
                `What we build: ${company.description}`,
                `Industry: ${company.industry}`,
                `Stage: ${company.stage}`,
                `Core values: ${company.core_values.join(', ')}`,
            ]

            for (const agent of agents) {
                // Associate agent with company
                await supabase.from('agents').update({ company_id: company.id }).eq('id', agent.id)

                // Seed semantic memory
                await seedOnboardingMemory(company.id, agent.id, onboardingFacts)

                // Set core memory with company context
                await updateCoreMemory(agent.id, {
                    company: {
                        name: company.name,
                        description: company.description,
                        industry: company.industry,
                        stage: company.stage,
                        core_values: company.core_values,
                    },
                    pinned_facts: onboardingFacts,
                })
            }
        }

        return reply.status(201).send({ company_id: company.id, status: 'onboarded' })
    })
}
