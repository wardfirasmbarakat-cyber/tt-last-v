import React from "react";
import { Globe } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

interface LanguageToggleProps {
  className?: string;
  variant?: "pill" | "subtle" | "compact";
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  className = "",
  variant = "pill"
}) => {
  const { language, setLanguage } = useLanguage();

  if (variant === "compact") {
    return (
      <div className={`inline-flex items-center rounded-full bg-white/10 p-0.5 border border-white/15 shadow-sm backdrop-blur-md ${className}`}>
        <button
          type="button"
          id="lang-btn-ar"
          onClick={() => setLanguage("ar")}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
            language === "ar"
              ? "bg-[#C9A050] text-[#050505] shadow-sm font-extrabold"
              : "text-white/60 hover:text-white"
          }`}
          title="اللغة العربية"
        >
          عربي
        </button>

        <button
          type="button"
          id="lang-btn-en"
          onClick={() => setLanguage("en")}
          className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
            language === "en"
              ? "bg-[#C9A050] text-[#050505] shadow-sm font-extrabold"
              : "text-white/60 hover:text-white"
          }`}
          title="English Language"
        >
          EN
        </button>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center rounded-full bg-brand-100/90 p-1 border border-brand-500/30 shadow-lg backdrop-blur-md ${className}`}>
      <button
        type="button"
        id="lang-btn-ar-pill"
        onClick={() => setLanguage("ar")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
          language === "ar"
            ? "bg-brand-500 text-brand-50 shadow-md scale-105"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
        }`}
      >
        <span>🇯🇴</span>
        <span>العربية</span>
      </button>

      <button
        type="button"
        id="lang-btn-en-pill"
        onClick={() => setLanguage("en")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
          language === "en"
            ? "bg-brand-500 text-brand-50 shadow-md scale-105"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
        }`}
      >
        <span>🇺🇸</span>
        <span>English</span>
      </button>
    </div>
  );
};

export default LanguageToggle;
