import { sendEmailTool } from './tool'
import manifest from './skill.json'
import { Skill } from '../../types'

export const emailSkill: Skill = {
    manifest: manifest as any,
    tools: [sendEmailTool]
}

export default emailSkill
