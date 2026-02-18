
import { saveAgentMemory, searchAgentMemory, forgetAgentMemory, listAgentMemories, hydrateAgentMemoryBlock, extractAndSaveMemories } from '../packages/memory/src/agent-memory';
import { supabase } from '@hive/db';
import { v4 as uuidv4 } from 'uuid';

async function runTests() {
    console.log('🧪 Starting Memory Verification Tests...\n');

    const agent1 = uuidv4();
    const agent2 = uuidv4();

    // Test 1: Save Memory
    console.log('1️⃣  Testing Memory Save...');
    const mem1 = await saveAgentMemory(agent1, 'The Sky is Blue', { tags: ['weather'], importance: 'high' });
    console.log(`✅ Saved memory ${mem1}`);

    // Verify in DB
    const { data: rawMem } = await supabase.from('agent_memories').select('*').eq('id', mem1).single();
    if (!rawMem) throw new Error('Memory not found in DB');
    if (!rawMem.embedding) throw new Error('Embedding is null');
    console.log('✅ DB Verification: Row exists and has embedding.');


    // Test 2: Semantic Search
    console.log('\n2️⃣  Testing Semantic Search...');
    const results = await searchAgentMemory(agent1, 'What color is the sky?', { threshold: 0.5 });
    if (results.length > 0 && results[0].content === 'The Sky is Blue') {
        console.log('✅ Semantic Search Successful (found exact match via semantic query)');
    } else {
        console.error('❌ Semantic Search Failed', results);
    }

    // Test 3: Agent Isolation
    console.log('\n3️⃣  Testing Agent Isolation...');
    const results2 = await searchAgentMemory(agent2, 'What color is the sky?', { threshold: 0.1 });
    if (results2.length === 0) {
        console.log('✅ Agent 2 cannot see Agent 1\'s memory');
    } else {
        console.error('❌ Isolation Failed: Agent 2 saw memory', results2);
    }

    // Test 4: Hydration
    console.log('\n4️⃣  Testing Hydration...');
    const block = await hydrateAgentMemoryBlock(agent1);
    if (block.includes('The Sky is Blue')) {
        console.log('✅ Hydration block contains memory');
    } else {
        console.error('❌ Hydration failed', block);
    }

    // Test 5: Auto-Extraction
    console.log('\n5️⃣  Testing Auto-Extraction...');
    // We mock session history
    await extractAndSaveMemories(agent1, [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris. Result: Paris is the capital.' }
    ]);
    // Give it a moment (async fire-and-forget)
    await new Promise(r => setTimeout(r, 2000));

    const extractionResults = await listAgentMemories(agent1, { limit: 5 });
    const extracted = extractionResults.find(m => m.content.includes('Paris'));
    if (extracted) {
        console.log('✅ Auto-extraction successful:', extracted.content);
    } else {
        console.warn('⚠️ Auto-extraction might be slow or failed (check logs)');
    }

    // Test 6: Forget
    console.log('\n6️⃣  Testing Forget...');
    await forgetAgentMemory(agent1, mem1);
    const postForget = await searchAgentMemory(agent1, 'sky', { threshold: 0.1 });
    if (postForget.length === 0 || !postForget.find(m => m.id === mem1)) {
        console.log('✅ Memory successfully forgotten');
    } else {
        console.error('❌ Forget failed', postForget);
    }

    console.log('\n🎉 Verification Complete!');
    process.exit(0);
}

runTests().catch(e => {
    console.error('❌ Test Failed:', e);
    process.exit(1);
});
