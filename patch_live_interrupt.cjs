const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const interruptTarget = `          if (data.interrupted) {
            setLiveStatus(detectedLanguage === "ar" ? "عفواً، قاطعتني... أنا أستمع إليك" : "Interrupted... listening to you");
            liveNextPlayTimeRef.current = liveAudioCtx.currentTime;
          }`;
const interruptReplacement = `          if (data.interrupted) {
            setLiveStatus(detectedLanguage === "ar" ? "عفواً، قاطعتني... أنا أستمع إليك" : "Interrupted... listening to you");
            if (liveAudioCtxRef.current) {
               liveNextPlayTimeRef.current = liveAudioCtxRef.current.currentTime;
            }
            audioSourcesRef.current.forEach(source => {
              try { source.stop(); } catch (e) {}
            });
            audioSourcesRef.current = [];
          }`;
code = code.replace(interruptTarget, interruptReplacement);

const playChunkTarget = `    source.connect(liveAudioCtx.destination);

    const startTime = Math.max(liveAudioCtx.currentTime, liveNextPlayTimeRef.current);
    source.start(startTime);
    liveNextPlayTimeRef.current = startTime + audioBuffer.duration;`;

const playChunkReplacement = `    if (analyserRef.current) {
      source.connect(analyserRef.current);
    } else {
      source.connect(liveAudioCtx.destination);
    }

    const startTime = Math.max(liveAudioCtx.currentTime, liveNextPlayTimeRef.current);
    source.start(startTime);
    audioSourcesRef.current.push(source);
    
    // Cleanup source when done to avoid memory leaks
    source.onended = () => {
       const idx = audioSourcesRef.current.indexOf(source);
       if (idx > -1) {
         audioSourcesRef.current.splice(idx, 1);
       }
    };
    
    liveNextPlayTimeRef.current = startTime + audioBuffer.duration;`;
code = code.replace(playChunkTarget, playChunkReplacement);

fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
