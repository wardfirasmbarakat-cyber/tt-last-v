import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Table, Bell, Coffee, Hand, Sparkles, CheckCircle, Info } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { dispatchPushNotification } from "../lib/fcm";
import { useLanguage } from "../context/LanguageContext";

interface TableActionsProps {
  tableNumber: string;
  userId: string | null;
}

export default function TableActions({ tableNumber, userId }: TableActionsProps) {
  const { isArabic } = useLanguage();
  const [activeRequestName, setActiveRequestName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const serviceRequests = [
    {
      id: "call_waiter",
      name: isArabic ? "استدعاء الموظف" : "Call Waiter",
      icon: Hand,
      desc: isArabic ? "سيصلك أحد أفراد الطاقم فوراً" : "A staff member will arrive shortly"
    },
    {
      id: "request_napkins",
      name: isArabic ? "طلب محارم" : "Need Napkins",
      icon: Table,
      desc: isArabic ? "حزمة محارم ناعمة" : "Pack of soft linen napkins"
    },
    {
      id: "clean_table",
      name: isArabic ? "تنظيف الطاولة" : "Clean Table",
      icon: Bell,
      desc: isArabic ? "مسح وتنظيف الطاولة" : "Wipe down spilling or crumbs"
    },
    {
      id: "request_bill",
      name: isArabic ? "طلب الفاتورة" : "Request Bill",
      icon: Info,
      desc: isArabic ? "طباعة وحساب الحساب النهائي" : "Printed check bill summary"
    }
  ];

  const handleTriggerService = async (reqId: string, reqName: string) => {
    setIsSubmitting(true);
    const requestId = `req_${Date.now()}`;

    const payload = {
      requestId,
      tableNumber,
      userId: userId || null,
      type: reqId,
      status: "pending",
      createdAt: new Date()
    };

    try {
      // Create request in Firestore matching the blueprint schema exactly
      await setDoc(doc(db, "waiterRequests", requestId), payload);

      // Dispatch push notification to staff
      dispatchPushNotification({
        type: "request",
        tableNumber,
        requestId,
        requestType: reqId,
        requestName: reqName
      });

      setActiveRequestName(reqName);
      setTimeout(() => {
        setActiveRequestName(null);
      }, 4000);

      // Simulate staff acknowledging & handling the request after 6 seconds
      setTimeout(async () => {
        try {
          await setDoc(doc(db, "waiterRequests", requestId), {
            ...payload,
            status: "completed"
          });
        } catch (simErr) {
          console.warn("Simulation status update skipped or failed:", simErr);
        }
      }, 6000);

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `waiterRequests/${requestId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto text-white font-sans">
      <div className="text-center max-w-md mx-auto mb-6">
        <h2 className="font-display font-semibold text-lg text-white flex items-center justify-center gap-1.5">
          <Bell className="w-5 h-5 text-[#C9A050]" /> {isArabic ? "خدمة الطاولة السريعة" : "Instant Table Service"}
        </h2>
        <p className="text-xs text-[#888888] mt-1 leading-relaxed">
          {isArabic ? "هل تحتاجات إضافات أو محارم أو مساعدة؟ اطلب أي شيء مباشرة وسيتلقى الموظفون التنبيه فوراً." : "Need a refill, napkins, or assistance? Request anything directly to our waiter watchboards instantly."}
        </p>
      </div>

      {/* Grid of buttons */}
      <div className="grid grid-cols-2 gap-4 mt-6 max-w-lg mx-auto">
        {serviceRequests.map((service) => {
          const Icon = service.icon;
          return (
            <button
              id={`trigger-service-${service.id}`}
              key={service.id}
              onClick={() => handleTriggerService(service.id, service.name)}
              disabled={isSubmitting}
              className="bg-white/5 backdrop-blur-xl hover:bg-white/10 hover:border-[#C9A050]/20 active:scale-95 text-start p-4 rounded-2xl border border-white/5 shadow-xl transition-all flex flex-col justify-between h-28 cursor-pointer group disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-xl bg-[#C9A050]/10 flex items-center justify-center text-[#C9A050] border border-[#C9A050]/10 group-hover:bg-[#C9A050] group-hover:text-[#050505] transition-all">
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{service.name}</p>
                <p className="text-[9px] text-[#888888] mt-0.5 leading-none">{service.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Toast Alert Popup */}
      <AnimatePresence>
        {activeRequestName && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-4 right-4 max-w-sm mx-auto bg-[#0d0d0f]/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3.5 border border-[#C9A050]/20 z-50"
          >
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0">
              <CheckCircle className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#C9A050]">{isArabic ? "تم إرسال التنبيه للطاقم!" : "Alert Sent to Staff!"}</p>
              <p className="text-[10px] text-white/80 mt-0.5">{isArabic ? `تم إرسال طلبك (${activeRequestName}) للطاولة رقم ${tableNumber}.` : `Your request for ${activeRequestName} was dispatched to Table ${tableNumber}.`}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
