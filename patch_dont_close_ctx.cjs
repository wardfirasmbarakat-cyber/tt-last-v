const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const target = `    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch(e){}
      audioCtxRef.current = null;
    }`;

code = code.replace(target, '');

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
