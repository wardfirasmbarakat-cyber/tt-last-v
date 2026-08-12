const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// Change default state to false
code = code.replace(
  'const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(true);',
  'const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);'
);
code = code.replace(
  'const isVoiceSessionActiveRef = useRef(true);',
  'const isVoiceSessionActiveRef = useRef(false);'
);

// Add unlockAudio function
const unlockAudioFunction = `
  const unlockAudio = () => {
    try {
      if (!audioCtxRef.current) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
        setupAnalyser(ctx);
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(e => console.warn("Failed to resume audioCtx:", e));
      }
      
      if (typeof window !== "undefined" && window.speechSynthesis) {
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance("");
        utterance.volume = 0;
        synth.speak(utterance);
      }
    } catch(e) {
      console.warn("Failed to unlock audio:", e);
    }
  };
`;

code = code.replace(
  'const startSpeechRecognition = async () => {',
  unlockAudioFunction + '\n  const startSpeechRecognition = async () => {'
);

code = code.replace(
  '// Start always-listening voice session\n                      setIsVoiceSessionActive(true);',
  '// Start always-listening voice session\n                      unlockAudio();\n                      setIsVoiceSessionActive(true);'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
