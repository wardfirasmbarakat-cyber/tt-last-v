import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Check, Store, Hash, Calendar, Clock, Sparkles } from "lucide-react";
import { Order, RestaurantSettings } from "../types";
import { useLanguage } from "../context/LanguageContext";

interface ThankYouScreenProps {
  settings: RestaurantSettings | null;
  tableNumber: string;
  activeOrder: Order | null;
  onFinish: () => void;
}

export default function ThankYouScreen({
  settings,
  tableNumber,
  activeOrder,
  onFinish,
}: ThankYouScreenProps) {
  const { isArabic } = useLanguage();
  const [countdown, setCountdown] = useState(10);
  const [visitTime] = useState(() => {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  });
  const [visitDate] = useState(() => {
    return new Date().toLocaleDateString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  // Countdown timer for automatic redirect
  useEffect(() => {
    if (countdown <= 0) {
      onFinish();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onFinish]);

  return (
    <div
      className="min-h-screen bg-[#050505] text-[#F5F5F7] flex flex-col items-center justify-center p-4 sm:p-6 text-center relative overflow-hidden"
      id="thank-you-screen-overlay"
    >
      {/* Dynamic Background Ambient Beams */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-[#C9A050]/5 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[6000ms]"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] bg-[#5066C9]/5 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[8000ms]"></div>

      {/* Floating Sparkle Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-[#C9A050]/30 rounded-full"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.1, 0.7, 0.1],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 4 + Math.random() * 4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Main Glassmorphic Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full bg-gradient-to-b from-white/[0.04] to-transparent border border-white/5 p-6 sm:p-10 rounded-[36px] backdrop-blur-xl relative z-10 shadow-2xl shadow-black/80 space-y-8"
        id="thank-you-container"
      >
        {/* Animated Brand Header */}
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6, type: "spring" }}
            className="relative w-20 h-20 mx-auto flex items-center justify-center"
          >
            {/* Soft Outer Golden Ring Glow */}
            <div className="absolute inset-0 bg-[#C9A050]/20 rounded-full blur-md animate-ping duration-[3000ms]"></div>
            <div className="absolute inset-0 border border-[#C9A050]/30 rounded-full"></div>
            
            {/* Draw checkmark inside circle */}
            <div className="w-16 h-16 bg-gradient-to-b from-[#C9A050] to-[#A37D35] text-black rounded-full flex items-center justify-center shadow-lg shadow-[#C9A050]/10">
              <motion.div
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <Check className="w-8 h-8 stroke-[3]" />
              </motion.div>
            </div>
            
            {/* Sparkle badge */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute -top-1 -right-1 bg-black/80 p-1 rounded-full border border-white/10"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C9A050]" />
            </motion.div>
          </motion.div>

          <div className="space-y-2">
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-xs uppercase tracking-[0.3em] font-mono font-bold text-[#C9A050]"
            >
              TalkTableee Experience
            </motion.h2>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-3xl sm:text-4xl font-semibold tracking-tight text-white font-sans"
              id="thank-you-title"
            >
              {isArabic ? "شكراً جزيل لكم!" : "Thank You!"}
            </motion.h1>
          </div>
        </div>

        {/* Elegant Greeting Card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="space-y-3 px-2 text-white/80 font-sans"
        >
          <p className="text-sm sm:text-base leading-relaxed">
            {isArabic ? "شكراً لزيارتكم واستخدام تطبيق " : "Thank you for dining with us and using "} <span className="font-semibold text-white">TalkTableee</span>.
          </p>
          <p className="text-xs sm:text-sm text-[#888888] leading-relaxed">
            {isArabic ? "نتمنى أن تكون تجربتك رائعة، ونتطلع لخدمتك مجدداً في القريب العاجل." : "We hope you enjoyed your experience. We look forward to serving you again soon."}
          </p>
        </motion.div>

        {/* Premium Receipt / Details Sub-card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 sm:p-5 text-start space-y-3.5 font-sans"
          id="thank-you-details-card"
        >
          <div className="text-[10px] uppercase tracking-wider font-mono text-white/30 border-b border-white/5 pb-2">
            {isArabic ? "ملخص الزيارة" : "Visit Summary"}
          </div>
          
          <div className="grid grid-cols-2 gap-y-3 text-xs font-sans">
            {/* Restaurant Name */}
            <div className="flex items-center gap-2 text-white/50">
              <Store className="w-3.5 h-3.5 text-[#C9A050]/75" />
              <span>{isArabic ? "اسم الكافيه" : "Restaurant"}</span>
            </div>
            <div className="text-end text-white font-medium truncate">
              {settings?.name || "Our Café & Restaurant"}
            </div>

            {/* Table Number */}
            <div className="flex items-center gap-2 text-white/50">
              <Hash className="w-3.5 h-3.5 text-[#C9A050]/75" />
              <span>{isArabic ? "رقم الطاولة" : "Table"}</span>
            </div>
            <div className="text-end text-white font-mono font-bold">
              {tableNumber}
            </div>

            {/* Order Number */}
            {activeOrder && (
              <>
                <div className="flex items-center gap-2 text-white/50">
                  <Hash className="w-3.5 h-3.5 text-[#C9A050]/75" />
                  <span>{isArabic ? "رقم الطلب" : "Order ID"}</span>
                </div>
                <div className="text-end text-white font-mono font-semibold">
                  #{activeOrder.orderId.substring(0, 5).toUpperCase()}
                </div>
              </>
            )}

            {/* Visit Date */}
            <div className="flex items-center gap-2 text-white/50">
              <Calendar className="w-3.5 h-3.5 text-[#C9A050]/75" />
              <span>{isArabic ? "التاريخ" : "Date"}</span>
            </div>
            <div className="text-end text-white/80 text-[11px] font-medium">
              {visitDate}
            </div>

            {/* Visit Time */}
            <div className="flex items-center gap-2 text-white/50">
              <Clock className="w-3.5 h-3.5 text-[#C9A050]/75" />
              <span>{isArabic ? "وقت المغادرة" : "Time Concluded"}</span>
            </div>
            <div className="text-end text-white/80 font-mono">
              {visitTime}
            </div>
          </div>
        </motion.div>

        {/* Action Button & Countdown */}
        <div className="space-y-4 pt-2">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            id="thank-you-finish-btn"
            onClick={onFinish}
            className="w-full bg-gradient-to-r from-[#C9A050] to-[#B89040] text-black font-semibold py-4 rounded-xl text-xs uppercase tracking-widest font-mono transition-all duration-300 shadow-lg shadow-[#C9A050]/10 hover:shadow-[#C9A050]/20 cursor-pointer"
          >
            {isArabic ? "إنهاء والعودة" : "Finish"}
          </motion.button>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="text-[10px] font-mono text-white/70"
            id="thank-you-countdown-text"
          >
            {isArabic ? `العودة للشاشة الرئيسية خلال ${countdown} ثوانٍ...` : `Returning in ${countdown} seconds...`}
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}
