import { gmailListMessagesTool, gmailSendMessageTool } from './tool';
import manifest from './skill.json';
import { Skill } from '../../types';

export const gmailSkill: Skill = {
    manifest: manifest as any,
    tools: [gmailListMessagesTool, gmailSendMessageTool]
};

export default gmailSkill;
