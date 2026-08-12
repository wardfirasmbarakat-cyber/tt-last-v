const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const loggerCode = `
  // --- AUDIO PIPELINE DIAGNOSTIC LOGGER ---
  const logAudioDiagnostics = (context: string) => {
    console.log(\`=== Audio Diagnostics [\${context}] ===\`);
    
    if (audioCtxRef.current) {
      console.log(\`AudioContext State: \${audioCtxRef.current.state}\`);
      console.log(\`AudioContext Sample Rate: \${audioCtxRef.current.sampleRate} Hz\`);
      console.log(\`AudioContext Base Latency: \${audioCtxRef.current.baseLatency}\`);
    } else {
      console.log(\`AudioContext: Not Initialized\`);
    }

    if (liveAudioCtxRef.current) {
      console.log(\`Live AudioContext State: \${liveAudioCtxRef.current.state}\`);
      console.log(\`Live AudioContext Sample Rate: \${liveAudioCtxRef.current.sampleRate} Hz\`);
    }

    console.log(\`TTS Queue Size: \${ttsChunksRef.current.length}\`);
    console.log(\`Current TTS Index: \${currentTtsIndexRef.current}\`);
    console.log(\`Is TTS Stream Done: \${isTtsStreamDoneRef.current}\`);
    console.log(\`Active Audio Sources: \${audioSourcesRef.current.length}\`);
    console.log(\`====================================\`);
  };
`;

code = code.replace(
  '  // Unlock browser Web Audio API & SpeechSynthesis on user interaction to bypass autoplay restrictions',
  loggerCode + '\n  // Unlock browser Web Audio API & SpeechSynthesis on user interaction to bypass autoplay restrictions'
);

code = code.replace(
  '  const unlockAudioPlayback = () => {',
  '  const unlockAudioPlayback = () => {\n    logAudioDiagnostics("Before unlockAudioPlayback");'
);

code = code.replace(
  '        window.speechSynthesis.speak(dummyUtterance);\n      }',
  '        window.speechSynthesis.speak(dummyUtterance);\n      }\n      logAudioDiagnostics("After unlockAudioPlayback");'
);

code = code.replace(
  '      console.log(`[Voice Pipeline] Playback started for chunk ${index} (Web Audio)`);',
  '      console.log(`[Voice Pipeline] Playback started for chunk ${index} (Web Audio)`);\n      logAudioDiagnostics("Playback Started");'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
