const fs = require('fs');
let content = fs.readFileSync('src/services/voice/cartOrderService.ts', 'utf-8');
content = content.replace(
  '          notes: ci.note || "",',
  '          notes: ci.note || "",\n          note: ci.note || "",'
);
fs.writeFileSync('src/services/voice/cartOrderService.ts', content);
