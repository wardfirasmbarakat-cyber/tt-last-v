const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// Inside processStreamedTextForSpeech
code = code.replace(
  'const chunkIndex = ttsChunksRef.current.length;',
  'const chunkIndex = ttsChunksRef.current.length;\n    console.log(`[Voice Pipeline] AI text generated for chunk: "${cleanText}"`);'
);

// Inside fetchAndDecodeTTSChunk
code = code.replace(
  '// If we\'ve already triggered browser native TTS fallback',
  'console.log(`[Voice Pipeline] TTS request sent for chunk ${index}: "${text}"`);\n    // If we\'ve already triggered browser native TTS fallback'
);

code = code.replace(
  'const data = await response.json();',
  'const data = await response.json();\n      console.log(`[Voice Pipeline] TTS response received for chunk ${index}`);'
);

code = code.replace(
  '// Save the decoded buffer in our chunk array',
  'console.log(`[Voice Pipeline] Audio file or stream created for chunk ${index} (Web Audio Buffer)`);\n      // Save the decoded buffer in our chunk array'
);

// Inside scheduleTtsPlayback Web Audio part
code = code.replace(
  'source.start(startTime);',
  'source.start(startTime);\n      console.log(`[Voice Pipeline] Playback started for chunk ${index} (Web Audio)`);'
);

code = code.replace(
  'if (index === ttsChunksRef.current.length - 1 && isTtsStreamDoneRef.current) {',
  'console.log(`[Voice Pipeline] Playback completed for chunk ${index} (Web Audio)`);\n        if (index === ttsChunksRef.current.length - 1 && isTtsStreamDoneRef.current) {'
);

// Inside speakFallback Native SpeechSynthesis part
code = code.replace(
  'const textToSpeak = currentChunk.text;',
  'console.log(`[Voice Pipeline] Audio file or stream created for chunk (Native SpeechSynthesis)`);\n          const textToSpeak = currentChunk.text;'
);

code = code.replace(
  'utterance.onstart = () => {',
  'utterance.onstart = () => {\n            console.log(`[Voice Pipeline] Playback started for chunk ${index} (Native SpeechSynthesis)`);'
);

code = code.replace(
  'utterance.onend = () => {',
  'utterance.onend = () => {\n            console.log(`[Voice Pipeline] Playback completed for chunk ${index} (Native SpeechSynthesis)`);'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
