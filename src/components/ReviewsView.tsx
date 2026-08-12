import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Star, MessageSquare, Check, Heart, ShieldAlert, Sparkles, Send } from "lucide-react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { useLanguage } from "../context/LanguageContext";

interface ReviewsViewProps {
  user: any;
}

const FEEDBACK_SAMPLES = [
  { name: "Sami K.", date: "Today", stars: 5, comments: "The Iced Spanish Rose Latte is exceptional! Pair it with the Avocado with Cream, Honey & Nuts—your tastebuds will thank you!" },
  { name: "Leila M.", date: "Yesterday", stars: 5, comments: "Outstanding customer service. I told the AI waiter about my nut allergy, and the kitchen double checked my Steak Burger. Highly professional." },
  { name: "Tariq A.", date: "3 days ago", stars: 4, comments: "Super convenient ordering from QR code. We didn't have to wait for the check, ordered and paid instantly right at Table 12." }
];

export default function ReviewsView({ user }: ReviewsViewProps) {
  const { t, isArabic } = useLanguage();
  const [foodRating, setFoodRating] = useState(5);
  const [serviceRating, setServiceRating] = useState(5);
  const [atmosphereRating, setAtmosphereRating] = useState(5);
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmitReview = async () => {
    setIsSubmitting(true);
    const reviewId = `rev_${Date.now()}`;

    const payload = {
      reviewId,
      userId: user?.uid || "guest_user",
      userName: user?.displayName || "Gourmet Diner",
      foodRating,
      serviceRating,
      atmosphereRating,
      comments,
      createdAt: new Date()
    };

    try {
      // Write review to Firestore according to blueprint
      await setDoc(doc(db, "reviews", reviewId), payload);

      setSuccess(true);
      setComments("");
      setTimeout(() => {
        setSuccess(false);
      }, 4000);

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `reviews/${reviewId}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStarsSelector = (label: string, rating: number, setRating: (r: number) => void) => {
    return (
      <div className="flex justify-between items-center py-2 border-b border-white/5">
        <span className="text-xs font-semibold text-white">{label}</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              id={`select-stars-${label.replace(' ', '-').toLowerCase()}-${star}`}
              key={star}
              onClick={() => setRating(star)}
              className="p-1 cursor-pointer focus:outline-none transition-transform active:scale-125"
            >
              <Star className={`w-4 h-4 ${star <= rating ? "fill-[#C9A050] text-[#C9A050]" : "text-white/20"}`} />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const feedbackSamples = [
    {
      name: isArabic ? "سامي ك." : "Sami K.",
      date: isArabic ? "اليوم" : "Today",
      stars: 5,
      comments: isArabic ? "لاتيه الورد الإسباني المثلج استثنائي! جربه مع الأفوكادو بالقشطة والعسل والمكسرات—تجربة ممتازة!" : "The Iced Spanish Rose Latte is exceptional! Pair it with the Avocado with Cream, Honey & Nuts—your tastebuds will thank you!"
    },
    {
      name: isArabic ? "ليلى م." : "Leila M.",
      date: isArabic ? "أمس" : "Yesterday",
      stars: 5,
      comments: isArabic ? "خدمة عملاء متميزة. أخبرت الويتر الذكي عن حساسيتي للمكسرات وقام المطبخ بالتحقق من الطلب. احترافية عالية." : "Outstanding customer service. I told the AI waiter about my nut allergy, and the kitchen double checked my Steak Burger. Highly professional."
    },
    {
      name: isArabic ? "طارق ع." : "Tariq A.",
      date: isArabic ? "منذ 3 أيام" : "3 days ago",
      stars: 4,
      comments: isArabic ? "الطلب عبر رمز QR مريح جداً. لم نضطر لانتظار الفاتورة، طلبنا ودفعنا مباشرة من الطاولة." : "Super convenient ordering from QR code. We didn't have to wait for the check, ordered and paid instantly right at Table 12."
    }
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto text-white font-sans">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto mt-4">
        
        {/* Left side: Rate us form */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[28px] p-6 shadow-2xl space-y-6">
          <div>
            <h3 className="font-display font-semibold text-base text-white flex items-center gap-1.5">
              <MessageSquare className="w-5 h-5 text-[#C9A050]" /> {isArabic ? "شاركنا رأيك وتجربتك" : "Share Your Experience"}
            </h3>
            <p className="text-xs text-[#888888] mt-1">{isArabic ? "تقييمك الصادق يساعدنا في تحسين الوصفات وتقديم أفضل خدمة." : "Your real reviews refine our recipes and help our baristas."}</p>
          </div>

          <div className="space-y-2">
            {renderStarsSelector(isArabic ? "جودة الطعام والشراب" : "Food Quality", foodRating, setFoodRating)}
            {renderStarsSelector(isArabic ? "خدمة الموظفين" : "Waiter Service", serviceRating, setServiceRating)}
            {renderStarsSelector(isArabic ? "أجواء الكافيه" : "Cafe Ambience", atmosphereRating, setAtmosphereRating)}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-display font-bold uppercase tracking-wider text-white/40 block">{isArabic ? "ملاحظات وتفاصيل التقييم" : "Review remarks"}</label>
            <textarea
              id="review-comment-textarea"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={isArabic ? "أخبرنا عن نكهة القهوة، جودة الطعام، أو انطباعك عن الخدمة..." : "Tell us about the cardamom spices, burger juiciness, or coffee aromas..."}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-2xl p-3.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-[#C9A050]/50"
            />
          </div>

          <button
            id="submit-review-action"
            onClick={handleSubmitReview}
            disabled={isSubmitting}
            className="w-full bg-[#C9A050] hover:bg-[#a7823e] text-[#050505] font-bold py-3 rounded-full text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (isArabic ? "جاري الإرسال..." : "Submitting...") : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{isArabic ? "إرسال التقييم" : "Submit Dining Feedback"}</span>
              </>
            )}
          </button>
        </div>

        {/* Right side: Public community feedback logs */}
        <div className="space-y-5">
          <h3 className="font-display font-semibold text-sm text-white/40 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C9A050] animate-pulse" /> {isArabic ? "آراء زوار الكافيه" : "Community Diners Reviews"}
          </h3>

          <div className="space-y-4">
            {feedbackSamples.map((sample, idx) => (
              <div key={idx} className="bg-white/5 border border-white/5 p-4.5 rounded-2xl shadow-md space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-white">{sample.name}</span>
                  <span className="text-white/30 font-mono text-[10px]">{sample.date}</span>
                </div>

                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`w-3 h-3 ${s <= sample.stars ? "fill-[#C9A050] text-[#C9A050]" : "text-white/10"}`} />
                  ))}
                </div>

                <p className="text-xs text-[#888888] leading-relaxed italic">
                  "{sample.comments}"
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Review Submission Success Toast */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-4 right-4 max-w-sm mx-auto bg-[#0d0d0f]/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3.5 border border-[#C9A050]/20 z-50"
          >
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0">
              <Check className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#C9A050]">{isArabic ? "تم إرسال التقييم بنجاح!" : "Feedback Submitted!"}</p>
              <p className="text-[10px] text-white/80 mt-0.5">{isArabic ? "شكراً جزيلاً لك! تم حفظ تقييمك بنجاح." : "Thank you so much! Your review was securely saved to Firestore."}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
