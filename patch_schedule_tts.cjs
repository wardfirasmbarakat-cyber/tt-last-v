const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const targetFunction = `  const scheduleTtsPlayback = () => {`;
const replacementFunction = `  const scheduleTtsPlayback = async () => {`;

code = code.replace(targetFunction, replacementFunction);

const targetResume = `      if (audioCtx.state === "suspended") {
        try { audioCtx.resume(); } catch(e){}
      }`;
      
const replacementResume = `      if (audioCtx.state === "suspended") {
        console.log(\`[Audio Lifecycle] playNextTtsChunk: Context suspended. Awaiting resume...\`);
        try { await audioCtx.resume(); } catch(e){ console.warn("[Audio Lifecycle] Failed to resume in TTS chunk:", e); }
      }`;

code = code.replace(targetResume, replacementResume);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
