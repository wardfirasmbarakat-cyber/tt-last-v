import { CartOrderService } from "./cartOrderService";
import { VoiceStateManager } from "./voiceStateManager";
import { CartItem } from "../../types";

export interface LiveVoiceCallbacks {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onUserTranscript?: (transcript: string) => void;
  onModelTranscriptChunk?: (chunk: string) => void;
  onModelSpeakingStart?: () => void;
  onModelSpeakingEnd?: () => void;
  onCartAction?: (items: CartItem[]) => any;
  onModifyCartAction?: (action: {
    action: 'remove' | 'update_quantity' | 'replace' | 'add_item_note';
    itemId?: string;
    oldItemId?: string;
    newItemId?: string;
    quantity?: number;
    mode?: 'set' | 'increase' | 'decrease';
    customizations?: any;
    note?: string;
  }) => any;
  onNoteAction?: (note: { type: 'item' | 'order'; itemId?: string; note: string }) => any;
  onReviewAction?: () => any;
  onSubmitAction?: (submit: { paymentMethod?: 'cash' | 'card'; orderNotes?: string; items?: any[] }) => any;
  onError?: (error: string) => void;
  onVolumeChange?: (volume: number) => void;
}

export class LiveVoiceService {
  private ws: WebSocket | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private mediaSourceNode: MediaStreamAudioSourceNode | null = null;
  
  private isLiveActive = false;
  private nextStartTime = 0;
  private activeAudioSources: AudioBufferSourceNode[] = [];
  private callbacks: LiveVoiceCallbacks = {};
  
  private tableNumber = "12";
  private voiceName = "Aoede";
  private lastCart: any[] = [];
  private lastNotes: string = "";

  private isManualStop = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: any = null;

  constructor(callbacks: LiveVoiceCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public updateCallbacks(callbacks: LiveVoiceCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public updateActiveOrderState(currentCart: any[], orderNotes: string = "") {
    let changed = false;
    if (Array.isArray(currentCart)) {
      if (JSON.stringify(this.lastCart) !== JSON.stringify(currentCart)) changed = true;
      this.lastCart = currentCart;
    }
    if (typeof orderNotes === "string") {
      if (this.lastNotes !== orderNotes) changed = true;
      this.lastNotes = orderNotes;
    }
    
    if (changed && this.isConnected()) {
      try {
        const msg = `System Notification: The user manually updated their cart. The current cart items are: ${JSON.stringify(this.lastCart)}, and order notes are: "${this.lastNotes}". Acknowledge this implicitly in your next turn if relevant.`;
        this.ws?.send(JSON.stringify({ clientContent: msg }));
      } catch (err) {
        console.error("Failed to send clientContent update to ws", err);
      }
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public isActive(): boolean {
    return this.isLiveActive;
  }

  /**
   * Start a real-time Gemini Live voice conversation session
   */
  public async startLiveSession(
    tableNumber: string = "12",
    voiceName: string = "Aoede",
    currentCart: any[] = [],
    orderNotes: string = ""
  ): Promise<boolean> {
    this.tableNumber = tableNumber;
    this.voiceName = voiceName;
    this.lastCart = currentCart;
    this.lastNotes = orderNotes;
    this.isManualStop = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.isLiveActive) {
      this.stopLiveSession();
      this.isManualStop = false;
    }

    try {
      VoiceStateManager.setStatus("thinking");

      // 1. Immediately request microphone permission in direct response to user gesture
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access (navigator.mediaDevices.getUserMedia) is not supported or blocked in this browser.");
      }

      console.log("[LiveVoiceService] Prompting for microphone permission...");
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      // 2. Initialize/resume output AudioContext during user gesture
      await this.initOutputAudioContext();

      return await this.connectWebSocket();
    } catch (err: any) {
      console.error("[LiveVoiceService] Failed to start Live session:", err);
      this.stopMicStreaming();
      let userFriendlyError = err.message || "Failed to start Gemini Live voice mode";
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError" ||
        err.message?.toLowerCase().includes("permission") ||
        err.message?.toLowerCase().includes("denied")
      ) {
        userFriendlyError = "Microphone permission denied. Please allow microphone access in your browser settings to talk with Ward.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        userFriendlyError = "No microphone device found. Please connect a microphone to start real-time voice.";
      }

      this.callbacks.onError?.(userFriendlyError);
      VoiceStateManager.setError(userFriendlyError);
      return false;
    }
  }

  /**
   * Connect or reconnect the WebSocket pipeline while preserving cart & order state
   */
  private async connectWebSocket(): Promise<boolean> {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const cartEncoded = encodeURIComponent(JSON.stringify(this.lastCart || []));
      const notesEncoded = encodeURIComponent(this.lastNotes || "");
      const wsUrl = `${protocol}//${host}/api/live?table=${encodeURIComponent(this.tableNumber)}&voice=${encodeURIComponent(this.voiceName)}&cart=${cartEncoded}&notes=${notesEncoded}`;

      console.log("[LiveVoiceService] Connecting to Gemini Live API WebSocket:", wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        console.log("[LiveVoiceService] Connected to Gemini Live API Bridge");
        this.isLiveActive = true;
        this.reconnectAttempts = 0;
        this.callbacks.onConnected?.();
        VoiceStateManager.setStatus("listening");

        // Set up audio input processing nodes using pre-approved microphone stream
        await this.setupMicAudioNodes();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle incoming 24kHz PCM audio chunk from model
          if (data.audio) {
            this.playAudioChunk(data.audio);
          }

          // Handle interruption event
          if (data.interrupted) {
            this.stopAllPlayback();
            VoiceStateManager.setStatus("listening");
          }

          // Handle model text stream
          if (data.modelText) {
            this.callbacks.onModelTranscriptChunk?.(data.modelText);
          }

          // Handle user input audio transcription stream
          if (data.userText) {
            this.callbacks.onUserTranscript?.(data.userText);
          }

          const callId = data.callId;
          const callName = data.name;
          let toolResult: any = { success: true };

          // Handle cart action tool calls with deduplication check
          if (data.cartAction) {
            const actionId = data.actionId || data.cartAction.id || data.callId;
            if (!actionId || !CartOrderService.isDuplicateAction(actionId)) {
              if (data.cartAction.action === "add" && data.cartAction.items) {
                const processedItems = CartOrderService.processToolCartItems(data.cartAction.items);
                if (processedItems.length > 0) {
                  toolResult = (await Promise.resolve(this.callbacks.onCartAction?.(processedItems))) || toolResult;
                } else {
                  toolResult = { success: false, error: "Items were ambiguous or could not be mapped to the menu." };
                }
              } else if (
                data.cartAction.action === "remove" ||
                data.cartAction.action === "update_quantity" ||
                data.cartAction.action === "replace" ||
                data.cartAction.action === "add_item_note" ||
                data.cartAction.action === "undo"
              ) {
                toolResult = (await Promise.resolve(this.callbacks.onModifyCartAction?.(data.cartAction))) || toolResult;
              }
            } else {
              toolResult = { success: true, message: "Duplicate action ignored" };
            }
          }

          if (toolResult && Array.isArray(toolResult.cart)) {
            this.lastCart = toolResult.cart;
          }

          // Handle note actions
          if (data.noteAction) {
            const noteRes = await Promise.resolve(this.callbacks.onNoteAction?.(data.noteAction));
            if (noteRes) toolResult = noteRes;
          }

          // Handle review action
          if (data.reviewAction) {
            const reviewRes = await Promise.resolve(this.callbacks.onReviewAction?.());
            if (reviewRes) toolResult = reviewRes;
          }

          // Handle order submission action
          if (data.submitAction) {
            const submitRes = await Promise.resolve(this.callbacks.onSubmitAction?.(data.submitAction));
            if (submitRes) toolResult = submitRes;
          }

          if (callId && callName && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              toolResponse: {
                id: callId,
                name: callName,
                response: { output: toolResult }
              }
            }));
          }

