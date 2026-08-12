const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  /      const audioCtx = audioCtxRef\.current;\n      if \(audioCtx && audioCtx\.state === "suspended"\) {\n        await audioCtx\.resume\(\);\n      }/,
  `      const audioCtx = audioCtxRef.current;\n      if (!audioCtx) {\n        console.warn("No audio context available for TTS decoding. Falling back to native.");\n        useNativeTtsRef.current = true;\n        scheduleTtsPlayback();\n        return;\n      }\n      if (audioCtx.state === "suspended") {\n        await audioCtx.resume();\n      }`
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
