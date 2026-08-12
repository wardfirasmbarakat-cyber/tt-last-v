const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const target = `    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      console.log(\`[Audio Lifecycle] startLiveSession: Live API Context is '\${audioCtxRef.current.state}'. Attempting to resume...\`);
      audioCtxRef.current.resume().then(() => {
        console.log(\`[Audio Lifecycle] startLiveSession: Live API Context successfully transitioned to '\${audioCtxRef.current?.state}'.\`);
      }).catch(err => console.warn(\`[Audio Lifecycle] startLiveSession: Failed to resume Live API Context: \${err}\`));
    } else {
      console.log(\`[Audio Lifecycle] startLiveSession: Live API Context already '\${audioCtxRef.current.state}'.\`);
    }`;

const replacement = `    await ensureAudioContextRunning();`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
