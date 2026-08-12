import { VoiceStateManager } from "./voiceStateManager";

export interface VoiceInputCallbacks {
  onInterimResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string, language: "en" | "ar") => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export class VoiceInputService {
  private recognition: any = null;
  private isListening = false;
  private isManualStop = false;
  private currentLanguage: "en" | "ar" = "en";
  private callbacks: VoiceInputCallbacks = {};
  private mediaStream: MediaStream | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  // VAD, Debounce & Duplicate Suppression
  private silenceTimer: any = null;
  private accumulatedTranscript = "";
  private lastEmittedTranscript = "";
  private lastEmittedTime = 0;

  constructor(callbacks: VoiceInputCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public updateCallbacks(callbacks: VoiceInputCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  private initRecognition() {
    if (typeof window === "undefined") return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[VoiceInputService] Web SpeechRecognition API is not supported in this browser.");
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.accumulatedTranscript = "";
        console.log("[VoicePipeline] Microphone started");
        this.callbacks.onStart?.();
        this.startVolumeMonitoring();
      };

      this.recognition.onresult = (event: any) => {
        // Stop echo feedback: ignore microphone input if AI is thinking or speaking
        const currentStatus = VoiceStateManager.getStatus();
        if (currentStatus === "thinking" || currentStatus === "speaking") {
          return;
        }

        let interim = "";
        let finalChunk = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk += transcript;
          } else {
            interim += transcript;
          }
        }

        const currentChunk = (finalChunk || interim).trim();
        if (!currentChunk) return;

        this.accumulatedTranscript = currentChunk;

        // Detect Arabic
        const isAr = /[\u0600-\u06FF]/.test(this.accumulatedTranscript);
        this.currentLanguage = isAr ? "ar" : "en";

        this.callbacks.onInterimResult?.(this.accumulatedTranscript);
        console.log(`[VoicePipeline] Transcript received: "${this.accumulatedTranscript}"`);

        // VAD: Restart 500ms silence timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
        }
        this.silenceTimer = setTimeout(() => {
          this.flushFinalTranscript();
        }, 500);
      };

      this.recognition.onerror = (event: any) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("[VoicePipeline] SpeechRecognition error:", event.error);
          this.callbacks.onError?.(event.error || "Speech recognition error");
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        console.log("[VoicePipeline] Microphone stopped");
        this.stopVolumeMonitoring();
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
        // Flush remaining transcript if any
        this.flushFinalTranscript();
        this.callbacks.onEnd?.();

        // Auto-restart if in an active listening state and not manually stopped
        const currentStatus = VoiceStateManager.getStatus();
        const activeListeningStates = ["listening", "waiting_confirmation", "order_review"];
        if (activeListeningStates.includes(currentStatus) && !this.isManualStop) {
          setTimeout(() => {
            const updatedStatus = VoiceStateManager.getStatus();
            if (activeListeningStates.includes(updatedStatus) && !this.isListening && !this.isManualStop) {
              console.log("[VoicePipeline] Continuous voice active - auto-restarting microphone...");
              this.start(this.currentLanguage);
            }
          }, 150);
        }
      };
    } catch (err) {
      console.error("[VoiceInputService] Error initializing SpeechRecognition:", err);
    }
  }

  private flushFinalTranscript() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    const textToEmit = this.accumulatedTranscript.trim();
    if (!textToEmit) return;

    const now = Date.now();
    // Debounce: ignore emissions within 500ms
    if (now - this.lastEmittedTime < 500) {
      console.log(`[VoicePipeline] Rapid transcript debounced: "${textToEmit}"`);
      return;
    }

    // Duplicate check
    if (textToEmit.toLowerCase() === this.lastEmittedTranscript.toLowerCase() && now - this.lastEmittedTime < 5000) {
      console.log(`[VoicePipeline] Duplicate transcript ignored: "${textToEmit}"`);
      this.accumulatedTranscript = "";
      return;
    }

    this.lastEmittedTranscript = textToEmit;
    this.lastEmittedTime = now;
    this.accumulatedTranscript = "";

    console.log(`[VoicePipeline] Silence detected (500ms), finalizing transcript: "${textToEmit}"`);
    this.callbacks.onFinalResult?.(textToEmit, this.currentLanguage);
  }

  public start(lang: "en" | "ar" = "en") {
    this.isManualStop = false;
    if (this.isListening) return;
    this.currentLanguage = lang;

    if (!this.recognition) {
      this.initRecognition();
    }

    if (this.recognition) {
      try {
        this.recognition.lang = lang === "ar" ? "ar-JO" : "en-US";
        this.recognition.start();
      } catch (err: any) {
        console.warn("[VoiceInputService] Could not start speech recognition:", err);
      }
    } else {
      this.callbacks.onError?.("Speech recognition not supported");
    }
  }

  public stop() {
    this.isManualStop = true;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.accumulatedTranscript = "";

    if (!this.isListening) return;
    this.isListening = false;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    this.stopVolumeMonitoring();
  }

  public toggle(lang: "en" | "ar" = "en") {
    if (this.isListening) {
      this.stop();
    } else {
      this.start(lang);
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  private async startVolumeMonitoring() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      const source = ctx.createMediaStreamSource(this.mediaStream);
      this.audioAnalyser = ctx.createAnalyser();
      this.audioAnalyser.fftSize = 64;
      source.connect(this.audioAnalyser);

      const buffer = new Uint8Array(this.audioAnalyser.frequencyBinCount);
      const updateVolume = () => {
        if (!this.isListening || !this.audioAnalyser) return;
        this.audioAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const normVolume = Math.min(1.0, avg / 128.0);
        this.callbacks.onVolumeChange?.(normVolume);
        this.animFrameId = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (err) {
      console.warn("[VoiceInputService] Could not initialize volume monitoring stream:", err);
    }
  }

  private stopVolumeMonitoring() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.audioAnalyser = null;
  }
}
