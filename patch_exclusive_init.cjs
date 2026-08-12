const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// 1. Remove creation in queueTTSChunk
code = code.replace(/      if \(!audioCtxRef\.current\) {\s*const ctx = new \(window\.AudioContext \|\| \(window as any\)\.webkitAudioContext\)\(\{ sampleRate: 16000 \}\);\s*audioCtxRef\.current = ctx;\s*setupAnalyser\(ctx\);\s*}/g, '');

// 2. Remove creation in playNextTtsChunk
code = code.replace(/      \/\/ Lazy-init Web Audio Context if not yet created\s*if \(!audioCtxRef\.current\) {\s*try {\s*const ctx = new \(window\.AudioContext \|\| \(window as any\)\.webkitAudioContext\)\(\{ sampleRate: 16000 \}\);\s*audioCtxRef\.current = ctx;\s*setupAnalyser\(ctx\);\s*} catch \(e\) {\s*console\.warn\("Failed to create AudioContext on play:", e\);\s*}\s*}/g, '');

// 3. Remove creation in startLiveSession
const liveInitRegex = /    if \(!audioCtxRef\.current\) {\s*console\.log\("\[Audio Lifecycle\] startLiveSession: Creating new Live API AudioContext\.\.\."\);\s*audioCtxRef\.current = new \(window\.AudioContext \|\| \(window as any\)\.webkitAudioContext\)\(\{ sampleRate: 16000 \}\);\s*console\.log\(`\[Audio Lifecycle\] startLiveSession: Live API Context created\. Sample Rate: \$\{audioCtxRef\.current\.sampleRate\}Hz, Initial State: \$\{audioCtxRef\.current\.state\}`\);\s*}/g;
code = code.replace(liveInitRegex, '');

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
