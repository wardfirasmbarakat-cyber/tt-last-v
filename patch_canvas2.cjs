const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

code = code.replace(
  '  const stopVisualizer = () => {\n    if (visualizerFrameRef.current) {\n      cancelAnimationFrame(visualizerFrameRef.current);\n      visualizerFrameRef.current = null;\n    }\n    setIsAiTalkingVisualizer(false);\n  };',
  '  const stopVisualizer = () => {\n    if (visualizerFrameRef.current) {\n      cancelAnimationFrame(visualizerFrameRef.current);\n      visualizerFrameRef.current = null;\n    }\n    setIsAiTalkingVisualizer(false);\n    \n    // Clear canvas when stopped\n    if (canvasRef.current) {\n      const ctx = canvasRef.current.getContext("2d");\n      if (ctx) {\n        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);\n      }\n    }\n  };'
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
