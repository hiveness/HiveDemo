import { githubReadFileTool, githubCreateFileTool, githubCreatePRTool } from './tool'
import manifest from './skill.json'
import { Skill } from '../../types'

export const githubSkill: Skill = {
    manifest: manifest as any,
    tools: [githubReadFileTool, githubCreateFileTool, githubCreatePRTool]
}

export default githubSkill
