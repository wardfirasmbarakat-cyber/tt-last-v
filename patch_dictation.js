const fs = require('fs');
let code = fs.readFileSync('src/components/AiWaiterChat.tsx', 'utf8');

const replacement = `  const toggleDictation = async () => {
    if (isDictating) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsDictating(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        dictationStreamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stopDictationStream();
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          
          // Convert Blob to Base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64data = reader.result?.toString().split(",")[1];
            if (base64data) {
              setLiveTranscript(detectedLanguage === "ar" ? "جاري تحويل الصوت..." : "Transcribing audio...");
              try {
                const response = await fetch("/api/gemini/transcribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ audioData: base64data, mimeType: "audio/webm" })
                });
                if (response.ok) {
                  const data = await response.json();
                  if (data.text) {
                    setLiveTranscript(data.text);
                    setInputValue(data.text);
                    
                    const containsArabic = /[\\u0600-\\u06FF]/.test(data.text);
                    if (containsArabic) {
                      setDetectedLanguage("ar");
                    }
                    
                    handleSendMessage(data.text);
                  }
                } else {
                  setLiveTranscript(detectedLanguage === "ar" ? "فشل التعرف على الصوت." : "Transcription failed.");
                }
              } catch (err) {
                console.error("Transcription error:", err);
                setLiveTranscript(detectedLanguage === "ar" ? "حدث خطأ." : "Error occurred.");
              }
            }
          };
        };

        mediaRecorder.start();
        setIsDictating(true);
        setLiveTranscript(detectedLanguage === "ar" ? "تحدث الآن..." : "Speak now...");
      } catch (err) {
        console.error("Mic error:", err);
        setMicPermissionState("denied");
      }
    }
  };`;

code = code.replace(/  const toggleDictation = async \(\) => {[\s\S]*?  };\n/, replacement + '\n');
fs.writeFileSync('src/components/AiWaiterChat.tsx', code);
console.log("Patched toggleDictation");
