const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const targetLog = `    if (audioCtxRef.current) {
      console.log(\`Live AudioContext State: \${audioCtxRef.current.state}\`);
      console.log(\`Live AudioContext Sample Rate: \${audioCtxRef.current.sampleRate} Hz\`);
    }`;

code = code.replace(targetLog, '');

const targetUnlock = `      // 2. Initialize Live API AudioContext
      if (!audioCtxRef.current) {
        console.log("[Audio Lifecycle] Creating new Live API AudioContext...");
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        console.log(\`[Audio Lifecycle] Live API Context created. Sample Rate: \${audioCtxRef.current.sampleRate}Hz, Initial State: \${audioCtxRef.current.state}\`);
      }
      if (audioCtxRef.current.state === "suspended") {
        console.log(\`[Audio Lifecycle] Live API Context is '\${audioCtxRef.current.state}'. Attempting to resume...\`);
        audioCtxRef.current.resume().then(() => {
          console.log(\`[Audio Lifecycle] Live API Context successfully transitioned to '\${audioCtxRef.current?.state}'.\`);
        }).catch(err => console.warn(\`[Audio Lifecycle] Failed to resume Live API Context: \${err}\`));
      } else {
        console.log(\`[Audio Lifecycle] Live API Context already '\${audioCtxRef.current.state}'.\`);
      }`;

code = code.replace(targetUnlock, '');

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
