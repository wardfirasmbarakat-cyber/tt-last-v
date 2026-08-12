const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

// 1. Add canvas ref
code = code.replace(
  'const visualizerFrameRef = useRef<number | null>(null);',
  'const visualizerFrameRef = useRef<number | null>(null);\n  const canvasRef = useRef<HTMLCanvasElement | null>(null);'
);

// 2. Modify updateVisualizer to draw on canvas
code = code.replace(
  '      if (analyserRef.current && audioDataArrayRef.current) {\n        analyserRef.current.getByteFrequencyData(audioDataArrayRef.current);\n        let sum = 0;\n        for (let i = 0; i < audioDataArrayRef.current.length; i++) {\n          sum += audioDataArrayRef.current[i];\n        }\n        const average = sum / audioDataArrayRef.current.length;\n\n        // Turn on speaking animation if there\'s audio signal\n        setIsAiTalkingVisualizer(average > 5);\n      }',
  `      if (analyserRef.current && audioDataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(audioDataArrayRef.current);
        let sum = 0;
        for (let i = 0; i < audioDataArrayRef.current.length; i++) {
          sum += audioDataArrayRef.current[i];
        }
        const average = sum / audioDataArrayRef.current.length;

        // Turn on speaking animation if there's audio signal
        setIsAiTalkingVisualizer(average > 5);

        // Draw visualizer
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const canvasCtx = canvas.getContext('2d');
          if (canvasCtx) {
            const width = canvas.width;
            const height = canvas.height;
            canvasCtx.clearRect(0, 0, width, height);

            const bufferLength = audioDataArrayRef.current.length;
            // Use fewer bars for aesthetics
            const barCount = 32;
            const step = Math.floor(bufferLength / barCount);
            
            const barWidth = (width / barCount) - 2;
            let x = 0;

            for (let i = 0; i < barCount; i++) {
              let value = 0;
              for (let j = 0; j < step; j++) {
                value += audioDataArrayRef.current[i * step + j] || 0;
              }
              value = value / step;
              
              // Normalize value
              const barHeight = (value / 255) * height;

              // Gold color for Seleen Cafe
              canvasCtx.fillStyle = \`rgba(201, 160, 80, \${(value / 255) * 0.8 + 0.2})\`;
              
              // Draw rounded rect or standard rect from center
              const y = (height - barHeight) / 2;
              
              // Round edges
              canvasCtx.beginPath();
              canvasCtx.roundRect(x, y, barWidth, barHeight || 2, 2);
              canvasCtx.fill();

              x += barWidth + 2;
            }
          }
        }
      }`
);

// 3. Render canvas above subtitle box
code = code.replace(
  '{/* REAL-TIME STREAMED SUBTITLE WORDS BOX ("the words") */}',
  `              {/* REAL-TIME AUDIO VISUALIZER CANVAS */}
              <div className="w-full flex justify-center h-12 my-2 z-10 pointer-events-none opacity-80">
                <canvas 
                  ref={canvasRef} 
                  width={240} 
                  height={48} 
                  className={\`transition-opacity duration-300 \${isAiTalkingVisualizer ? "opacity-100" : "opacity-0"}\`}
                />
              </div>

              {/* REAL-TIME STREAMED SUBTITLE WORDS BOX ("the words") */}`
);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
