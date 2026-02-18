import githubSkill from './github'
import memorySkill from './memory'
import emailSkill from './email'
import gmailSkill from './gmail'
import webSearchSkill from './web_search'
import { Skill } from '../types'

export const ALL_SKILLS: Skill[] = [
    webSearchSkill,
    githubSkill,
    memorySkill,
    emailSkill,
    gmailSkill
]

export function getEnabledSkills(enabledNames: string[]): Skill[] {
    return ALL_SKILLS.filter(s => s.manifest.enabled_by_default || enabledNames.includes(s.manifest.name))
}

export default ALL_SKILLS