          // Handle errors
          if (data.error) {
            console.error("[LiveVoiceService] Live API server error:", data.error);
            this.callbacks.onError?.(data.error);
            VoiceStateManager.setError(data.error);
          }
        } catch (err) {
          console.warn("[LiveVoiceService] Non-JSON message from WebSocket:", event.data);
        }
      };

      this.ws.onerror = (event) => {
        console.warn("[LiveVoiceService] WebSocket connection event:", event?.type || "error");
        if (this.isLiveActive && !this.isManualStop) {
          VoiceStateManager.setError("Connection interrupted. Reconnecting...");
        }
      };

      this.ws.onclose = () => {
        console.log("[LiveVoiceService] WebSocket closed. Is manual stop:", this.isManualStop);
        this.ws = null;

        if (this.isLiveActive && !this.isManualStop) {
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 5000);
            console.log(`[LiveVoiceService] Unexpected disconnect. Attempting auto-reconnect #${this.reconnectAttempts} in ${delay}ms...`);
            VoiceStateManager.setError("Connection interrupted. Reconnecting...");

            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              if (this.isLiveActive && !this.isManualStop) {
                this.connectWebSocket();
              }
            }, delay);
            return;
          } else {
            console.warn("[LiveVoiceService] Max auto-reconnect attempts reached.");
            this.isLiveActive = false;
            this.stopMicStreaming();
            const fallbackMsg = "Connection interrupted. Your order is saved! You can continue ordering via chat or complete manually.";
            this.callbacks.onError?.(fallbackMsg);
            VoiceStateManager.setError(fallbackMsg);
            this.callbacks.onDisconnected?.();
            return;
          }
        }

        this.isLiveActive = false;
        this.stopMicStreaming();
        this.callbacks.onDisconnected?.();
      };

      return true;
    } catch (err: any) {
      console.error("[LiveVoiceService] Failed to connect WebSocket:", err);
      return false;
    }
  }

  /**
   * Stop real-time Gemini Live session and cleanup media streams
   */
  public stopLiveSession() {
    this.isManualStop = true;
    this.isLiveActive = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopMicStreaming();
    this.stopAllPlayback();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    VoiceStateManager.setStatus("idle");
    this.callbacks.onDisconnected?.();
  }

  /**
   * Initialize 24kHz AudioContext for playing model speech
   */
  private async initOutputAudioContext() {
    if (!this.outputAudioCtx || this.outputAudioCtx.state === "closed") {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        throw new Error("Web Audio API is not supported in this browser environment.");
      }
      try {
        this.outputAudioCtx = new AudioCtxClass({ sampleRate: 24000 });
      } catch (e) {
        console.warn("[LiveVoiceService] Could not set sampleRate 24000 on output AudioContext, using fallback default:", e);
        this.outputAudioCtx = new AudioCtxClass();
      }
    }
    if (this.outputAudioCtx.state === "suspended") {
      await this.outputAudioCtx.resume();
    }
    this.nextStartTime = this.outputAudioCtx.currentTime;
  }

  /**
   * Set up microphone processing nodes using pre-granted or newly requested mediaStream
   */
  private async setupMicAudioNodes() {
    try {
      if (!this.mediaStream || !this.mediaStream.active) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone access is not supported in this browser");
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
        });
      }

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        throw new Error("Web Audio API is not supported in this browser environment.");
      }
      try {
        this.inputAudioCtx = new AudioCtxClass({ sampleRate: 16000 });
      } catch (e) {
        console.warn("[LiveVoiceService] Could not set sampleRate 16000 on input AudioContext, using fallback default:", e);
        this.inputAudioCtx = new AudioCtxClass();
      }
      if (this.inputAudioCtx.state === "suspended") {
        await this.inputAudioCtx.resume();
      }

      this.mediaSourceNode = this.inputAudioCtx.createMediaStreamSource(this.mediaStream);
      this.scriptProcessor = this.inputAudioCtx.createScriptProcessor(2048, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isLiveActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Compute volume level for visualizer callback
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.callbacks.onVolumeChange?.(rms);

        // Convert Float32Array to 16-bit PCM Signed Integer ArrayBuffer
        const pcm16Data = this.convertFloat32ToInt16(inputData);
        const base64Audio = this.arrayBufferToBase64(pcm16Data);

        // Stream PCM input chunk to server WebSocket
        this.ws.send(JSON.stringify({ audio: base64Audio }));
      };

      this.mediaSourceNode.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.inputAudioCtx.destination);
    } catch (err: any) {
      console.error("[LiveVoiceService] Error setting up microphone stream:", err);
      let errText = "Microphone permission denied or unavailable";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errText = "Microphone permission denied. Please allow microphone access to talk with Ward.";
      }
      this.callbacks.onError?.(errText);
      VoiceStateManager.setError(errText);
    }
  }

  /**
   * Alias for setupMicAudioNodes
   */
  private async startMicStreaming() {
    return this.setupMicAudioNodes();
  }

  /**
   * Stop microphone stream and input processing
   */
  private stopMicStreaming() {
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch (e) {}
      this.scriptProcessor = null;
    }
    if (this.mediaSourceNode) {
      try {
        this.mediaSourceNode.disconnect();
      } catch (e) {}
      this.mediaSourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.inputAudioCtx && this.inputAudioCtx.state !== "closed") {
      try {
        this.inputAudioCtx.close();
      } catch (e) {}
      this.inputAudioCtx = null;
    }
  }

  /**
   * Decode base64 24kHz 16-bit PCM audio and schedule for gapless playback
   */
  private async playAudioChunk(base64Audio: string) {
    if (!this.outputAudioCtx) {
      await this.initOutputAudioContext();
    }

    if (!this.outputAudioCtx) return;

    try {
      VoiceStateManager.setStatus("speaking");
      this.callbacks.onModelSpeakingStart?.();

      const arrayBuffer = this.base64ToArrayBuffer(base64Audio);
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);

      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }

      const audioBuffer = this.outputAudioCtx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioCtx.destination);

      const now = this.outputAudioCtx.currentTime;
      if (this.nextStartTime < now) {
        this.nextStartTime = now;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.activeAudioSources.push(source);

      source.onended = () => {
        this.activeAudioSources = this.activeAudioSources.filter((s) => s !== source);
        if (this.activeAudioSources.length === 0 && this.isLiveActive) {
          VoiceStateManager.setStatus("listening");
          this.callbacks.onModelSpeakingEnd?.();
        }
      };
    } catch (err) {
      console.error("[LiveVoiceService] Error playing audio chunk:", err);
    }
  }

  /**
   * Stop all active playing audio sources and reset queue
   */
  public stopAllPlayback() {
    this.activeAudioSources.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    });
    this.activeAudioSources = [];
    if (this.outputAudioCtx) {
      this.nextStartTime = this.outputAudioCtx.currentTime;
    }
  }

  // --- AUDIO DATA HELPER CONVERTERS ---

  private convertFloat32ToInt16(buffer: Float32Array): ArrayBuffer {
    const l = buffer.length;
    const buf = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return buf.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
