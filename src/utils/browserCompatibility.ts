export interface BrowserCapabilities {
  hasMediaDevices: boolean;
  hasWebSpeech: boolean;
  hasSpeechSynthesis: boolean;
  hasServiceWorker: boolean;
  hasAudioContext: boolean;
  hasNotifications: boolean;
  isIframe: boolean;
  isIosSafari: boolean;
  isAndroidChrome: boolean;
  isSecureContext: boolean;
  warnings: string[];
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  if (typeof window === "undefined") {
    return {
      hasMediaDevices: false,
      hasWebSpeech: false,
      hasSpeechSynthesis: false,
      hasServiceWorker: false,
      hasAudioContext: false,
      hasNotifications: false,
      isIframe: false,
      isIosSafari: false,
      isAndroidChrome: false,
      isSecureContext: false,
      warnings: [],
    };
  }

  const hasMediaDevices = !!(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );

  const hasWebSpeech = !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );

  const hasSpeechSynthesis = "speechSynthesis" in window;

  const hasServiceWorker = "serviceWorker" in navigator;

  const hasAudioContext = !!(
    window.AudioContext || (window as any).webkitAudioContext
  );

  const hasNotifications = "Notification" in window;

  let isIframe = false;
  try {
    isIframe = window.self !== window.top;
  } catch (e) {
    isIframe = true;
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari =
    /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);
  const isIosSafari = isIos && isSafari;

  const isAndroid = /android/.test(userAgent);
  const isChrome = /chrome|crios/.test(userAgent);
  const isAndroidChrome = isAndroid && isChrome;

  const isSecureContext = window.isSecureContext ?? location.protocol === "https:";

  const warnings: string[] = [];

  if (isIframe) {
    warnings.push(
      "Running inside an embedded iframe preview. Camera, microphone, and push notifications may be restricted by cross-origin browser policies."
    );
  }

  if (!hasMediaDevices) {
    warnings.push(
      "Microphone access (navigator.mediaDevices.getUserMedia) is not supported or blocked in this context."
    );
  }

  if (!hasWebSpeech) {
    warnings.push(
      "Web Speech Recognition API is not supported in this browser. Voice input will use WebAudio fallback."
    );
  }

  if (!hasServiceWorker) {
    warnings.push(
      "Service Workers are not supported or restricted in this browser mode. Background push notifications may not function."
    );
  }

  if (!isSecureContext) {
    warnings.push(
      "Insecure context (HTTP). Modern browser security rules require HTTPS for microphone, camera, and push notifications."
    );
  }

  return {
    hasMediaDevices,
    hasWebSpeech,
    hasSpeechSynthesis,
    hasServiceWorker,
    hasAudioContext,
    hasNotifications,
    isIframe,
    isIosSafari,
    isAndroidChrome,
    isSecureContext,
    warnings,
  };
}
