const fs = require('fs');
let code = fs.readFileSync('patch_ensure.cjs_temp', 'utf8');

code = code.replace(
  /const playLivePCMChunk = \(base64Data: string\) => {/,
  'const playLivePCMChunk = async (base64Data: string) => {'
);

code = code.replace(
  /    if \(!liveAudioCtx\) return;\n\n    \/\/ Track speaking state/,
  '    if (!liveAudioCtx) return;\n    await ensureAudioContextRunning();\n\n    // Track speaking state'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
