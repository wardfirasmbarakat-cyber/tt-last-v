const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  'const fetchAndDecodeTTSChunk = async (text: string, index: number) => {\n    console.log(`[Voice Pipeline] TTS request sent for chunk ${index}: "${text}"`);\n    // If we\'ve already triggered browser native TTS fallback',
  'const fetchAndDecodeTTSChunk = async (text: string, index: number) => {\n    console.log(`[Voice Pipeline] TTS request sent for chunk ${index}: "${text}"`);\n    // If we\'ve already triggered browser native TTS fallback'
); // actually I can just replace the specific one inside fetchAndDecodeTTSChunk

let lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const data = await response.json();')) {
    // Check if we are inside fetchAndDecodeTTSChunk
    if (i > 800 && i < 1000 && code.substring(code.indexOf('const fetchAndDecodeTTSChunk'), code.indexOf('const scheduleTtsPlayback')).includes('const data = await response.json();')) {
       // Just insert it on the next line if it's the right one
    }
  }
}
fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
