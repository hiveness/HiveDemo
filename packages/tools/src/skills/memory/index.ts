import { memoryQueryTool, memorySaveTool, memorySearchTool, memoryForgetTool } from './tool'
import manifest from './skill.json'
import { Skill } from '../../types'

export const memorySkill: Skill = {
    manifest: manifest as any,
    tools: [memoryQueryTool, memorySaveTool, memorySearchTool, memoryForgetTool]
}

export default memorySkill
