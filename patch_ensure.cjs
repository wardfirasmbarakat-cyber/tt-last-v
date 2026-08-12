const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const targetFunction = `  // Ensure the web audio context is running before scheduling audio nodes
  const ensureAudioContextRunning = async () => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== "running") {
      try {
        console.log(\`[Audio Lifecycle] Ensuring AudioContext is running. Current state: \${ctx.state}\`);
        await ctx.resume();
        console.log(\`[Audio Lifecycle] AudioContext transitioned to: \${ctx.state}\`);
      } catch (err) {
        console.warn(\`[Audio Lifecycle] Failed to resume AudioContext:\`, err);
      }
    }
    return ctx?.state === "running";
  };`;

// Let's inject this function right above `playNextTtsChunk`
const playNextTtsChunkTarget = `  const playNextTtsChunk = async () => {`;
code = code.replace(playNextTtsChunkTarget, targetFunction + '\n\n' + playNextTtsChunkTarget);

// Now in playNextTtsChunk, replace:
//       if (audioCtx.state === "suspended") {
//         console.log(`[Audio Lifecycle] playNextTtsChunk: Context suspended. Awaiting resume...`);
//         try { await audioCtx.resume(); } catch(e){ console.warn("[Audio Lifecycle] Failed to resume in TTS chunk:", e); }
//       }
// with:
//       await ensureAudioContextRunning();
code = code.replace(/      if \(audioCtx\.state === "suspended"\) {\s*console\.log\(`\[Audio Lifecycle\] playNextTtsChunk: Context suspended\. Awaiting resume\.\.\.`\);\s*try \{ await audioCtx\.resume\(\); \} catch\(e\)\{ console\.warn\("\[Audio Lifecycle\] Failed to resume in TTS chunk:", e\); \}\s*}/g, '      await ensureAudioContextRunning();');


// Also for startLiveSession?
// Actually in playLivePCMChunk, there's no state check. Let's add it.
// playLivePCMChunk is synchronous, so we can't await ensureAudioContextRunning(). Wait, playLivePCMChunk is synchronous?
// Let's check playLivePCMChunk
fs.writeFileSync('patch_ensure.cjs_temp', code);
