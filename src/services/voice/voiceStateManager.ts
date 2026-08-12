export type AudioVisualizerState = "idle" | "listening" | "thinking" | "speaking";

export type VoicePipelineStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error"
  | "order_review"
  | "waiting_confirmation"
  | "submitting"
  | "submitted";

export interface VoiceStateListener {
  (status: VoicePipelineStatus, errorMessage?: string | null): void;
}

export class VoiceStateManager {
  private static status: VoicePipelineStatus = "idle";
  private static errorMessage: string | null = null;
  private static listeners: Set<VoiceStateListener> = new Set();

  public static getStatus(): VoicePipelineStatus {
    return this.status;
  }

  public static getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public static getVisualizerState(): AudioVisualizerState {
    switch (this.status) {
      case "listening":
      case "waiting_confirmation":
        return "listening";
      case "thinking":
      case "submitting":
        return "thinking";
      case "speaking":
      case "order_review":
        return "speaking";
      default:
        return "idle";
    }
  }

  public static setStatus(status: VoicePipelineStatus, errorMsg: string | null = null) {
    if (this.status === status && this.errorMessage === errorMsg) {
      return;
    }
    const prevStatus = this.status;
    this.status = status;
    this.errorMessage = errorMsg;
    console.log(`[VoicePipeline] Conversation state changed: ${prevStatus} -> ${status}`);
    this.notifyListeners();
  }

  public static setError(errorMsg: string) {
    this.status = "error";
    this.errorMessage = errorMsg;
    this.notifyListeners();
  }

  public static subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    listener(this.status, this.errorMessage);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.status, this.errorMessage);
      } catch (err) {
        console.error("[VoiceStateManager] Error in listener execution:", err);
      }
    }
  }

  public static reset() {
    this.status = "idle";
    this.errorMessage = null;
    this.notifyListeners();
  }
}
