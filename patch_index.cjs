const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  'window.__utteranceStorage = utterance; // Prevent GC bug',
  '(window as any).__utteranceStorage = utterance; // Prevent GC bug'
);

code = code.replace(
  '      const startTime = Math.max(audioCtx.currentTime, ttsNextPlayTimeRef.current);\n      source.start(startTime);\n      console.log(`[Voice Pipeline] Playback started for chunk ${index} (Web Audio)`);\n      \n      startVisualizer();\n\n      // Playback duration is compressed or stretched by playback speed\n      const duration = buffer.duration / speechRateRef.current;\n      ttsNextPlayTimeRef.current = startTime + duration;\n      audioSourcesRef.current.push(source);\n      const index = currentTtsIndexRef.current;',
  '      const index = currentTtsIndexRef.current;\n      const startTime = Math.max(audioCtx.currentTime, ttsNextPlayTimeRef.current);\n      source.start(startTime);\n      console.log(`[Voice Pipeline] Playback started for chunk ${index} (Web Audio)`);\n      \n      startVisualizer();\n\n      // Playback duration is compressed or stretched by playback speed\n      const duration = buffer.duration / speechRateRef.current;\n      ttsNextPlayTimeRef.current = startTime + duration;\n      audioSourcesRef.current.push(source);'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
