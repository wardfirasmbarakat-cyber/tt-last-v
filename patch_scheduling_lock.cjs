const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const targetFunction = `  // Schedule playback sequentially to guarantee correct sentence/clause ordering
  const scheduleTtsPlayback = async () => {
    while (currentTtsIndexRef.current < ttsChunksRef.current.length) {`;

const replacementFunction = `  const isSchedulingRef = useRef(false);

  // Schedule playback sequentially to guarantee correct sentence/clause ordering
  const scheduleTtsPlayback = async () => {
    if (isSchedulingRef.current) return;
    isSchedulingRef.current = true;
    try {
      while (currentTtsIndexRef.current < ttsChunksRef.current.length) {`;

code = code.replace(targetFunction, replacementFunction);

const targetEnd = `      };
      currentTtsIndexRef.current++;
    }
  };`;

const replacementEnd = `      };
      currentTtsIndexRef.current++;
    }
    } finally {
      isSchedulingRef.current = false;
    }
  };`;

code = code.replace(targetEnd, replacementEnd);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
