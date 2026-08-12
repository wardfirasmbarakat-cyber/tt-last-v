const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  /      currentTtsIndexRef\.current\+\+;\n    }\n  };\n\n  \/\/ Process newly received/g,
  `      currentTtsIndexRef.current++;\n    }\n    } finally {\n      isSchedulingRef.current = false;\n    }\n  };\n\n  // Process newly received`
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
