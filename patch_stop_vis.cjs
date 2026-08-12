const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const targetCleanup = `    // Cleanup source when done to avoid memory leaks
    source.onended = () => {
       const idx = audioSourcesRef.current.indexOf(source);
       if (idx > -1) {
         audioSourcesRef.current.splice(idx, 1);
       }
    };`;

const replacementCleanup = `    // Cleanup source when done to avoid memory leaks
    source.onended = () => {
       const idx = audioSourcesRef.current.indexOf(source);
       if (idx > -1) {
         audioSourcesRef.current.splice(idx, 1);
       }
       if (audioSourcesRef.current.length === 0) {
         stopVisualizer();
       }
    };`;

code = code.replace(targetCleanup, replacementCleanup);
fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
