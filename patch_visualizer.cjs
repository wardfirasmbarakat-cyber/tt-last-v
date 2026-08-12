const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  /    audioSourcesRef.current.push\(source\);\n    \n    \/\/ Cleanup source/g,
  `    audioSourcesRef.current.push(source);\n    startVisualizer();\n    \n    // Cleanup source`
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
