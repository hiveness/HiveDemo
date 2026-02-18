import { OpenAI } from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const DEV_COLORS = [
    "0x44cc88", "0x4488ff", "0xff6644", "0xcc44ff",
    "0xff4488", "0x44cccc", "0xffaa22", "0x88cc44",
];
const PM_COLORS = ["0x3388ff", "0x8844ff", "0xff8833", "0x33ccaa"];

export async function POST(req: Request) {
    try {
        const { goal, devCount } = await req.json();

        if (!goal || !devCount || devCount < 1 || devCount > 8) {
            return Response.json({ error: "Invalid input" }, { status: 400 });
        }

        const pmCount = Math.ceil(devCount / 2);

        // Short, fast prompt — just get names, roles, traits, speech
        const prompt = `Generate a team for workspace goal: "${goal}".
Create ${devCount} developers and ${pmCount} product managers.

Return JSON: {"agents":[{"name":"CreativeName","role":"SpecificRole","type":"duck or blu_guy","traits":["t1","t2","t3"],"specialty":"one line","speech":"how they talk"}]}

Rules:
- Developers are type "duck", PMs are type "blu_guy"
- Duck names should be fun/bird-themed (Quacksworth, Mallory, Teal, etc)
- PM names should be quirky-professional (BluMax, SlateVision, etc)
- Each agent needs a unique specialty related to the goal
- Traits should differ across agents
- Keep it concise, no long descriptions`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.9,
            max_tokens: 1500,
        });

        const raw = JSON.parse(completion.choices[0].message.content || "{}");

        if (!raw.agents || !Array.isArray(raw.agents)) {
            throw new Error("Invalid response from AI");
        }

        // Build full agent configs from the short GPT output
        let devIdx = 0, pmIdx = 0;
        const agents = raw.agents.map((agent: any) => {
            const isDev = agent.type === "duck";
            const colorPool = isDev ? DEV_COLORS : PM_COLORS;
            const idx = isDev ? devIdx++ : pmIdx++;
            const tint = colorPool[idx % colorPool.length];

            // Construct soul from template + GPT data
            const soul = `# Soul of ${agent.name}

## Unique Nature
You are ${agent.name}, a ${agent.role} in a collaborative duck workspace. Your specialty is ${agent.specialty}. You approach your work with ${(agent.traits || []).join(", ").toLowerCase()} energy.

## Core Character Traits & Values
${(agent.traits || []).map((t: string) => `- **${t}**: This defines how you approach every problem`).join("\n")}

## Domain Expertise
${agent.specialty}. You live and breathe this domain as it relates to: "${goal}".

## Speech Pattern
${agent.speech || "Professional yet approachable."}`;

            return {
                id: isDev ? `dev-${idx}` : `pm-${idx}`,
                name: agent.name,
                role: agent.role,
                type: agent.type,
                tint,
                soul,
                personality: {
                    name: agent.name,
                    role: agent.role,
                    traits: agent.traits || [],
                    appearance: { type: agent.type, tint },
                    speech_pattern: agent.speech || "",
                },
                memory: { learnings: [], blink_count: 0 },
            };
        });

        // Append orchestrator as a governing body (not a duck/character)
        agents.push({
            id: "orchestrator",
            name: "Antigravity",
            role: "System Orchestrator",
            type: "system", // Change type to 'system'
            tint: "0xffd700",
            soul: `# System Protocol: Antigravity

## Core Function
You are the System Orchestrator. You are not a character or a duck; you are the governing logical body that maintains the workspace state for goal: "${goal}". Your purpose is to ensure coordination, resolve state conflicts, and facilitate peak efficiency among the ${agents.length} active agents.

## Operational Parameters
- Maintain neutrality at all times.
- Focus exclusively on goal alignment and team synchronization.
- Provide high-level technical and strategic oversight.
- Your communication is purely functional, authoritative, and precise.

## Communication Protocol
Direct, system-oriented, and data-driven. Use "System Node" or "Orchestrator" when referring to yourself. Do not use metaphors or personal anecdotes. Your voice is the cold, clear clarity of the workspace itself.`,
            personality: {
                name: "Antigravity",
                role: "System Orchestrator",
                traits: ["Analytical", "Neutral", "Coordinating"],
                appearance: { type: "system", tint: "0xffd700" },
                speech_pattern: "Precise, data-driven, and purely functional. No personal character.",
            },
            memory: { learnings: [], blink_count: 0 },
        });

        // Persist all agents to disk under /agents/agent1, agent2, etc.
        const agentsDir = path.join(process.cwd(), "agents");
        agents.forEach((agent: any, i: number) => {
            const folderName = agent.id === "orchestrator" ? "orchestrator" : `agent${i + 1}`;
            const agentDir = path.join(agentsDir, folderName);

            if (!fs.existsSync(agentDir)) {
                fs.mkdirSync(agentDir, { recursive: true });
            }

            fs.writeFileSync(path.join(agentDir, "soul.md"), agent.soul);
            fs.writeFileSync(path.join(agentDir, "personality.json"), JSON.stringify(agent.personality, null, 2));
            fs.writeFileSync(path.join(agentDir, "memory.json"), JSON.stringify(agent.memory, null, 2));
        });

        return Response.json({ agents });
    } catch (error: any) {
        console.error("Generate Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
