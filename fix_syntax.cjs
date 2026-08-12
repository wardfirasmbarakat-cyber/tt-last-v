const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const endBlock = `      };
      currentTtsIndexRef.current++;
    }
  };`;

const newEndBlock = `      };
      currentTtsIndexRef.current++;
    }
    } finally {
      isSchedulingRef.current = false;
    }
  };`;

code = code.replace(endBlock, newEndBlock);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
