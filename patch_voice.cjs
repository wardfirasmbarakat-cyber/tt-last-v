const fs = require('fs');

// Update AiWaiterChat.tsx
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');
code = code.replace(/useState<"Zephyr" \| "Kore" \| "Puck" \| "Charon" \| "Fenrir">\(("Zephyr"|"Aoede")\)/g, 'useState<"Aoede" | "Zephyr" | "Kore" | "Puck" | "Charon" | "Fenrir">("Aoede")');
code = code.replace(/const selectedVoiceRef = useRef\(("Zephyr"|"Aoede")\);/g, 'const selectedVoiceRef = useRef("Aoede");');
code = code.replace(/const handleSelectHost = \(voiceId: "Zephyr" \| "Kore" \| "Puck" \| "Charon" \| "Fenrir"\) => \{[\s\S]*?\};/g, `const handleSelectHost = (voiceId: "Aoede" | "Zephyr" | "Kore" | "Puck" | "Charon" | "Fenrir") => {
    setSelectedVoice(voiceId);
    selectedVoiceRef.current = voiceId;
  };`);
code = code.replace(/id: "Zephyr"/g, 'id: "Aoede"'); // Change the first host option id to Aoede
code = code.replace(/voiceId: "Zephyr"/g, 'voiceId: "Aoede"');
fs.writeFileSync('src/components/AiWaiterChat.tsx', code);

// Update server.ts
let serverCode = fs.readFileSync('server.ts', 'utf8');
serverCode = serverCode.replace(/const voiceName = voice \|\| "Zephyr";/g, 'const voiceName = voice || "Aoede";');
serverCode = serverCode.replace(/const voiceName = reqUrl \? reqUrl\.searchParams\.get\("voice"\) \|\| "Zephyr" : "Zephyr";/g, 'const voiceName = reqUrl ? reqUrl.searchParams.get("voice") || "Aoede" : "Aoede";');
fs.writeFileSync('server.ts', serverCode);

