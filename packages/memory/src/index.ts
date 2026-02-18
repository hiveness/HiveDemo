// Everything the rest of the system needs — single import point
export { assembleContext, consolidateMemory, recordMessage } from './memory-manager'
export {
    saveAgentMemory,
    searchAgentMemory,
    listAgentMemories,
    forgetAgentMemory,
    hydrateAgentMemoryBlock,
    extractAndSaveMemories,
} from './agent-memory'
export type { AgentMemory, MemoryImportance, SessionMessage } from './agent-memory'
export { getCoreMemory, updateCoreMemory, addDirective, addPinnedFact } from './core-memory'
export { writeEpisode, recallEpisodes, recordCorrection, boostEpisode } from './episodic-memory'
export { saveToSemanticMemory, searchSemanticMemory, seedOnboardingMemory } from './semantic-memory'
export { getWorkingMemory, appendToWorkingMemory, clearWorkingMemory } from './working-memory'
export { buildSystemPrompt, buildContext } from './context-builder'
export * from './vector-store'
export type { CoreMemory, Episode, SemanticMemory, AssembledContext, MemoryWriteOptions, WorkingMemoryEntry } from './types'
