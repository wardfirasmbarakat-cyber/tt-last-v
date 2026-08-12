import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Download, Share, X, Sparkles, Smartphone } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { safeSessionStorage } from "../utils/safeStorage";

export default function PwaInstallBanner() {
  const { isArabic } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState<boolean>(false);
  const [isIosSafari, setIsIosSafari] = useState<boolean>(false);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if app is already running as standalone PWA
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) return;

    // Check if iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);

    if (isIos && isSafari) {
      setIsIosSafari(true);
      // Show iOS PWA banner if not dismissed previously in this session
      const dismissed = safeSessionStorage.getItem("pwa_ios_banner_dismissed");
      if (!dismissed) {
        setShowBanner(true);
      }
    }

    // Handle Chrome / Edge / Android beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = safeSessionStorage.getItem("pwa_install_banner_dismissed");
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      console.log("[PWA] User accepted the install prompt");
    }
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    safeSessionStorage.setItem("pwa_install_banner_dismissed", "true");
    if (isIosSafari) {
      safeSessionStorage.setItem("pwa_ios_banner_dismissed", "true");
    }
  };

  if (isStandalone || !showBanner) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-96 z-40 bg-[#0d0d11]/95 border border-[#C9A050]/30 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-white"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C9A050]/15 border border-[#C9A050]/30 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-[#C9A050]" />
            </div>
            <div>
              <h4 className="text-xs font-bold font-display text-white flex items-center gap-1.5">
                <span>TalkTablee App</span>
                <span className="text-[9px] bg-[#C9A050]/20 text-[#C9A050] px-2 py-0.5 rounded-full font-mono">PWA</span>
              </h4>
              <p className="text-[10px] text-[#888888] mt-0.5 leading-snug">
                {isArabic
                  ? "تطبيق سريع وبدون إعلانات لجهازك"
                  : "Fast & seamless app experience for your device"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer shrink-0"
            id="dismiss-pwa-banner-btn"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content based on Browser */}
        {deferredPrompt ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full py-2 px-3 bg-gradient-to-r from-[#C9A050] to-[#a7823e] hover:brightness-110 text-black font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
              id="pwa-install-action-btn"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isArabic ? "تثبيت التطبيق الآن" : "Install App Now"}</span>
            </button>
          </div>
        ) : isIosSafari ? (
          <div className="mt-3 bg-white/5 p-2.5 rounded-xl border border-white/5 text-[10px] space-y-1.5 text-white/80">
            <div className="flex items-center gap-1.5 text-[#C9A050] font-bold">
              <Share className="w-3.5 h-3.5" />
              <span>{isArabic ? "للتثبيت على iPhone / Safari:" : "To install on iPhone / Safari:"}</span>
            </div>
            <p className="leading-relaxed">
              {isArabic ? (
                <>
                  1. اضغط على زر <strong>مشاركة (Share)</strong> أسفل الشاشة.
                  <br />
                  2. اختر <strong>"إضافة إلى الشاشة الرئيسية" (Add to Home Screen)</strong>.
                </>
              ) : (
                <>
                  1. Tap the <strong>Share</strong> button at the bottom of Safari.
                  <br />
                  2. Select <strong>"Add to Home Screen"</strong>.
                </>
              )}
            </p>
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
