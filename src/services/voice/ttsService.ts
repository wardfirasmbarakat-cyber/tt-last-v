export class TTSService {
  private static audioCtx: AudioContext | null = null;
  private static audioQueue: AudioBufferSourceNode[] = [];
  private static nextStartTime = 0;
  private static isMuted = false;
  private static activeResponseId: string | null = null;
  private static activeAbortController: AbortController | null = null;

  public static setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stopAllAudio();
    }
  }

  public static getMuted(): boolean {
    return this.isMuted;
  }

  public static getActiveResponseId(): string | null {
    return this.activeResponseId;
  }

  public static getAudioContext(createIfMissing = true): AudioContext | null {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      if (!createIfMissing) return null;
      if (typeof window === "undefined") return null;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        console.warn("[TTSService] Web Audio API is not supported in this browser environment.");
        return null;
      }
      try {
        this.audioCtx = new AudioCtxClass({ sampleRate: 24000 });
      } catch (e) {
        console.warn("[TTSService] Failed to initialize AudioContext with 24kHz sample rate, falling back to default constructor:", e);
        try {
          this.audioCtx = new AudioCtxClass();
        } catch (e2) {
          console.warn("[TTSService] Failed to create AudioContext:", e2);
          return null;
        }
      }
    }
    return this.audioCtx;
  }

  public static async ensureAudioContextRunning(): Promise<boolean> {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return false;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      return ctx.state === "running";
    } catch (err) {
      console.warn("[TTSService] Failed to resume AudioContext:", err);
      return false;
    }
  }

  public static unlockAudioContextOnGesture() {
    const unlock = async () => {
      try {
        const ctx = this.getAudioContext();
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        // Play silent 0.001s buffer to unlock audio hardware on iOS Safari
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch (e) {
        console.warn("[TTSService] Silent unlock buffer failed:", e);
      }
      window.removeEventListener("touchstart", unlock, true);
      window.removeEventListener("click", unlock, true);
    };
    window.addEventListener("touchstart", unlock, { capture: true, passive: true });
    window.addEventListener("click", unlock, { capture: true, passive: true });
  }

  public static stopAllAudio() {
    console.log("[VoicePipeline] Speech cancelled");

    // Abort any active TTS HTTP request
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    // Invalidate active response ID
    this.activeResponseId = null;

    // Stop Web Audio sources
    for (const source of this.audioQueue) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    }
    this.audioQueue = [];
    this.nextStartTime = 0;

    // Stop native speech synthesis
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }

  /**
   * Request TTS from server or fallback to browser native TTS.
   * Ensures strictly ONE active speech per response ID.
   */
  public static async speakText(
    text: string,
    voiceName: string = "Aoede",
    language: "en" | "ar" = "en",
    onStart?: () => void,
    onEnded?: () => void,
    responseId?: string
  ): Promise<boolean> {
    const currentResponseId = responseId || `resp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Always stop and clear previous speech before starting a new one
    this.stopAllAudio();
    this.activeResponseId = currentResponseId;

    if (this.isMuted || !text || !text.trim()) {
      onEnded?.();
      return false;
    }

    // Clean emojis & formatting for smooth speech output
    const cleanText = text
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .replace(/[*_~`#]/g, "")
      .trim();

    if (!cleanText) {
      onEnded?.();
      return false;
    }

    console.log(`[VoicePipeline] Speech started (ID: ${currentResponseId}): "${cleanText.substring(0, 40)}..."`);

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    try {
      if (this.activeResponseId !== currentResponseId) {
        return false;
      }

      onStart?.();
      const res = await fetch("/api/gemini/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, voice: voiceName }),
        signal: abortController.signal,
      });

      if (this.activeResponseId !== currentResponseId) {
        return false;
      }

      if (res.ok) {
        const data = await res.json();
        if (this.activeResponseId !== currentResponseId) {
          return false;
        }

        if (data.audio && !data.useNative) {
          const played = await this.playBase64Pcm(data.audio, () => {
            if (this.activeResponseId === currentResponseId) {
              console.log(`[VoicePipeline] Speech finished (ID: ${currentResponseId})`);
              this.activeResponseId = null;
              onEnded?.();
            }
          }, currentResponseId);
          if (played) return true;
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return false;
      }
      console.warn("[VoicePipeline] Gemini TTS failed, using SpeechSynthesis fallback:", err);
    }

    if (this.activeResponseId !== currentResponseId) {
      return false;
    }

    // Fallback: Web SpeechSynthesis
    this.speakNative(cleanText, language, () => {
      if (this.activeResponseId === currentResponseId) {
        console.log(`[VoicePipeline] Speech finished (ID: ${currentResponseId})`);
        this.activeResponseId = null;
        onEnded?.();
      }
    }, currentResponseId);

    return true;
  }

  /**
   * Decode base64 PCM / Audio and queue Web Audio playback
   */
  public static async playBase64Pcm(
    base64Audio: string,
    onEnded?: () => void,
    responseId?: string
  ): Promise<boolean> {
    if (this.isMuted) return false;
    if (responseId && this.activeResponseId !== responseId) return false;

    try {
      const isOk = await this.ensureAudioContextRunning();
      if (!isOk) return false;

      const ctx = this.getAudioContext();
      const binaryStr = atob(base64Audio);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // 16-bit PCM conversion
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      if (this.nextStartTime < now) {
        this.nextStartTime = now;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.audioQueue.push(source);

      source.onended = () => {
        const idx = this.audioQueue.indexOf(source);
        if (idx > -1) this.audioQueue.splice(idx, 1);
        if (this.audioQueue.length === 0) {
          onEnded?.();
        }
      };

      return true;
    } catch (err) {
      console.error("[TTSService] Error playing base64 PCM audio:", err);
      return false;
    }
  }

  /**
   * Browser SpeechSynthesis Fallback
   */
  public static speakNative(
    text: string,
    language: "en" | "ar" = "en",
    onEnded?: () => void,
    responseId?: string
  ) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onEnded?.();
      return;
    }

    if (responseId && this.activeResponseId !== responseId) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const isArabic = language === "ar" || /[\u0600-\u06FF]/.test(text);

      utterance.lang = isArabic ? "ar-JO" : "en-US";
      utterance.rate = isArabic ? 0.95 : 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const matchingVoice = voices.find((v) =>
          isArabic ? v.lang.startsWith("ar") : v.lang.startsWith("en")
        );
        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
      }

      utterance.onend = () => {
        if (!responseId || this.activeResponseId === responseId) {
          onEnded?.();
        }
      };
      utterance.onerror = () => {
        if (!responseId || this.activeResponseId === responseId) {
          onEnded?.();
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("[TTSService] Native SpeechSynthesis error:", err);
      onEnded?.();
    }
  }
}
