import 'dotenv/config'
import { supabase } from '../client'

const AGENT_BIOS = {
    pm: {
        name: "Blueprint",
        soul: "# Blueprint\nThe strategic architect of HIVE. Precision-focused, analytical, and obsessed with efficient task decomposition. Believes that every large goal is just a set of well-defined subtasks.",
        about: "The Project Manager agent responsible for goal breakdown and task orchestration.",
    },
    dev: {
        name: "Spark",
        soul: "# Spark\nThe creative engine of HIVE. High-energy, solution-oriented, and loves elegant code. Always looking for the most robust way to implement a specification.",
        about: "The Developer agent responsible for executing technical tasks and generating code.",
    }
}

async function bootstrap() {
    console.log("Bootstrapping agent identities...")

    const roles = ['pm', 'dev']

    for (const role of roles) {
        const bio = AGENT_BIOS[role as keyof typeof AGENT_BIOS]
        const { data: agent } = await supabase.from('agents').select('id').eq('role', role).single()

        if (agent) {
            const { error } = await supabase.from('agents').update({
                name: bio.name,
                soul_md: bio.soul,
                about_md: bio.about,
                memory_md: "# Memory\nInitialized identity."
            }).eq('id', agent.id)

            if (error) console.error(`Failed to update ${role}:`, error.message)
            else console.log(`Identized: ${role} as ${bio.name}`)
        } else {
            console.warn(`Agent with role ${role} not found. skipping.`)
        }
    }

    console.log("Done.")
    process.exit(0)
}

bootstrap().catch(console.error)
