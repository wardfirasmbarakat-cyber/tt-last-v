const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// In queueTTSChunk
code = code.replace(
  /      const audioCtx = audioCtxRef\.current;\n      if \(audioCtx\.state === "suspended"\) {\n        await audioCtx\.resume\(\);\n      }/g,
  `      const audioCtx = audioCtxRef.current;\n      if (audioCtx && audioCtx.state === "suspended") {\n        await audioCtx.resume();\n      }`
);

// In startLiveSession
code = code.replace(
  /    if \(audioCtxRef\.current\.state === "suspended"\)/g,
  `    if (audioCtxRef.current && audioCtxRef.current.state === "suspended")`
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
