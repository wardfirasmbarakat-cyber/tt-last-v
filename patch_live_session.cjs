const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const target = `  const startLiveSession = async () => {
    // Synchronously create/resume context to bypass Safari autoplay policy
    if (!liveAudioCtxRef.current) {
      liveAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    }
    if (liveAudioCtxRef.current.state === "suspended") {
      liveAudioCtxRef.current.resume();
    }`;

const replacement = `  const startLiveSession = async () => {
    console.log("[Audio Lifecycle] Starting Live Session...");
    // Synchronously create/resume context to bypass Safari autoplay policy
    if (!liveAudioCtxRef.current) {
      console.log("[Audio Lifecycle] startLiveSession: Creating new Live API AudioContext...");
      liveAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      console.log(\`[Audio Lifecycle] startLiveSession: Live API Context created. Sample Rate: \${liveAudioCtxRef.current.sampleRate}Hz, Initial State: \${liveAudioCtxRef.current.state}\`);
    }
    if (liveAudioCtxRef.current.state === "suspended") {
      console.log(\`[Audio Lifecycle] startLiveSession: Live API Context is '\${liveAudioCtxRef.current.state}'. Attempting to resume...\`);
      liveAudioCtxRef.current.resume().then(() => {
        console.log(\`[Audio Lifecycle] startLiveSession: Live API Context successfully transitioned to '\${liveAudioCtxRef.current?.state}'.\`);
      }).catch(err => console.warn(\`[Audio Lifecycle] startLiveSession: Failed to resume Live API Context: \${err}\`));
    } else {
      console.log(\`[Audio Lifecycle] startLiveSession: Live API Context already '\${liveAudioCtxRef.current.state}'.\`);
    }`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
