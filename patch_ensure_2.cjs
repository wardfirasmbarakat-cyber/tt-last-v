const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const targetFunction = `  // Ensure the web audio context is running before scheduling audio nodes
  const ensureAudioContextRunning = async () => {
    let ctx = audioCtxRef.current;
    if (!ctx) {
       console.log("[Audio Lifecycle] Creating new standard TTS AudioContext...");
       ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
       audioCtxRef.current = ctx;
       console.log(\`[Audio Lifecycle] Standard TTS Context created. Sample Rate: \${ctx.sampleRate}Hz, Initial State: \${ctx.state}\`);
       setupAnalyser(ctx);
    }
    
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

// Inject before scheduleTtsPlayback
code = code.replace(/  const scheduleTtsPlayback = async \(\) => {/, targetFunction + '\\n\\n  const scheduleTtsPlayback = async () => {');

// We also need to fix where we used ensureAudioContextRunning() before
fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
