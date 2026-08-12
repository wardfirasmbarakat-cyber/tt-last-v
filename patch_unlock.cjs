const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const target = `      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        console.log(\`[Audio Lifecycle] Standard TTS Context is '\${audioCtxRef.current.state}'. Attempting to resume...\`);
        audioCtxRef.current.resume().then(() => {
          console.log(\`[Audio Lifecycle] Standard TTS Context successfully transitioned to '\${audioCtxRef.current?.state}'.\`);
        }).catch(err => console.warn(\`[Audio Lifecycle] Failed to resume standard TTS Context: \${err}\`));
      } else {
        console.log(\`[Audio Lifecycle] Standard TTS Context already '\${audioCtxRef.current.state}'.\`);
      }`;

const replacement = `      ensureAudioContextRunning();`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
