import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShoppingCart, Trash2, Tag, CreditCard, Sparkles, CheckCircle2, Clock, Split, Heart, Download, Mail, ArrowRight, Table, Loader2, ChefHat } from "lucide-react";
import { CartItem, Order, OrderItem, RestaurantSettings } from "../types";
import { CartOrderService } from "../services/voice/cartOrderService";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, setDoc, updateDoc, increment } from "firebase/firestore";
import { useLanguage } from "../context/LanguageContext";
import { getItemImage, DEFAULT_MENU_ITEM_IMAGE } from "../data/menu";
import { dispatchPushNotification } from "../lib/fcm";
import { safeSessionStorage } from "../utils/safeStorage";

interface CartAndOrderingProps {
  cart: CartItem[];
  onUpdateQuantity: (cartId: string, delta: number) => void;
  onRemoveItem: (cartId: string) => void;
  onClearCart: () => void;
  userId: string | null;
  tableNumber: string;
  onOrderPlaced: (order: Order) => void;
  activeOrder: Order | null;
  onUpdateActiveOrder: (order: Order) => void;
  settings?: RestaurantSettings;
}

const PROMO_CODES: Record<string, number> = {
  WELCOME10: 0.10,
  LOVETABLE: 0.15
};

export default function CartAndOrdering({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  userId,
  tableNumber,
  onOrderPlaced,
  activeOrder,
  onUpdateActiveOrder,
  settings
}: CartAndOrderingProps) {
  const { t, isArabic } = useLanguage();
  const [promoInput, setPromoInput] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [appliedPromo, setAppliedPromo] = useState("");
  const [promoError, setPromoError] = useState("");

  // Segment sub-tab: "cart" or "tracker" (allows ordering more items while tracking)
  const [cartTab, setCartTab] = useState<"cart" | "tracker">(activeOrder ? "tracker" : "cart");

  // Track transition of activeOrder (null -> non-null) to auto-focus Live Tracker
  const hadActiveOrderRef = useRef(!!activeOrder);
  useEffect(() => {
    if (activeOrder && !hadActiveOrderRef.current) {
      setCartTab("tracker");
    } else if (!activeOrder && hadActiveOrderRef.current) {
      setCartTab("cart");
    }
    hadActiveOrderRef.current = !!activeOrder;
  }, [activeOrder]);

  // Payment states
  const [isPaying, setIsPaying] = useState(false);
  const [tipPercent, setTipPercent] = useState(0);
  const [splitCount, setSplitCount] = useState(1);
  const [isPaidSuccess, setIsPaidSuccess] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"card" | "cash" | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate pricing math
  const totals = CartOrderService.calculateCartTotal(cart);
  const subtotal = totals.subtotal;
  const tax = totals.tax;
  const talkTableFee = totals.talkTableFee;
  const total = totals.total;
  const taxRate = settings?.taxRate ?? 0;
  const discountAmount = 0; // Discounts are ignored per strict server-side total formula
  const serviceFee = 0;

  const handleApplyPromo = () => {
    setPromoError("");
    const code = promoInput.trim().toUpperCase();
    if (PROMO_CODES[code] !== undefined) {
      setDiscountPercent(PROMO_CODES[code]);
      setAppliedPromo(code);
      setPromoInput("");
    } else {
      setPromoError("Invalid promotional code.");
    }
  };

  // 1. Submit Order to Firestore
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (!selectedPaymentMethod) {
      setPaymentError("Please select how you will pay before placing your order.");
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    setPaymentError("");

    const orderId = `ord_${Date.now()}`;
    try {
      const result = await CartOrderService.submitConfirmedOrder({
        tableNumber: String(tableNumber),
        cartItems: cart,
        userId: userId || "guest_user",
        paymentMethod: selectedPaymentMethod,
        orderNotes: "",
        sessionId: safeSessionStorage.getItem("selected_table_number") || String(tableNumber)
      });

      if (result.success && result.order) {
        console.log("=== ORDER PLACED SUCCESSFULLY VIA CARTORDERSERVICE ===");
        onOrderPlaced(result.order);
        onClearCart();
        setDiscountPercent(0);
        setAppliedPromo("");
        setPaymentError("");
      } else {
        console.error("=== ORDER PLACEMENT FAILED ===", result.error);
        setPaymentError(`Failed to submit order to kitchen: ${result.error || "Please try again."}`);
      }
    } catch (err: any) {
      console.error("=== ORDER PLACEMENT EXCEPTION ===", err);
      setPaymentError(`An unexpected error occurred: ${err.message || "Failed to submit order."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Live order state machine runner (updates locally and in Firestore)
  useEffect(() => {
    if (!activeOrder || activeOrder.status === "delivered" || activeOrder.status === "cancelled") return;

    const timer = setTimeout(async () => {
      let nextStatus: Order["status"] = "pending";
      if (activeOrder.status === "pending") {
        nextStatus = "preparing";
      } else if (activeOrder.status === "preparing") {
        nextStatus = "ready";
      } else if (activeOrder.status === "ready") {
        nextStatus = "delivered";
      }

      const updatedOrder: Order = {
        ...activeOrder,
        status: nextStatus,
        orderStatus: nextStatus,
        updatedAt: new Date()
      };

      try {
        await updateDoc(doc(db, "orders", activeOrder.orderId), {
          status: nextStatus,
          orderStatus: nextStatus,
          updatedAt: new Date()
        });
        onUpdateActiveOrder(updatedOrder);

        if (nextStatus === "delivered") {
          await updateDoc(doc(db, "settings", "restaurant"), {
            currentShiftTalkTableFee: increment(0.05)
          });
        }
      } catch (err) {
        console.error("Failed to update status in Firestore:", err);
        onUpdateActiveOrder(updatedOrder); // fallback local update
      }
    }, 12000); // Progress states every 12 seconds for the simulation

    return () => clearTimeout(timer);
  }, [activeOrder]);

  // Execute payment
  const handlePayOrder = async () => {
    if (!activeOrder) return;
    setIsPaying(true);

    try {
      await updateDoc(doc(db, "orders", activeOrder.orderId), {
        paymentStatus: "paid",
        updatedAt: new Date()
      });

      // Update local loyalty points if signed in
      if (userId) {
        const userRef = doc(db, "users", userId);
        // We will increment the points dynamically, for simplicity we can trigger parent updates
      }

      setTimeout(() => {
        setIsPaying(false);
        setIsPaidSuccess(true);
        const paidOrder: Order = {
          ...activeOrder,
          paymentStatus: "paid"
        };
        onUpdateActiveOrder(paidOrder);
      }, 1500);

    } catch (err) {
      setIsPaying(false);
      handleFirestoreError(err, OperationType.WRITE, `orders/${activeOrder.orderId}`);
    }
  };

  const handleDownloadReceipt = () => {
    if (!activeOrder) return;
    const receiptText = `
=================================
       TALKTABLEE RECEIPT
=================================
Order ID: ${activeOrder.orderId}
Table Number: Table ${activeOrder.tableNumber}
Date: ${new Date().toLocaleDateString()}
---------------------------------
Items Ordered:
${activeOrder.items.map(item => `- ${item.name} x${item.quantity}: ${(item.price * item.quantity).toFixed(2)} JD`).join("\n")}
---------------------------------
Subtotal: ${activeOrder.subtotal.toFixed(2)} JD
Tax: 0.00 JD (Tax Inclusive)
TalkTablee Fee: ${(activeOrder.talkTableFee || (activeOrder as any).talkTableeFee || 0.05).toFixed(2)} JD
Tip (${tipPercent}%): ${(activeOrder.total * (tipPercent / 100)).toFixed(2)} JD
---------------------------------
Grand Total Paid: ${(activeOrder.total * (1 + tipPercent / 100)).toFixed(2)} JD
Split Amount (${splitCount} way): ${((activeOrder.total * (1 + tipPercent / 100)) / splitCount).toFixed(2)} JD

Thank you for dining with us!
=================================
    `;
    const blob = new Blob([receiptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `TalkTablee_Receipt_${activeOrder.orderId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCancelOrder = async () => {
    if (!activeOrder || activeOrder.status !== "pending") return;
    if (window.confirm("Are you sure you want to cancel your order?")) {
      try {
        await updateDoc(doc(db, "orders", activeOrder.orderId), {
          status: "cancelled",
          orderStatus: "cancelled",
          updatedAt: new Date()
        });
        const cancelledOrder: Order = {
          ...activeOrder,
          status: "cancelled",
          orderStatus: "cancelled",
          updatedAt: new Date()
        };
        onUpdateActiveOrder(cancelledOrder);
      } catch (err) {
        console.error("Failed to cancel order:", err);
      }
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto text-white">
      
      {/* Sub-tab segment switcher if customer has a live or previous active order */}
      {activeOrder && (
        <div className="flex bg-white/5 p-1 rounded-2xl max-w-md mx-auto mb-6 border border-white/5">
          <button
            id="cart-tab-cart"
            onClick={() => setCartTab("cart")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold font-display transition-all cursor-pointer ${
              cartTab === "cart"
                ? "bg-[#C9A050] text-[#050505] shadow-lg shadow-[#C9A050]/15"
                : "text-white/60 hover:text-white"
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>{isArabic ? "السلة" : "My Cart"} {cart.length > 0 && `(${cart.length})`}</span>
          </button>
          <button
            id="cart-tab-tracker"
            onClick={() => setCartTab("tracker")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold font-display transition-all cursor-pointer ${
              cartTab === "tracker"
                ? "bg-[#C9A050] text-[#050505] shadow-lg shadow-[#C9A050]/15"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{isArabic ? "تتبع الطلب" : "Live Tracker"}</span>
            {activeOrder.status !== "delivered" && activeOrder.status !== "cancelled" && activeOrder.status !== "finished" && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>
      )}

      {/* 1. If we have an active placed order and on tracker tab, show the Live Tracker */}
      {activeOrder && cartTab === "tracker" ? (
        <div className="space-y-6">
          {/* Order Sent Successfully Confirmation Screen */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-950/20 border border-emerald-500/20 rounded-[28px] p-6 text-center space-y-4 shadow-xl"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-white">
                {isArabic ? "✅ تم إرسال الطلب بنجاح" : "✅ Order Sent Successfully"}
              </h3>
              <p className="text-xs text-white/70 mt-1">
                {isArabic ? "تم استلام طلبك بنجاح وسيقوم المطبخ بتحضيره." : "Your order has been received by the restaurant."}
              </p>
            </div>

            <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl max-w-sm mx-auto text-right font-sans">
              <span className="text-[10px] uppercase tracking-wider font-mono text-white/40 font-bold block mb-1">
                {isArabic ? "طريقة الدفع المختارة" : "Selected Payment Method"}
              </span>
              <div className="flex items-center gap-2.5 text-sm text-white font-medium">
                {activeOrder.paymentMethod === "card" ? (
                  <>
                    <span className="text-2xl">💳</span>
                    <div>
                      <p className="font-display">{isArabic ? "بطاقة (الدفع بالكافيه)" : "Card (Pay at Restaurant)"}</p>
                      <p className="text-[10px] text-white/50 font-normal mt-0.5">{isArabic ? "يرجى الدفع بالبطاقة عند تقديم الطلب أو لدى الكاشير." : "Please pay by card when your order arrives or at the cashier."}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">💵</span>
                    <div>
                      <p className="font-display">{isArabic ? "كاش (نقداً بالكافيه)" : "Cash (Pay at Restaurant)"}</p>
                      <p className="text-[10px] text-white/50 font-normal mt-0.5">{isArabic ? "يرجى الدفع نقداً عند تقديم الطلب أو لدى الكاشير." : "Please pay with cash when your order arrives or at the cashier."}</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-[#C9A050] font-medium font-display">
              {isArabic ? "جاري تحضير طلبكم وسيصلكم قريباً." : "A waiter will prepare your order shortly."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/5 backdrop-blur-xl rounded-[28px] border border-white/10 p-6 shadow-2xl text-center"
          >
            <div className="inline-flex items-center gap-1.5 bg-[#C9A050]/10 text-[#C9A050] text-[10px] font-mono px-3 py-1 rounded-full font-semibold border border-[#C9A050]/20 mb-4">
              <Clock className="w-3.5 h-3.5" /> {isArabic ? "تتبع الطلب الحي" : "Live Order Tracking"}
            </div>

            <h3 className="font-display font-semibold text-lg text-white">
              {isArabic ? `طلب رقم #${activeOrder.orderId.slice(-6).toUpperCase()}` : `Order #${activeOrder.orderId.slice(-6).toUpperCase()}`}
            </h3>
            <p className="text-xs text-[#888888] mt-0.5">{isArabic ? `طاولة رقم ${activeOrder.tableNumber}` : `Table ${activeOrder.tableNumber}`} • {new Date(activeOrder.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>

            {/* Preparation state pipeline line */}
            <div className="relative flex justify-between max-w-sm mx-auto mt-8 mb-6">
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-white/5 z-0" />
              <div
                className="absolute top-4 left-0 h-0.5 bg-[#C9A050] transition-all duration-1000 z-0"
                style={{
                  width: activeOrder.status === "pending" ? "0%" :
                         activeOrder.status === "preparing" ? "33%" :
                         activeOrder.status === "ready" ? "66%" : "100%"
                }}
              />

              {/* Steps */}
              {["pending", "preparing", "ready", "delivered"].map((step, idx) => {
                const statuses = ["pending", "preparing", "ready", "delivered"];
                const currentIdx = statuses.indexOf(activeOrder.status);
                const isCompleted = idx <= currentIdx;
                const isCurrent = idx === currentIdx;

                let stepLabel = isArabic ? "استلام" : "Received";
                if (step === "preparing") stepLabel = isArabic ? "تحضير" : "Preparing";
                if (step === "ready") stepLabel = isArabic ? "جاهز" : "Ready";
                if (step === "delivered") stepLabel = isArabic ? "مقدَّم" : "Served";

                return (
                  <div key={step} className="flex flex-col items-center z-10 relative">
                    <div className="relative">
                      {isCurrent && (
                        <motion.div
                          animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                          className="absolute inset-0 rounded-full bg-[#C9A050]/40 z-0 pointer-events-none"
                        />
                      )}
                      <motion.div
                        animate={isCurrent ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all relative z-10 ${
                          isCompleted ? "bg-[#C9A050] border-[#C9A050] text-[#050505] shadow-lg shadow-[#C9A050]/30" : "bg-[#050505] border-white/10 text-white/40"
                        }`}
                      >
                        {isCompleted && !isCurrent ? (
                          <span className="text-[10px] font-bold">✓</span>
                        ) : (
                          <span className="text-[10px] font-bold font-mono">{idx + 1}</span>
                        )}
                      </motion.div>
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-wider font-mono mt-2 transition-colors ${
                      isCurrent ? "text-[#C9A050] drop-shadow-[0_0_10px_rgba(201,160,80,0.4)]" : isCompleted ? "text-white" : "text-white/30"
                    }`}>
                      {stepLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Current status description */}
            <div className="bg-white/5 border border-white/5 p-4 rounded-2xl max-w-md mx-auto mb-4 font-sans">
              <p className="text-xs font-semibold text-white">
                {activeOrder.status === "pending" && (isArabic ? "تم استلام الطلب ووضعه في قائمة المطبخ." : "Order received and queued directly on the chef's watchboard.")}
                {activeOrder.status === "preparing" && (isArabic ? "جاري تحضير طلبك بعناية في المطبخ." : "Chef is handcrafting your gourmet selection with care.")}
                {activeOrder.status === "ready" && (isArabic ? "طلبك جاهز وسيقدم على طاولتك الآن." : "Your dishes are perfectly plated and ready to be served.")}
                {activeOrder.status === "delivered" && (isArabic ? "تم تقديم الطلب. بالهناء والشفاء!" : "Served and delivered. Enjoy your exquisite culinary experience!")}
                {activeOrder.status === "cancelled" && (isArabic ? "تم إلغاء هذا الطلب." : "This order has been cancelled.")}
              </p>
              <p className="text-[10px] text-[#888888] mt-1 font-mono">
                {activeOrder.status === "cancelled" ? (isArabic ? "حالة الطلب: ملغى" : "Order Status: Cancelled") : activeOrder.status !== "delivered" ? (isArabic ? "الوقت المقدر للتحضير: ~5-10 دقائق" : "Estimated prep remaining: ~5-10 mins") : (isArabic ? "مكتمل" : "Order complete")}
              </p>
            </div>

            {/* Cancel Order Button */}
            {activeOrder.status === "pending" && (
              <button
                id="customer-cancel-order"
                onClick={handleCancelOrder}
                className="mb-4 w-full max-w-xs mx-auto flex items-center justify-center gap-1.5 py-2.5 px-4 bg-red-950/20 hover:bg-red-900/30 border border-red-500/30 hover:border-red-500/50 text-red-400 rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isArabic ? "إلغاء الطلب" : "Cancel Order"}</span>
              </button>
            )}


          </motion.div>

          {/* Payment Card (Active only when order is delivered or ready to be paid) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[28px] p-6 shadow-2xl mt-6 font-sans"
          >
            <h3 className="font-display font-semibold text-base text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#C9A050]" /> {isArabic ? "الدفع والفاتورة" : "Payment & Billing"}
            </h3>

            {activeOrder.paymentStatus === "paid" || isPaidSuccess ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h4 className="font-display font-semibold text-base text-green-400">{isArabic ? "تم تسوية الفاتورة بنجاح" : "Bill Settled Successfully"}</h4>
                <p className="text-xs text-[#888888] mt-1">{isArabic ? "شكراً لكم! تم استلام الدفعة وتأكيدها من قبل طاقم العمل." : "Thank you! Your payment has been received and confirmed by staff."}</p>

                {/* Print/Download and Email controls */}
                <div className="flex justify-center gap-3 mt-6">
                  <button
                    id="download-receipt"
                    onClick={handleDownloadReceipt}
                    className="inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-xs py-2 px-4 rounded-xl font-medium border border-white/10 text-[#C9A050] transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> {isArabic ? "تحميل الفاتورة" : "Download Receipt"}
                  </button>
                  <button
                    id="email-receipt"
                    className="inline-flex items-center gap-1.5 bg-[#C9A050] hover:bg-[#a7823e] text-[#050505] text-xs py-2 px-4 rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    <Mail className="w-4 h-4" /> {isArabic ? "إرسال للبريد" : "Email Receipt"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Order total info */}
                <div className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                  <div>
                    <span className="text-[10px] text-white/40 block uppercase font-mono">{isArabic ? "المبلغ المستحق" : "Total Due"}</span>
                    <span className="text-lg font-mono font-bold text-white">{activeOrder.total.toFixed(2)} د.أ</span>
                  </div>
                </div>

                {/* Add a tip selector */}
                <div className="space-y-2">
                  <span className="text-xs font-display font-semibold uppercase tracking-wider text-white/40">{isArabic ? "إضافة إكرامية للموظف" : "Add gratuity tip"}</span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0, 5, 10, 15, 20].map((percent) => (
                      <button
                        id={`tip-percent-${percent}`}
                        key={percent}
                        onClick={() => setTipPercent(percent)}
                        className={`py-2 text-xs font-mono font-bold rounded-xl border transition-all cursor-pointer ${
                          tipPercent === percent ? "bg-[#C9A050] border-[#C9A050] text-[#050505]" : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bill Splitting options */}
                <div className="space-y-2">
                  <span className="text-xs font-display font-semibold uppercase tracking-wider text-white/40 flex items-center gap-1">
                    <Split className="w-3.5 h-3.5" /> {isArabic ? "تقسيم الفاتورة بالتساوي" : "Split Bill Evenly"}
                  </span>
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3">
                    <div className="flex-1">
                      <span className="text-xs text-white/40 block uppercase font-mono">{isArabic ? "عدد الأشخاص" : "Number of Ways"}</span>
                      <span className="text-xs font-bold text-white">{splitCount} {isArabic ? "أشخاص" : "person"}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        id="split-decrease"
                        onClick={() => setSplitCount(Math.max(1, splitCount - 1))}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/5 flex items-center justify-center font-bold text-xs cursor-pointer text-white"
                      >
                        -
                      </button>
                      <button
                        id="split-increase"
                        onClick={() => setSplitCount(splitCount + 1)}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/5 flex items-center justify-center font-bold text-xs cursor-pointer text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {splitCount > 1 && (
                    <div className="text-xs font-mono font-bold text-[#C9A050] bg-[#C9A050]/10 p-3 rounded-xl border border-[#C9A050]/20 flex justify-between mt-1">
                      <span>{isArabic ? "حصة الشخص الواحد:" : "Per Person Share:"}</span>
                      <span>{((activeOrder.total * (1 + tipPercent / 100)) / splitCount).toFixed(2)} د.أ</span>
                    </div>
                  )}
                </div>

                {/* Pay at Restaurant Info Badge */}
                <div className="pt-4 border-t border-white/5">
                  <div className="bg-[#C9A050]/10 border border-[#C9A050]/20 rounded-2xl p-4 text-center">
                    <p className="text-xs font-semibold text-[#C9A050] flex items-center justify-center gap-1.5">
                      {activeOrder.paymentMethod === "card" ? (isArabic ? "💳 تم اختيار الدفع بالبطاقة" : "💳 Card Payment Selected") : (isArabic ? "💵 تم اختيار الدفع كاش" : "💵 Cash Payment Selected")}
                    </p>
                    <p className="text-[10px] text-white/50 mt-1 leading-relaxed">
                      {isArabic ? "بانتظار تأكيد الموظف. يرجى دفع" : "Awaiting staff validation. Please pay"} <span className="font-bold text-white">{(activeOrder.total * (1 + tipPercent / 100)).toFixed(2)} د.أ</span> {isArabic ? "عند وصول طلبك أو لدى الكاشير." : "in person when your order is served or at the cashier."}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      ) : (
        // 2. Otherwise, if no active placed order, show current Cart specs
        <div className="font-sans">
          <h2 className="font-display font-semibold text-lg mb-6 flex items-center gap-2 text-white">
            <ShoppingCart className="w-5.5 h-5.5 text-[#C9A050]" /> {isArabic ? "سلة الطلبات" : "Your Cart"}
          </h2>

          {cart.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-[28px] p-6">
              <ShoppingCart className="w-10 h-10 text-white/20 mb-3" />
              <p className="font-display font-medium text-white text-sm">{isArabic ? "سلة الطلبات فارغة" : "Your order card is empty"}</p>
              <p className="text-xs text-[#888888] mt-1">{isArabic ? "تصفح القائمة أو تحدث مع ورد لإضافة أصناف شهية!" : "Go to the menu tab to add some gourmet coffee or burgers"}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Cart line items list */}
              <div className="bg-white/5 border border-white/10 rounded-[28px] overflow-hidden shadow-2xl">
                <div className="divide-y divide-white/5 p-2">
                  {cart.map((item) => (
                    <div id={`cart-item-row-${item.id}`} key={item.id} className="p-4 flex gap-4 items-start">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 shrink-0 flex items-center justify-center border border-white/10">
                        <img
                          src={getItemImage(item)}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = DEFAULT_MENU_ITEM_IMAGE;
                          }}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <h4 className="text-xs font-semibold text-white truncate">{isArabic ? (item.nameAr || item.name) : item.name}</h4>
                          <span className="font-mono font-bold text-xs text-[#C9A050] ml-2 whitespace-nowrap">
                            {(item.price * item.quantity).toFixed(2)} د.أ
                          </span>
                        </div>

                        {/* Customization strings list */}
                        {item.customizations.some(c => c.selected.length > 0) ? (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {item.customizations.map(c => {
                              if (c.selected.length === 0) return null;
                              return (
                                <span key={c.title} className="text-[9px] bg-[#C9A050]/10 border border-[#C9A050]/10 text-[#C9A050] px-1.5 py-0.5 rounded-md font-medium">
                                  {c.title}: {c.selected.join(", ")}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[10px] text-white/30 mt-1">{isArabic ? "إعداد قياسي" : "Standard preparation"}</p>
                        )}

                        {/* Quantity adjusting and delete line */}
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-2.5 bg-white/5 rounded-full p-1 border border-white/10">
                            <button
                              id={`cart-decrease-${item.id}`}
                              onClick={() => onUpdateQuantity(item.id, -1)}
                              className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs cursor-pointer shadow-sm hover:bg-white/20 text-white"
                            >
                              -
                            </button>
                            <span className="font-mono text-xs font-bold w-4 text-center text-white">{item.quantity}</span>
                            <button
                              id={`cart-increase-${item.id}`}
                              onClick={() => onUpdateQuantity(item.id, 1)}
                              className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs cursor-pointer shadow-sm hover:bg-white/20 text-white"
                            >
                              +
                            </button>
                          </div>

                          <button
                            id={`cart-remove-${item.id}`}
                            onClick={() => onRemoveItem(item.id)}
                            className="text-white/40 hover:text-red-400 transition-colors p-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill totals card summary */}
              <div className="bg-white/5 border border-white/10 rounded-[28px] p-5 shadow-xl space-y-3.5">
                <div className="flex justify-between text-xs text-white/60 font-medium">
                  <span>{isArabic ? "المجموع الفرعي" : "Subtotal"}</span>
                  <span className="font-mono">{subtotal.toFixed(2)} {settings?.currency || "JD"}</span>
                </div>
                <div className="flex justify-between text-xs text-white/60 font-medium border-t border-white/5 pt-3">
                  <span>{isArabic ? "الضريبة (شاملة)" : "Tax (Inclusive)"}</span>
                  <span className="font-mono">0.00 {settings?.currency || "JD"}</span>
                </div>
                <div className="flex justify-between text-xs text-[#C9A050] font-medium border-t border-white/5 pt-3">
                  <span>{isArabic ? "رسوم الخدمة" : "TalkTablee Fee"}</span>
                  <span className="font-mono">{talkTableFee.toFixed(2)} {settings?.currency || "JD"}</span>
                </div>
                <div className="border-t border-white/5 pt-3 flex justify-between items-center text-sm font-bold">
                  <span className="font-display">{isArabic ? "المجموع الكلي" : "Grand Total"}</span>
                  <span className="font-mono text-lg text-white">{total.toFixed(2)} {settings?.currency || "JD"}</span>
                </div>
              </div>

              {/* Payment Method Selection */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-display font-semibold uppercase tracking-wider text-white/40">
                    {isArabic ? "اختر طريقة الدفع" : "Select Payment Method"}
                  </span>
                  {paymentError && (
                    <span className="text-[10px] text-rose-400 font-medium animate-pulse">
                      {paymentError}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Card option */}
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      setSelectedPaymentMethod("card");
                      setPaymentError("");
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-28 relative overflow-hidden ${
                      selectedPaymentMethod === "card"
                        ? "bg-[#C9A050]/10 border-[#C9A050] text-white shadow-lg shadow-[#C9A050]/5"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-2xl">💳</span>
                      {selectedPaymentMethod === "card" && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-5 h-5 rounded-full bg-[#C9A050] text-[#050505] flex items-center justify-center"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />
                        </motion.div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold font-display">{isArabic ? "بطاقة (فيزا / ماستركارد)" : "Card (Visa / Mastercard)"}</h4>
                      <p className="text-[10px] text-white/40 mt-1 leading-normal">
                        {isArabic ? "الدفع بالبطاقة المصرفية عند وصول الطلب أو لدى الكاشير." : "Pay using your bank card when your order arrives or at the cashier."}
                      </p>
                    </div>
                  </motion.div>

                  {/* Cash option */}
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      setSelectedPaymentMethod("cash");
                      setPaymentError("");
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-28 relative overflow-hidden ${
                      selectedPaymentMethod === "cash"
                        ? "bg-[#C9A050]/10 border-[#C9A050] text-white shadow-lg shadow-[#C9A050]/5"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-2xl">💵</span>
                      {selectedPaymentMethod === "cash" && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-5 h-5 rounded-full bg-[#C9A050] text-[#050505] flex items-center justify-center"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />
                        </motion.div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold font-display">{isArabic ? "كاش (نقداً)" : "Cash"}</h4>
                      <p className="text-[10px] text-white/40 mt-1 leading-normal">
                        {isArabic ? "الدفع نقداً عند وصول الطلب أو لدى الكاشير." : "Pay with cash when your order arrives or at the cashier."}
                      </p>
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Place Order CTA Button */}
              <div className="space-y-2">
                {!selectedPaymentMethod && (
                  <p className="text-center text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/15 py-2 px-4 rounded-xl font-medium">
                    {isArabic ? "⚠️ يرجى تحديد طريقة الدفع قبل إرسال الطلب." : "⚠️ Please select how you will pay before placing your order."}
                  </p>
                )}
                <button
                  id="submit-order"
                  onClick={handlePlaceOrder}
                  disabled={isSubmitting || !selectedPaymentMethod}
                  className={`w-full font-bold py-4 rounded-full text-xs transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                    selectedPaymentMethod && !isSubmitting
                      ? "bg-[#C9A050] hover:bg-[#a7823e] text-[#050505] shadow-lg shadow-[#C9A050]/10"
                      : "bg-white/5 text-white/20 border border-white/5 cursor-not-allowed"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#050505]" />
                      <span>{isArabic ? "جاري إرسال الطلب إلى المطبخ..." : "Sending Spec to Kitchen..."}</span>
                    </>
                  ) : (
                    <>
                      <span>{isArabic ? "إرسال الطلب إلى المطبخ" : "Send Order Spec to Kitchen"}</span>
                      <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
