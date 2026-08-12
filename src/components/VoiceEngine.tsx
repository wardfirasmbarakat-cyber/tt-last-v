import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { TTSService } from "../services/voice/ttsService";

export interface VoiceEngineContextType {
  audioState: AudioContextState;
  isMuted: boolean;
  setMuted: (muted: boolean) => void;
  ensureAudioContextActive: () => Promise<boolean>;
  speak: (
    text: string,
    options?: {
      voiceName?: string;
      language?: "en" | "ar";
      onStart?: () => void;
      onEnded?: () => void;
    }
  ) => Promise<boolean>;
  playAudio: (base64Audio: string, onEnded?: () => void) => Promise<boolean>;
  stopAudio: () => void;
  getAudioContext: () => AudioContext | null;
}

const VoiceEngineContext = createContext<VoiceEngineContextType | null>(null);

export interface VoiceEngineProps {
  children: ReactNode;
}

export const VoiceEngine: React.FC<VoiceEngineProps> = ({ children }) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [audioState, setAudioState] = useState<AudioContextState>("suspended");
  const [isMuted, setIsMutedState] = useState<boolean>(TTSService.getMuted());

  // Helper to lazily obtain or construct the singleton AudioContext instance
  const getAudioContext = useCallback((createIfMissing = true) => {
    if (!audioContextRef.current) {
      audioContextRef.current = TTSService.getAudioContext(createIfMissing);
    }
    return audioContextRef.current;
  }, []);

  // Monitor AudioContext state changes if context already exists
  useEffect(() => {
    const ctx = getAudioContext(false);
    if (ctx) {
      setAudioState(ctx.state);
      const handleStateChange = () => {
        setAudioState(ctx.state);
      };
      ctx.addEventListener("statechange", handleStateChange);
      return () => {
        ctx.removeEventListener("statechange", handleStateChange);
      };
    }
  }, [getAudioContext]);

  // Global user gesture unlock for browser autoplay policy compliance (creates AudioContext on gesture)
  useEffect(() => {
    const handleGestureUnlock = async () => {
      const ctx = getAudioContext(true);
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume();
          setAudioState(ctx.state);
        } catch (err) {
          console.warn("[VoiceEngine] Auto-resume on gesture failed:", err);
        }
      }
    };

    window.addEventListener("touchstart", handleGestureUnlock, { passive: true });
    window.addEventListener("click", handleGestureUnlock, { passive: true });
    window.addEventListener("keydown", handleGestureUnlock, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleGestureUnlock);
      window.removeEventListener("click", handleGestureUnlock);
      window.removeEventListener("keydown", handleGestureUnlock);
    };
  }, [getAudioContext]);

  const ensureAudioContextActive = useCallback(async (): Promise<boolean> => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      try {
        await ctx.resume();
        setAudioState(ctx.state);
      } catch (err) {
        console.warn("[VoiceEngine] Failed to resume AudioContext:", err);
      }
    }
    const isRunning = await TTSService.ensureAudioContextRunning();
    if (isRunning) {
      setAudioState("running");
    } else {
      setAudioState("suspended");
    }
    return isRunning;
  }, [getAudioContext]);

  const setMuted = useCallback((muted: boolean) => {
    setIsMutedState(muted);
    TTSService.setMuted(muted);
  }, []);

  const speak = useCallback(
    async (
      text: string,
      options?: {
        voiceName?: string;
        language?: "en" | "ar";
        onStart?: () => void;
        onEnded?: () => void;
      }
    ): Promise<boolean> => {
      await ensureAudioContextActive();
      return TTSService.speakText(
        text,
        options?.voiceName || "Aoede",
        options?.language || "en",
        options?.onStart,
        options?.onEnded
      );
    },
    [ensureAudioContextActive]
  );

  const playAudio = useCallback(
    async (base64Audio: string, onEnded?: () => void): Promise<boolean> => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        try {
          await ctx.resume();
          setAudioState(ctx.state);
        } catch (e) {
          console.warn("[VoiceEngine] Could not resume AudioContext before playAudio:", e);
        }
      }
      await ensureAudioContextActive();
      return TTSService.playBase64Pcm(base64Audio, onEnded);
    },
    [ensureAudioContextActive, getAudioContext]
  );

  const stopAudio = useCallback(() => {
    TTSService.stopAllAudio();
  }, []);

  const value: VoiceEngineContextType = {
    audioState,
    isMuted,
    setMuted,
    ensureAudioContextActive,
    speak,
    playAudio,
    stopAudio,
    getAudioContext,
  };

  return <VoiceEngineContext.Provider value={value}>{children}</VoiceEngineContext.Provider>;
};

// Also export as VoiceEngineProvider for alternate naming conventions
export const VoiceEngineProvider = VoiceEngine;

export const useVoiceEngine = (): VoiceEngineContextType => {
  const context = useContext(VoiceEngineContext);
  if (!context) {
    // Fallback standalone instance if used outside VoiceEngine provider
    return {
      audioState: "running",
      isMuted: TTSService.getMuted(),
      setMuted: (muted) => TTSService.setMuted(muted),
      ensureAudioContextActive: () => TTSService.ensureAudioContextRunning(),
      speak: (text, options) =>
        TTSService.speakText(
          text,
          options?.voiceName || "Aoede",
          options?.language || "en",
          options?.onStart,
          options?.onEnded
        ),
      playAudio: (base64Audio, onEnded) => TTSService.playBase64Pcm(base64Audio, onEnded),
      stopAudio: () => TTSService.stopAllAudio(),
      getAudioContext: () => TTSService.getAudioContext(),
    };
  }
  return context;
};
