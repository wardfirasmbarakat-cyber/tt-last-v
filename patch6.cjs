const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  'const toggleDictation = async () => {\n    unlockAudio();',
  'const toggleDictation = async () => {\n    unlockAudioPlayback();'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
