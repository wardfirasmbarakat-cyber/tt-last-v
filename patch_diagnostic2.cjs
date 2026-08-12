const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const replacement = `  // Unlock browser Web Audio API & SpeechSynthesis on user interaction to bypass autoplay restrictions
  const unlockAudioPlayback = () => {
    logAudioDiagnostics("Before unlockAudioPlayback");
    try {
      // 1. Initialize standard TTS AudioContext
      if (!audioCtxRef.current) {
        console.log("[Audio Lifecycle] Creating new standard TTS AudioContext...");
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        console.log(\`[Audio Lifecycle] Standard TTS Context created. Sample Rate: \${ctx.sampleRate}Hz, Initial State: \${ctx.state}\`);
        setupAnalyser(ctx);
      }
      if (audioCtxRef.current.state === "suspended") {
        console.log(\`[Audio Lifecycle] Standard TTS Context is '\${audioCtxRef.current.state}'. Attempting to resume...\`);
        audioCtxRef.current.resume().then(() => {
          console.log(\`[Audio Lifecycle] Standard TTS Context successfully transitioned to '\${audioCtxRef.current?.state}'.\`);
        }).catch(err => console.warn(\`[Audio Lifecycle] Failed to resume standard TTS Context: \${err}\`));
      } else {
        console.log(\`[Audio Lifecycle] Standard TTS Context already '\${audioCtxRef.current.state}'.\`);
      }

      // 2. Initialize Live API AudioContext
      if (!liveAudioCtxRef.current) {
        console.log("[Audio Lifecycle] Creating new Live API AudioContext...");
        liveAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        console.log(\`[Audio Lifecycle] Live API Context created. Sample Rate: \${liveAudioCtxRef.current.sampleRate}Hz, Initial State: \${liveAudioCtxRef.current.state}\`);
      }
      if (liveAudioCtxRef.current.state === "suspended") {
        console.log(\`[Audio Lifecycle] Live API Context is '\${liveAudioCtxRef.current.state}'. Attempting to resume...\`);
        liveAudioCtxRef.current.resume().then(() => {
          console.log(\`[Audio Lifecycle] Live API Context successfully transitioned to '\${liveAudioCtxRef.current?.state}'.\`);
        }).catch(err => console.warn(\`[Audio Lifecycle] Failed to resume Live API Context: \${err}\`));
      } else {
        console.log(\`[Audio Lifecycle] Live API Context already '\${liveAudioCtxRef.current.state}'.\`);
      }

      // 3. Initialize SpeechSynthesis
      if (typeof window !== "undefined" && window.speechSynthesis) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.getVoices();
        const dummyUtterance = new SpeechSynthesisUtterance("");
        dummyUtterance.volume = 0.001;
        window.speechSynthesis.speak(dummyUtterance);
      }
      logAudioDiagnostics("After unlockAudioPlayback");
    } catch (e) {
      console.warn("[Audio Lifecycle] Audio unlock attempt failed:", e);
    }
  };`;

const searchRegex = /  \/\/ Unlock browser Web Audio API & SpeechSynthesis on user interaction to bypass autoplay restrictions\n  const unlockAudioPlayback = \(\) => \{[\s\S]*?  \};/g;

code = code.replace(searchRegex, replacement);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
