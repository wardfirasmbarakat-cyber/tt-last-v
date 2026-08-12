const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// Replace liveAudioCtxRef declarations and checks
code = code.replace(/const liveAudioCtxRef = useRef<AudioContext \| null>\(null\);/g, '');

// Anywhere we check or use liveAudioCtxRef, we'll replace with audioCtxRef
code = code.replace(/liveAudioCtxRef/g, 'audioCtxRef');

// Make sure we only instantiate with sampleRate: 16000 everywhere
code = code.replace(/new \(window\.AudioContext \|\| \(window as any\)\.webkitAudioContext\)\(\)/g, 
  'new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 })');

// Remove double creation in unlockAudioPlayback
const doubleCreation = `      // 2. Initialize Live API AudioContext
      if (!audioCtxRef.current) {
        console.log("[Audio Lifecycle] Creating new Live API AudioContext...");
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        console.log(\`[Audio Lifecycle] Live API Context created. Sample Rate: \${audioCtxRef.current.sampleRate}Hz, Initial State: \${audioCtxRef.current.state}\`);
      }
      if (audioCtxRef.current.state === "suspended") {
        console.log(\`[Audio Lifecycle] Live API Context is '\${audioCtxRef.current.state}'. Attempting to resume...\`);
        audioCtxRef.current.resume().then(() => {
          console.log(\`[Audio Lifecycle] Live API Context successfully transitioned to '\${audioCtxRef?.current?.state}'.\`);
        }).catch(err => console.warn(\`[Audio Lifecycle] Failed to resume Live API Context: \${err}\`));
      } else {
        console.log(\`[Audio Lifecycle] Live API Context already '\${audioCtxRef.current.state}'.\`);
      }`;

// Wait, the double creation might be slightly different now.
fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
