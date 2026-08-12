const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// Replace unlockAudio(); with unlockAudioPlayback(); in the onClick handler
code = code.replace(
  '// Start always-listening voice session\n                      unlockAudio();\n                      setIsVoiceSessionActive(true);',
  '// Start always-listening voice session\n                      unlockAudioPlayback();\n                      setIsVoiceSessionActive(true);'
);

// Now remove the custom unlockAudio function I added
const startStr = 'const unlockAudio = () => {';
const endStr = 'const startSpeechRecognition = async () => {';

if (code.includes(startStr) && code.includes(endStr)) {
  const startIndex = code.indexOf(startStr);
  const endIndex = code.indexOf(endStr);
  code = code.substring(0, startIndex) + code.substring(endIndex);
}

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
