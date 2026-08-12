const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  'const toggleDictation = async () => {',
  'const toggleDictation = async () => {\n    unlockAudio();'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
