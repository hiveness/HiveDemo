import { createClient } from "@/utils/supabase/server";
import fs from "fs";
import path from "path";

export async function GET() {
    const supabase = await createClient();

    const agents = [
        { id: 'orchestrator', name: 'Antigravity', folder: 'orchestrator' },
        { id: 'agent2', name: 'Mallory', folder: 'agent2' },
        { id: 'agent1', name: 'Quacksworth', folder: 'agent1' }
    ];

    const results = [];

    for (const agent of agents) {
        try {
            const agentPath = path.join(process.cwd(), "agents", agent.folder);
            const soul = fs.readFileSync(path.join(agentPath, "soul.md"), "utf8");
            const personality = JSON.parse(fs.readFileSync(path.join(agentPath, "personality.json"), "utf8"));

            const { data, error } = await supabase
                .from('agents')
                .upsert({
                    agent_id: agent.id,
                    name: agent.name,
                    role: personality.role,
                    type: personality.appearance.type,
                    tint: personality.appearance.tint,
                    soul: soul,
                    personality: personality,
                    version: '1.0.0'
                }, { onConflict: 'agent_id' })
                .select();

            if (error) throw error;
            results.push({ agent: agent.name, status: 'Success', id: data[0].id });
        } catch (e: any) {
            results.push({ agent: agent.name, status: 'Error', message: e.message });
        }
    }

    return Response.json({ message: "Seeding complete", results });
}
