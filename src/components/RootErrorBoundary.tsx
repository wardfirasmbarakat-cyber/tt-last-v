import React, { Component, ErrorInfo, ReactNode } from "react";
import { safeLocalStorage, safeSessionStorage } from "../utils/safeStorage";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class RootErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[RootErrorBoundary] Uncaught application error:", error, errorInfo);
    this.setState({ errorInfo });

    // Structured logging for diagnostic tracking
    if (typeof window !== "undefined") {
      const diagLog = {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        errorMessage: error?.message || String(error),
        errorStack: error?.stack || "No stack trace available",
        componentStack: errorInfo?.componentStack || "No component stack available",
      };
      console.warn("[Diagnostic Startup Log]", JSON.stringify(diagLog));
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCacheAndReload = () => {
    try {
      safeLocalStorage.removeItem("restaurant_settings");
      safeLocalStorage.removeItem("guest_user_id");
      safeSessionStorage.removeItem("selected_table_number");
      safeSessionStorage.removeItem("staff_authenticated");
    } catch (e) {
      console.warn("[RootErrorBoundary] Cache clear error:", e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-[#F5F5F7] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden font-sans">
          {/* Ambient Gold Glow Backgrounds */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] bg-[#C9A050]/10 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="max-w-md w-full space-y-6 bg-[#0D0D11]/90 border border-[#C9A050]/30 p-8 rounded-3xl backdrop-blur-2xl relative z-10 shadow-2xl">
            {/* Logo Icon */}
            <div className="w-16 h-16 bg-[#C9A050]/15 border border-[#C9A050]/40 text-[#C9A050] rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner">
              ☕
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white tracking-wide">
                Salein Cafe
              </h1>
              <p className="text-xs text-[#C9A050] font-mono tracking-widest uppercase font-semibold">
                Application Recovery
              </p>
              <p className="text-xs text-white/70 leading-relaxed pt-2">
                We encountered a temporary rendering issue. Tap below to reload the app seamlessly.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full bg-gradient-to-r from-[#C9A050] to-[#e5be70] hover:brightness-110 text-black font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                Reload Salein Cafe
              </button>

              <button
                onClick={this.handleClearCacheAndReload}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 font-semibold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
              >
                Reset Local Cache & Retry
              </button>
            </div>

            <div className="pt-3 border-t border-white/10 text-left">
              <button
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                className="text-[10px] text-white/40 hover:text-white/60 font-mono underline block mx-auto cursor-pointer"
              >
                {this.state.showDetails ? "Hide Error Details" : "View Technical Diagnostics"}
              </button>

              {this.state.showDetails && (
                <div className="mt-3 p-3 bg-black/60 border border-white/10 rounded-xl text-[10px] font-mono text-red-300 max-h-40 overflow-y-auto space-y-1">
                  <p className="font-bold text-red-400">
                    {this.state.error?.message || "Unknown error"}
                  </p>
                  <pre className="text-[9px] text-white/50 whitespace-pre-wrap">
                    {this.state.error?.stack}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
