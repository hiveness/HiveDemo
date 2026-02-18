import { webSearchTool } from './tool'
import { fetchUrlTool } from './fetch-url'
import manifest from './skill.json'
import { Skill } from '../../types'

export const webSearchSkill: Skill = {
    manifest: manifest as any,
    tools: [webSearchTool, fetchUrlTool]
}

export default webSearchSkill
