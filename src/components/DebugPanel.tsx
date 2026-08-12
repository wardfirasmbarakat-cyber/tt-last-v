import React, { useState, useEffect } from "react";
import {
  SafariDebugLog,
  getDebugLogs,
  subscribeToDebugLogs,
  clearDebugLogs,
  logDebug,
} from "../utils/safariDebugger";
import { Bug, X, RefreshCw, Trash2, Copy, Check, Filter, Search, ChevronDown, ChevronRight, Terminal, AlertTriangle, ShieldCheck } from "lucide-react";

export default function DebugPanel() {
  const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [logs, setLogs] = useState<SafariDebugLog[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Detect URL parameter debug=true or debug=1
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const debugParam = params.get("debug");
        if (debugParam === "true" || debugParam === "1") {
          setIsDebugMode(true);
          setIsOpen(true); // Auto-open when debug parameter is passed
        }
      } catch (e) {
        console.warn("[DebugPanel] Error parsing URL search params:", e);
      }
    }
  }, []);

  // Subscribe to live log updates
  useEffect(() => {
    if (!isDebugMode) return;
    const unsubscribe = subscribeToDebugLogs((updatedLogs) => {
      setLogs([...updatedLogs]);
    });
    return () => unsubscribe();
  }, [isDebugMode]);

  if (!isDebugMode) return null;

  const handleCopyLogs = () => {
    try {
      const text = logs
        .map(
          (l) =>
            `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}${
              l.details ? `\nDetails: ${l.details}` : ""
            }`
        )
        .join("\n\n");
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn("[DebugPanel] Copy failed:", e);
    }
  };

  const categories = [
    "All",
    "AppLifecycle",
    "ReactState",
    "FirebaseInit",
    "FirebaseAuth",
    "Exception",
    "Initialization",
    "ServiceWorker",
    "AudioContext",
    "Storage",
    "Browser",
    "Network",
  ];

  const filteredLogs = logs.filter((log) => {
    const matchesCategory = selectedCategory === "All" || log.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === "" ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.details && String(log.details).toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-4 z-[9999] bg-[#C9A050] hover:bg-[#e5be70] text-black font-bold p-3 rounded-full shadow-2xl flex items-center gap-2 border-2 border-black/40 text-xs transition-all active:scale-95 cursor-pointer"
          title="Open Safari Debug Panel"
        >
          <Bug className="w-5 h-5 animate-pulse" />
          <span className="font-mono text-[11px] font-extrabold uppercase tracking-wide">
            Debug ({logs.length})
          </span>
          {errorCount > 0 && (
            <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {errorCount}
            </span>
          )}
        </button>
      )}

      {/* Slide-over Debug Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex flex-col justify-end sm:justify-center items-center bg-black/70 backdrop-blur-md p-2 sm:p-6 font-sans">
          <div className="w-full max-w-3xl bg-[#0D0D11] border border-[#C9A050]/40 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden text-[#F5F5F7]">
            {/* Header */}
            <div className="p-4 bg-[#14141A] border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#C9A050]/15 border border-[#C9A050]/30 rounded-xl text-[#C9A050]">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Safari & System Diagnostics
                    <span className="text-[10px] font-mono font-semibold bg-[#C9A050]/20 text-[#C9A050] px-2 py-0.5 rounded-full border border-[#C9A050]/30">
                      debug=true
                    </span>
                  </h3>
                  <p className="text-[11px] text-white/50">
                    Real-time boot logs, exceptions, and compatibility diagnostics
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => logDebug("Initialization", "Manual diagnostic trigger requested", "info")}
                  className="p-2 bg-white/5 hover:bg-white/10 text-white/80 rounded-lg text-xs flex items-center gap-1 border border-white/10 transition-colors cursor-pointer"
                  title="Test Log Event"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCopyLogs}
                  className="px-2.5 py-1.5 bg-[#C9A050]/20 hover:bg-[#C9A050]/30 border border-[#C9A050]/40 text-[#C9A050] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Copy logs to clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Diagnostic Metrics Bar */}
            <div className="bg-[#08080C] px-4 py-2.5 border-b border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              <div className="flex items-center gap-2 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
                <span className="text-white/40">Total Logs:</span>
                <span className="font-bold text-white">{logs.length}</span>
              </div>
              <div className="flex items-center gap-2 bg-red-500/10 px-2.5 py-1.5 rounded-lg border border-red-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-300">Errors:</span>
                <span className="font-bold text-red-400">{errorCount}</span>
              </div>
              <div className="flex items-center gap-2 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
                <span className="text-amber-300">Warnings:</span>
                <span className="font-bold text-amber-400">{warnCount}</span>
              </div>
              <div className="flex items-center gap-2 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Safe Storage:</span>
                <span className="font-bold text-emerald-400">Active</span>
              </div>
            </div>

            {/* Controls: Search & Category Filter */}
            <div className="p-3 bg-[#111116] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-black/40 border border-white/10 rounded-lg px-3 py-1.5">
                <Search className="w-3.5 h-3.5 text-white/40" />
                <input
                  type="text"
                  placeholder="Filter logs by message or stack..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs text-white placeholder-white/40 focus:outline-none w-full font-mono"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-white/40 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={clearDebugLogs}
                  className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Logs</span>
                </button>
              </div>
            </div>

            {/* Category Pills */}
            <div className="px-3 py-2 bg-[#0A0A0E] border-b border-white/5 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md font-mono whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-[#C9A050] text-black font-bold shadow"
                      : "bg-white/5 hover:bg-white/10 text-white/60"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Logs Stream List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs max-h-[50vh]">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-10 text-white/40">
                  <p className="text-xs">No diagnostic logs found matching current filter.</p>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  let badgeBg = "bg-blue-500/10 text-blue-400 border-blue-500/30";
                  if (log.level === "error") badgeBg = "bg-red-500/15 text-red-400 border-red-500/40";
                  if (log.level === "warn") badgeBg = "bg-amber-500/15 text-amber-400 border-amber-500/40";
                  if (log.level === "success") badgeBg = "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";

                  return (
                    <div
                      key={log.id}
                      className={`p-2.5 rounded-xl border transition-all ${
                        log.level === "error"
                          ? "bg-red-950/20 border-red-500/30"
                          : log.level === "warn"
                          ? "bg-amber-950/20 border-amber-500/30"
                          : "bg-white/[0.03] border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="flex items-start justify-between gap-2 cursor-pointer select-none"
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="text-[10px] text-white/40 pt-0.5 shrink-0">{log.timestamp}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${badgeBg}`}>
                            {log.category}
                          </span>
                          <p className="text-white/90 leading-snug break-words flex-1 text-[11px]">
                            {log.message}
                          </p>
                        </div>

                        {log.details && (
                          <div className="text-white/40 hover:text-white pt-0.5">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </div>
                        )}
                      </div>

                      {/* Details Accordion */}
                      {log.details && isExpanded && (
                        <div className="mt-2.5 p-2.5 bg-black/70 border border-white/10 rounded-lg text-[10px] text-amber-200/90 overflow-x-auto whitespace-pre-wrap">
                          {log.details}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-[#14141A] border-t border-white/10 flex items-center justify-between text-[11px] text-white/50">
              <span>Salein Cafe Diagnostic Engine</span>
              <button
                onClick={() => window.location.reload()}
                className="text-[#C9A050] hover:underline font-mono cursor-pointer"
              >
                Reload Window
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
