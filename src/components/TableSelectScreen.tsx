import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Coffee, ArrowRight, AlertCircle, Loader2, Server, Shield, Sparkles, Lock } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { collection, query, onSnapshot } from "firebase/firestore";
import { RestaurantSettings } from "../types";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "./LanguageToggle";

interface TableSelectScreenProps {
  onSelectTable: (table: string) => void;
  initialTable?: string;
  onEnterAdmin?: () => void;
  currentUserId?: string;
  settings?: RestaurantSettings;
}

export default function TableSelectScreen({ onSelectTable, initialTable = "", onEnterAdmin, currentUserId = "", settings }: TableSelectScreenProps) {
  const { t, isArabic } = useLanguage();
  const [selectedTable, setSelectedTable] = useState<string>(initialTable);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationStep, setValidationStep] = useState<string>(isArabic ? "جاري تحديد موضع الطاولة..." : "Locating table beacon...");
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [occupiedTables, setOccupiedTables] = useState<Record<string, { isOccupied: boolean; userId: string }>>({});

  const presetTables = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "15", "16"];

  const steps = [
    { text: isArabic ? "جاري الاتصال بالطاولة..." : "Locating table beacon...", icon: Server },
    { text: isArabic ? "مزامنة قائمة الطعام الرقمية..." : "Synchronizing digital menu...", icon: Sparkles },
    { text: isArabic ? "تأمين الجلسة..." : "Securing contactless session...", icon: Shield }
  ];

  useEffect(() => {
    const q = query(collection(db, "tables"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const locks: Record<string, { isOccupied: boolean; userId: string }> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        locks[doc.id] = {
          isOccupied: data.isOccupied ?? false,
          userId: data.userId ?? ""
        };
      });
      setOccupiedTables(locks);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "tables");
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isValidating) return;

    let interval = setInterval(() => {
      setStepIndex((prev) => {
        const next = prev + 1;
        if (next < steps.length) {
          setValidationStep(steps[next].text);
          return next;
        }
        clearInterval(interval);
        return prev;
      });
    }, 600);

    return () => clearInterval(interval);
  }, [isValidating]);

  const handleConfirm = () => {
    if (!selectedTable) {
      setErrorMsg("Please select your table number to proceed.");
      return;
    }
    const lock = occupiedTables[selectedTable];
    if (lock && lock.isOccupied && lock.userId !== currentUserId) {
      setErrorMsg(`Table ${selectedTable} is currently occupied by another party.`);
      return;
    }
    setErrorMsg(null);
    setIsValidating(true);
    setStepIndex(0);
    setValidationStep(steps[0].text);

    setTimeout(() => {
      onSelectTable(selectedTable);
    }, 1900);
  };

  const handleSelect = (table: string) => {
    const lock = occupiedTables[table];
    if (lock && lock.isOccupied && lock.userId !== currentUserId) {
      setErrorMsg(`Table ${table} is currently occupied by another party.`);
      return;
    }
    setSelectedTable(table);
    setErrorMsg(null);
  };

  const CurrentStepIcon = steps[stepIndex]?.icon || Server;

  return (
    <div className="relative min-h-screen bg-[#050505] flex flex-col justify-between p-6 overflow-hidden text-white">
      {/* Premium ambient glows */}
      <div className="absolute top-[-10%] left-[-20%] w-[350px] h-[350px] rounded-full bg-[#C9A050]/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] w-[300px] h-[300px] rounded-full bg-[#C9A050]/5 blur-[120px] pointer-events-none" />

      {/* Top bar with Language Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle variant="compact" />
      </div>

      {/* Brand Header */}
      <div className="flex flex-col items-center mt-8 z-10 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-14 h-14 bg-white/5 backdrop-blur-md flex items-center justify-center rounded-2xl shadow-xl border border-white/10 mb-4 overflow-hidden"
        >
          {settings?.logo ? (
            <img src={settings.logo} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <Coffee className="w-7 h-7 text-[#C9A050]" />
          )}
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-2xl font-display font-semibold tracking-wide text-white"
        >
          {settings?.name || t("common.cafeName")}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-[10px] uppercase tracking-[0.25em] text-[#C9A050] font-medium block mt-1"
        >
          {isArabic ? "خدمة طاولة فاخرة ومباشرة" : (settings?.cuisineType || "Fine Dining Table Service")}
        </motion.p>
      </div>

      {/* Main Selection Body */}
      <div className="my-auto py-6 max-w-sm mx-auto w-full z-10">
        <AnimatePresence mode="wait">
          {!isValidating ? (
            <motion.div
              key="table-select-form"
              initial={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="text-center mb-6"
              >
                <h2 className="text-lg font-display font-medium text-white/90">
                  {t("tableSelect.title")}
                </h2>
                <p className="text-xs text-[#888888] mt-1.5 leading-relaxed">
                  {t("tableSelect.subtitle")}
                </p>
              </motion.div>

              {/* Selection Area */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
                className="grid grid-cols-4 gap-3 max-h-[260px] overflow-y-auto pr-1 scrollbar-thin"
              >
                {presetTables.map((table) => {
                  const isSelected = selectedTable === table;
                  const lock = occupiedTables[table];
                  const isOccupiedByOther = lock && lock.isOccupied && lock.userId !== currentUserId;
                  const isOccupiedByMe = lock && lock.isOccupied && lock.userId === currentUserId;

                  let btnClasses = "bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:border-white/10";
                  if (isSelected) {
                    btnClasses = "bg-[#C9A050] text-[#050505] border-[#C9A050] shadow-lg shadow-[#C9A050]/20 scale-105";
                  } else if (isOccupiedByOther) {
                    btnClasses = "bg-red-500/5 border-red-500/10 text-red-400/40 cursor-not-allowed opacity-50";
                  } else if (isOccupiedByMe) {
                    btnClasses = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15";
                  }

                  return (
                    <button
                      id={`table-preset-btn-${table}`}
                      key={table}
                      onClick={() => handleSelect(table)}
                      className={`h-12 rounded-xl flex flex-col items-center justify-center font-mono text-sm font-bold border transition-all cursor-pointer relative ${btnClasses}`}
                      disabled={isOccupiedByOther}
                    >
                      {isOccupiedByOther ? (
                        <>
                          <Lock className="w-3.5 h-3.5 mb-0.5 text-red-500/40" />
                          <span className="text-[9px] uppercase tracking-wider font-sans font-semibold text-red-400/30">{isArabic ? "مشغولة" : "LOCKED"}</span>
                        </>
                      ) : isOccupiedByMe ? (
                        <>
                          <span className="text-[8px] uppercase tracking-wider font-sans font-semibold text-emerald-400/70">{isArabic ? "طاولتك" : "ACTIVE"}</span>
                          <span className="-mt-1 text-base">{t("common.table")} {table}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[9px] uppercase tracking-wider font-sans font-semibold text-current opacity-60">{t("common.table")}</span>
                          <span className="-mt-1 text-base">{table}</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </motion.div>

              {/* Error Message banner */}
              <AnimatePresence>
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.95 }}
                    className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-red-400 text-xs"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{errorMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Button */}
              <motion.button
                id="confirm-table-selection"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                onClick={handleConfirm}
                className="w-full bg-[#C9A050] hover:bg-[#b08c43] text-[#050505] font-semibold text-sm py-3.5 rounded-xl shadow-[0_12px_30px_rgba(201,160,80,0.25)] transition-all active:scale-95 flex items-center justify-center gap-2 mt-6 cursor-pointer"
              >
                <span>{t("tableSelect.confirm")}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="table-checking-layer"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15 }}
              className="bg-white/[0.02] border border-white/10 rounded-3xl p-8 text-center relative overflow-hidden shadow-2xl backdrop-blur-xl"
            >
              {/* Luxury Shimmer Effect overlay */}
              <motion.div
                animate={{
                  backgroundPosition: ["200% 0", "-200% 0"]
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2.2,
                  ease: "linear"
                }}
                style={{
                  backgroundImage: "linear-gradient(90deg, rgba(201,160,80,0) 0%, rgba(201,160,80,0.08) 50%, rgba(201,160,80,0) 100%)",
                  backgroundSize: "200% 100%",
                }}
                className="absolute inset-0 pointer-events-none"
              />

              {/* Pulsating validation ring */}
              <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.15, 0.02, 0.15] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full bg-[#C9A050]"
                />
                <motion.div
                  animate={{ scale: [1.1, 1.45, 1.1], opacity: [0.08, 0, 0.08] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 0.3 }}
                  className="absolute inset-[-10px] rounded-full bg-[#C9A050]"
                />
                
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-[#C9A050]/30 flex flex-col items-center justify-center relative z-10 shadow-lg">
                  <span className="text-[10px] font-mono text-[#C9A050]/70 font-semibold tracking-wider">TABLE</span>
                  <span className="text-2xl font-bold font-mono text-white -mt-1">{selectedTable}</span>
                </div>
              </div>

              {/* Dynamic steps indicator */}
              <div className="h-6 overflow-hidden mb-2 relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={validationStep}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center justify-center gap-2 text-xs font-mono font-medium text-[#C9A050]"
                  >
                    <CurrentStepIcon className="w-3.5 h-3.5 animate-pulse text-[#C9A050]" />
                    <span>{validationStep}</span>
                  </motion.div>
                </AnimatePresence>
              </div>

              <h3 className="text-base font-semibold text-white/90">
                {isArabic ? "جاري التحقق من توفر الطاولة..." : "Checking table availability..."}
              </h3>
              
              <p className="text-[11px] text-[#888888] mt-2 max-w-[240px] mx-auto leading-relaxed">
                {isArabic
                  ? "جاري الاتصال المباشر بنظام الخدمة والمطبخ. يرجى الانتظار."
                  : `Establishing direct link to the ${settings?.name || "TalkTablee"} kitchen registry. Please wait.`}
              </p>

              {/* Elegant Progress Line */}
              <div className="w-full bg-white/5 h-[2px] rounded-full overflow-hidden mt-6 relative">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1.8, ease: "easeInOut" }}
                  className="bg-gradient-to-r from-[#C9A050]/40 via-[#C9A050] to-[#C9A050]/40 h-full rounded-full"
                />
              </div>

              {/* Mini shimmer loading layout components to give a true portfolio feel */}
              <div className="mt-6 pt-5 border-t border-white/5 space-y-2">
                <div className="flex justify-between text-[10px] text-white/40 font-mono">
                  <span>Connection latency</span>
                  <span className="text-emerald-400">12ms (Optimal)</span>
                </div>
                <div className="flex justify-between text-[10px] text-white/40 font-mono">
                  <span>Service Terminal</span>
                  <span>Port 3000 Ingress</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Subtle luxury Staff Portal link */}
      {onEnterAdmin && !isValidating && (
        <div className="text-center z-10 -mt-2">
          <button
            id="enter-staff-portal-from-select"
            onClick={onEnterAdmin}
            className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-wider uppercase text-white/30 hover:text-[#C9A050] transition-colors cursor-pointer group py-1 px-3 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10"
          >
            <Shield className="w-3.5 h-3.5 text-white/30 group-hover:text-[#C9A050] transition-colors" />
            <span>Staff Portal Access</span>
          </button>
        </div>
      )}

      {/* Elegant footer */}
      <div className="text-center text-[10px] text-white/30 pb-4 z-10 font-mono tracking-wide">
        <span>{settings?.name || "L'Ambroisie Royale"} Contactless Platform</span>
      </div>
    </div>
  );
}

