const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  /      if \(audioCtx\.state === "suspended"\) {\n        await audioCtx\.resume\(\);\n      }/g,
  '      await ensureAudioContextRunning();'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
