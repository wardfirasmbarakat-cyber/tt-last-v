import React from "react";
import { motion } from "motion/react";
import { Coffee, Compass, Bot, Sparkles, ChevronRight, Utensils, Lock } from "lucide-react";
import { User as FirebaseUser } from "firebase/auth";
import { RestaurantSettings } from "../types";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "./LanguageToggle";

interface WelcomeScreenProps {
  tableNumber: string;
  user: FirebaseUser | null;
  userProfile: any | null;
  onNavigate: (view: "menu" | "ai-waiter" | "reviews" | "staff-dashboard") => void;
  onChangeTable?: () => void;
  settings?: RestaurantSettings;
}

export default function WelcomeScreen({
  tableNumber,
  user,
  userProfile,
  onNavigate,
  onChangeTable,
  settings
}: WelcomeScreenProps) {
  const { t, isArabic } = useLanguage();

  return (
    <div className="relative min-h-[90vh] flex flex-col justify-between p-6 overflow-hidden">
      {/* Decorative glassmorphic blurred ambient lighting */}
      <div className="absolute top-[-10%] left-[-20%] w-[300px] h-[300px] rounded-full bg-[#C9A050]/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-10%] w-[250px] h-[250px] rounded-full bg-[#5066C9]/10 blur-[100px] pointer-events-none" />

      {/* Top Header / Profile Info & Language Switcher */}
      <div className="flex justify-between items-center w-full z-10">
        <div className="flex items-center gap-3">
          {settings?.logo ? (
            <img src={settings.logo} alt="Logo" className="w-10 h-10 object-cover rounded-xl shadow-lg border border-white/10" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-10 h-10 bg-white flex items-center justify-center rounded-xl shadow-lg border border-white/10">
              <Coffee className="w-5 h-5 text-[#050505]" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-display font-semibold tracking-tight text-white">
              {settings?.name || t("common.cafeName")}
            </h1>
            <span className="text-[9px] uppercase tracking-[0.2em] text-[#888888] font-medium block">
              {isArabic ? "قهوة مختصة ومأكولات فاخرة" : (settings?.cuisineType || "Specialty Coffee & Gourmet Cafe")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageToggle variant="compact" />
          <div className="hidden sm:flex items-center gap-2 bg-[#C9A050]/5 border border-[#C9A050]/20 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-mono font-bold text-[#C9A050] tracking-wider uppercase">
              {isArabic ? "خدمة الطاولة نشطة" : "Table Service Active"}
            </span>
          </div>
        </div>
      </div>

      {/* Hero Welcome Brand Card */}
      <div className="my-auto py-8 text-center z-10 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-3"
        >
          <div className="inline-flex items-center gap-2 bg-[#C9A050]/10 text-[#C9A050] text-xs px-3.5 py-1.5 rounded-full font-semibold border border-[#C9A050]/20 tracking-wide">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>{t("welcome.tableInfo", { table: tableNumber || "12" })}</span>
            </div>
            {onChangeTable && (
              <button
                id="welcome-change-table"
                onClick={onChangeTable}
                className="rtl:mr-1.5 rtl:pr-1.5 rtl:border-r ltr:ml-1.5 ltr:pl-1.5 ltr:border-l border-[#C9A050]/30 text-[10px] uppercase font-bold tracking-wider hover:text-white transition-colors cursor-pointer"
              >
                {t("welcome.changeTable")}
              </button>
            )}
          </div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-3xl sm:text-4xl font-light text-white tracking-tight leading-tight max-w-md"
        >
          {isArabic ? "تجربة طعام فاخرة." : "Fine Dining."} <br />
          <span className="bg-gradient-to-r from-[#C9A050] to-[#F3E2B8] bg-clip-text text-transparent font-bold">
            {isArabic ? "بدون انتظار." : "No Waiting."}
          </span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-sm text-[#888888] mt-4 max-w-sm px-4 leading-relaxed"
        >
          {t("welcome.subtitle")}
        </motion.p>

        {/* Call to Actions - Big elegant Cards */}
        <div className="w-full max-w-sm mt-8 space-y-4">
          <motion.button
            id="browse-menu-button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            onClick={() => onNavigate("menu")}
            className="w-full flex items-center justify-between p-5 bg-white/5 border border-white/10 rounded-[24px] shadow-xl hover:border-[#C9A050]/30 hover:bg-white/10 backdrop-blur-md transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#C9A050]/10 flex items-center justify-center text-[#C9A050] group-hover:bg-[#C9A050] group-hover:text-[#050505] transition-all shrink-0">
                <Compass className="w-6 h-6" />
              </div>
              <div className="rtl:text-right ltr:text-left">
                <p className="font-display font-semibold text-white group-hover:text-[#C9A050] text-sm transition-colors">
                  {t("welcome.startOrder")}
                </p>
                <p className="text-xs text-[#888888] mt-0.5">
                  {isArabic ? "تصفح الصور، المكونات، والتخصيصات" : "See dishes, calories & configure options"}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-[#C9A050] transition-colors rtl:rotate-180 shrink-0" />
          </motion.button>

          <motion.button
            id="ask-ai-waiter-button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            onClick={() => onNavigate("ai-waiter")}
            className="w-full flex items-center justify-between p-5 bg-[#C9A050] text-[#050505] rounded-[24px] hover:bg-[#a7823e] shadow-[0_10px_30px_rgba(201,160,80,0.2)] transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#050505]/10 flex items-center justify-center text-[#050505] shrink-0">
                <Bot className="w-6 h-6" />
              </div>
              <div className="rtl:text-right ltr:text-left">
                <p className="font-display font-semibold text-sm text-[#050505]">
                  {t("welcome.talkToAi")}
                </p>
                <p className="text-xs text-[#050505]/80 mt-0.5">
                  {isArabic ? "محادثات صوتية طبيعية باللغة العربية" : "Natural chat & voice conversations"}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[#050505]/60 group-hover:translate-x-1 transition-transform rtl:rotate-180 shrink-0" />
          </motion.button>
        </div>
      </div>

      {/* Highlights / Features footer banner */}
      <div className="w-full max-w-md mx-auto grid grid-cols-3 gap-2 bg-white/5 border border-white/10 p-4 rounded-[20px] backdrop-blur-md text-center z-10 shadow-lg">
        <div className="flex flex-col items-center">
          <Utensils className="w-4 h-4 text-[#C9A050] mb-1" />
          <p className="text-[10px] font-semibold text-white">{t("welcome.featureMenuTitle")}</p>
          <p className="text-[8px] text-[#888888]">{isArabic ? "وصفات طازجة يومياً" : "Seasonal recipes"}</p>
        </div>
        <div className="flex flex-col items-center border-x border-white/5">
          <Sparkles className="w-4 h-4 text-[#C9A050] mb-1" />
          <p className="text-[10px] font-semibold text-white">{t("welcome.featureServiceTitle")}</p>
          <p className="text-[8px] text-[#888888]">{isArabic ? "بدون تحميل تطبيق" : "No app install"}</p>
        </div>
        <div className="flex flex-col items-center">
          <Bot className="w-4 h-4 text-[#C9A050] mb-1" />
          <p className="text-[10px] font-semibold text-white">{t("welcome.featureAiTitle")}</p>
          <p className="text-[8px] text-[#888888]">{isArabic ? "صوت عربي تفاعلي" : "Personalized voice"}</p>
        </div>
      </div>

      {/* Staff Portal link */}
      <div className="w-full text-center mt-6 mb-2 z-10">
        <button
          id="enter-staff-portal"
          onClick={() => onNavigate("staff-dashboard")}
          className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-wider uppercase text-white/30 hover:text-[#C9A050] transition-colors cursor-pointer group py-1 px-3 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5"
        >
          <Lock className="w-3 h-3 text-white/30 group-hover:text-[#C9A050] transition-colors" />
          <span>{t("nav.staffDashboard")}</span>
        </button>
      </div>
    </div>
  );
}
