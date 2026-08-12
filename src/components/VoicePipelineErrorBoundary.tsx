import React, { ErrorInfo, ReactNode } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

interface Props {
  children: ReactNode;
  onReset?: () => void;
  detectedLanguage?: "en" | "ar";
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class VoicePipelineErrorBoundary extends React.Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[VoicePipelineErrorBoundary] Caught error:", error, errorInfo);
  }

  public handleReconnect = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      const isAr = this.props.detectedLanguage === "ar";
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-[#0d0d0f]/90 backdrop-blur-2xl border border-rose-500/30 rounded-[28px] text-white max-w-md mx-auto my-6 text-center shadow-2xl space-y-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />
          
          <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 animate-pulse">
            <WifiOff className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="font-display font-bold text-lg text-white">
              {isAr ? "انقطع اتصال الخدمة الصوتية" : "Voice Pipeline Interrupted"}
            </h3>
            <p className="text-xs text-white/60 leading-relaxed max-w-xs mx-auto">
              {isAr
                ? "تعذر معالجة الإشارة الصوتية أو حدث انقطاع مفاجئ في الصوت. اضغط أدناه لإعادة تشغيل محرك الصوت فوراً."
                : "Audio stream or voice processor encountered an interruption. Tap below to re-initialize the AI voice engine."}
            </p>
          </div>

          <button
            onClick={this.handleReconnect}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#C9A050] to-[#e5be70] hover:from-[#b58e42] hover:to-[#d4ac5f] text-black font-bold text-sm transition-all shadow-lg shadow-[#C9A050]/20 active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 animate-spin-slow" />
            {isAr ? "اضغط لإعادة الاتصال والصوت" : "Tap to reconnect"}
          </button>

          {this.state.error?.message && (
            <p className="text-[10px] font-mono text-white/30 truncate max-w-xs">
              Error details: {this.state.error.message}
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
