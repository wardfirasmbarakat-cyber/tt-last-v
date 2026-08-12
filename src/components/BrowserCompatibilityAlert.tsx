import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, ExternalLink, X, ShieldAlert, Mic, Bell, Info } from "lucide-react";
import { detectBrowserCapabilities, BrowserCapabilities } from "../utils/browserCompatibility";
import { useLanguage } from "../context/LanguageContext";
import { safeSessionStorage } from "../utils/safeStorage";

export default function BrowserCompatibilityAlert() {
  const { isArabic } = useLanguage();
  const [caps, setCaps] = useState<BrowserCapabilities | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    const detected = detectBrowserCapabilities();
    setCaps(detected);

    const dismissed = safeSessionStorage.getItem("browser_compat_alert_dismissed");
    if (!dismissed) {
      // Show if inside iframe, missing media devices, or insecure context
      if (detected.isIframe || !detected.hasMediaDevices || !detected.isSecureContext) {
        setIsOpen(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setIsOpen(false);
    safeSessionStorage.setItem("browser_compat_alert_dismissed", "true");
  };

  const handleOpenNewTab = () => {
    window.open(window.location.href, "_blank", "noopener,noreferrer");
  };

  if (!caps || !isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-md bg-[#0e0e12] border border-[#C9A050]/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden text-white space-y-4"
        >
          {/* Top Decorative Border */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-[#C9A050] to-amber-500" />

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display text-white">
                  {isArabic ? "تنبيه توافق المتصفح" : "Browser Compatibility Notice"}
                </h3>
                <p className="text-xs text-[#a0a0a0]">
                  {isArabic
                    ? "لضمان عمل الميكروفون والإشعارات بكفاءة عالية"
                    : "To ensure optimal performance for Voice & Notifications"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              id="dismiss-browser-compat-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Issue Breakdown */}
          <div className="space-y-2 text-xs">
            {caps.isIframe && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1">
                <p className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>
                    {isArabic
                      ? "المعاينة داخل الإطار (Iframe Preview)"
                      : "Embedded Frame Preview"}
                  </span>
                </p>
                <p className="text-[#cccccc] text-[11px] leading-relaxed">
                  {isArabic
                    ? "تمنع متصفحات Chrome و Safari صلاحيات الصوت والإشعارات داخل الإطارات المُضمنة. افتح التطبيق في علامة تبويب مستقلة لتفعيل كافة الميزات."
                    : "Browser preview frames restrict microphone & push notifications permissions. Open in a new tab for full features."}
                </p>
              </div>
            )}

            {!caps.isSecureContext && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1">
                <p className="font-bold text-rose-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    {isArabic ? "اتصال غير آمن (HTTP)" : "Insecure Connection (HTTP)"}
                  </span>
                </p>
                <p className="text-[#cccccc] text-[11px] leading-relaxed">
                  {isArabic
                    ? "تتطلب ميزات الميكروفون والكاميرا الإتصال الآمن (HTTPS)."
                    : "Microphone and camera permissions require a secure HTTPS connection."}
                </p>
              </div>
            )}

            {!caps.hasMediaDevices && (
              <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    {isArabic
                      ? "الميكروفون غير مدعوم أو محظور"
                      : "Microphone Restricted or Unsupported"}
                  </span>
                </p>
                <p className="text-[#cccccc] text-[11px] leading-relaxed">
                  {isArabic
                    ? "يرجى السماح بالوصول للميكروفون من إعدادات المتصفح."
                    : "Please enable microphone permissions in your browser settings."}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            {caps.isIframe && (
              <button
                type="button"
                onClick={handleOpenNewTab}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#C9A050] to-[#e5be70] hover:brightness-110 text-black font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                id="open-app-new-tab-btn"
              >
                <ExternalLink className="w-4 h-4" />
                <span>
                  {isArabic
                    ? "فتح في نافذة مستقلة (New Tab)"
                    : "Open in New Tab"}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              className="py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl border border-white/10 transition-colors cursor-pointer"
              id="continue-anyway-btn"
            >
              {isArabic ? "المتابعة على أي حال" : "Continue Anyway"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
