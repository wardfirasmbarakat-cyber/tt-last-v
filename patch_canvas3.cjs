const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const target = `      if (analyserRef.current && audioDataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(audioDataArrayRef.current);
        let sum = 0;
        for (let i = 0; i < audioDataArrayRef.current.length; i++) {
          sum += audioDataArrayRef.current[i];
        }
        const average = sum / audioDataArrayRef.current.length;

        // Turn on speaking animation if there's audio signal
        setIsAiTalkingVisualizer(average > 5);
      }`;

const replacement = `      if (analyserRef.current && audioDataArrayRef.current) {
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
              
              const barHeight = Math.max(2, (value / 255) * height);

              canvasCtx.fillStyle = \`rgba(201, 160, 80, \${(value / 255) * 0.8 + 0.2})\`;
              
              const y = (height - barHeight) / 2;
              
              canvasCtx.beginPath();
              canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
              canvasCtx.fill();

              x += barWidth + 2;
            }
          }
        }
      }`;

code = code.replace(target, replacement);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
