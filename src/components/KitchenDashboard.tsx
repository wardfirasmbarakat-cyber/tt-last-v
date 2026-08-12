import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  orderBy,
  Timestamp
} from "firebase/firestore";
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  Printer,
  Sparkles,
  Flame,
  Utensils,
  RefreshCw,
  ShoppingBag,
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Order } from "../types";

interface KitchenDashboardProps {
  onClose?: () => void;
}

export const KitchenDashboard: React.FC<KitchenDashboardProps> = ({ onClose }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<"New" | "all">("New");

  // Real-time Firestore onSnapshot listener using where('status', '==', 'New')
  useEffect(() => {
    setLoading(true);
    setError(null);

    let q;
    try {
      if (filterStatus === "New") {
        // Query filtering any variation of new/pending status
        q = query(
          collection(db, "orders"),
          where("status", "in", ["New", "new", "pending", "Pending"])
        );
      } else {
        q = query(collection(db, "orders"));
      }
    } catch (err) {
      console.error("[KitchenDashboard] Error building query:", err);
      q = collection(db, "orders");
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedOrders: Order[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedOrders.push({
            orderId: docSnap.id,
            id: docSnap.id,
            ...data
          } as Order);
        });

        // Sort by newest first
        fetchedOrders.sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });

        setOrders(fetchedOrders);
        setLoading(false);

        // Play audio alert on new incoming order if sound enabled
        if (soundEnabled && snapshot.docChanges().some(change => change.type === "added")) {
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3); // A5
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
          } catch (e) {
            // Audio context fallback
          }
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, "orders");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filterStatus, soundEnabled]);

  // Update order status in Firestore
  const handleUpdateStatus = async (orderId: string, newStatus: Order["status"]) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, {
        status: newStatus,
        orderStatus: newStatus,
        acknowledged: true,
        acknowledgedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    } catch (err) {
      console.error("[KitchenDashboard] Error updating order status:", err);
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      alert("Failed to update status. Please try again.");
    }
  };

  // Helper to calculate minutes elapsed
  const getElapsedMinutes = (createdAt: any) => {
    if (!createdAt) return 0;
    const date = typeof createdAt.toDate === "function" ? createdAt.toDate() : new Date(createdAt);
    const diffMs = Date.now() - date.getTime();
    return Math.floor(diffMs / (1000 * 60));
  };

  return (
    <div className="min-h-screen bg-[#0a0a0d] text-white p-4 sm:p-6 lg:p-8 font-sans">
      {/* Top Header Navigation */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/10 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C9A050] to-[#9E7A33] flex items-center justify-center text-black font-bold shadow-lg shadow-[#C9A050]/20">
            <ChefHat className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-display font-bold text-white tracking-wide">
                Kitchen Display System
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                REAL-TIME LIVE
              </span>
            </div>
            <p className="text-xs text-white/50 font-mono mt-0.5">
              Listening to Firestore collection ('orders') • Filter: status == '{filterStatus}'
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              soundEnabled
                ? "bg-[#C9A050]/15 border-[#C9A050]/40 text-[#C9A050]"
                : "bg-white/5 border-white/10 text-white/50 hover:text-white"
            }`}
            title="Toggle sound alerts on new orders"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? "Chime On" : "Chime Muted"}</span>
          </button>

          <div className="flex rounded-xl bg-white/5 p-1 border border-white/10 text-xs font-mono font-medium">
            <button
              onClick={() => setFilterStatus("New")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === "New"
                  ? "bg-[#C9A050] text-black font-bold shadow-md"
                  : "text-white/60 hover:text-white"
              }`}
            >
              New Orders ({orders.length})
            </button>
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterStatus === "all"
                  ? "bg-[#C9A050] text-black font-bold shadow-md"
                  : "text-white/60 hover:text-white"
              }`}
            >
              All Orders
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer"
            >
              Back
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
          <RefreshCw className="w-10 h-10 text-[#C9A050] animate-spin" />
          <p className="text-sm font-mono text-white/60">
            Subscribing to Firestore real-time 'orders' stream...
          </p>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center max-w-md mx-auto space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm text-red-200">{error}</p>
          <button
            onClick={() => setFilterStatus("New")}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            Retry Subscription
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/10 rounded-3xl p-8 text-center bg-white/[0.02]">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 mb-4">
            <Utensils className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No New Kitchen Tickets</h3>
          <p className="text-xs text-white/50 max-w-sm mb-6 font-mono">
            Waiting for AI Waiter order submissions. Incoming orders will automatically trigger real-time updates and chime alerts.
          </p>
          <div className="flex items-center gap-2 text-[11px] font-mono text-[#C9A050] bg-[#C9A050]/10 border border-[#C9A050]/20 px-3 py-1.5 rounded-full">
            <Sparkles className="w-3.5 h-3.5" />
            <span>query(collection(db, 'orders'), where('status', '==', 'New'))</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {orders.map((order) => {
              const items = order.items || order.orderedItems || [];
              const elapsedMins = getElapsedMinutes(order.createdAt);
              const isUrgent = elapsedMins >= 10;

              return (
                <motion.div
                  key={order.orderId || (order as any).id}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -10 }}
                  className={`bg-[#121217] border rounded-2xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden transition-all ${
                    isUrgent
                      ? "border-red-500/60 shadow-red-500/10"
                      : "border-[#C9A050]/40 hover:border-[#C9A050]"
                  }`}
                >
                  {/* Top Bar: Table & Elapsed Time */}
                  <div>
                    <div className="flex items-start justify-between border-b border-white/10 pb-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-[#C9A050] bg-[#C9A050]/15 px-2.5 py-1 rounded-lg border border-[#C9A050]/30">
                            TABLE {order.tableNumber || "12"}
                          </span>
                          <span className="text-[11px] font-mono text-white/50">
                            #{order.orderId ? order.orderId.slice(-6).toUpperCase() : "REC"}
                          </span>
                        </div>
                        <div className="text-[11px] text-white/60 font-mono mt-1">
                          Source: <span className="text-white font-medium">{order.orderSource || "AI Waiter"}</span>
                        </div>
                      </div>

                      <div className={`text-right ${isUrgent ? "text-red-400 font-bold animate-pulse" : "text-amber-400"}`}>
                        <div className="flex items-center justify-end gap-1 text-xs font-mono font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{elapsedMins}m ago</span>
                        </div>
                        <span className="text-[10px] text-white/40 block font-mono">
                          {order.createdAt?.toDate
                            ? order.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : "Just now"}
                        </span>
                      </div>
                    </div>

                    {/* Order Items List */}
                    <div className="space-y-2.5 mb-4 max-h-60 overflow-y-auto pr-1">
                      {items.map((item, idx) => (
                        <div key={idx} className="bg-white/5 p-2.5 rounded-xl border border-white/5 text-xs">
                          <div className="flex items-start justify-between font-bold text-white">
                            <span className="flex items-center gap-1.5">
                              <span className="bg-[#C9A050] text-black w-5 h-5 rounded-md flex items-center justify-center font-mono text-xs font-bold">
                                {item.quantity || 1}
                              </span>
                              <span>{item.name}</span>
                            </span>
                            <span className="font-mono text-white/70">
                              {((item.price || (item as any).basePrice || 0) * (item.quantity || 1)).toFixed(2)} JD
                            </span>
                          </div>

                          {/* Item Customizations */}
                          {item.customizations && item.customizations.length > 0 && (
                            <div className="mt-1.5 text-[11px] text-white/60 pl-6 space-y-0.5">
                              {item.customizations.map((c, cIdx) => (
                                <div key={cIdx} className="flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-[#C9A050]" />
                                  <span>{c.title}:</span>
                                  <span className="text-white font-medium">
                                    {Array.isArray(c.selected) ? c.selected.join(", ") : c.selected}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Item Notes */}
                          {(item.note || item.notes) && (
                            <div className="mt-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg italic flex items-center gap-1">
                              <MessageSquare className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>"{item.note || item.notes}"</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Overall Order Kitchen Notes */}
                    {order.notes && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 text-xs text-amber-200 mb-4">
                        <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-amber-400 block mb-0.5">
                          Kitchen Special Instructions:
                        </span>
                        <p className="italic font-medium text-xs">"{order.notes}"</p>
                      </div>
                    )}
                  </div>

                  {/* Order Footer & Action Buttons */}
                  <div className="border-t border-white/10 pt-3 mt-2 space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-white/60">Payment: <strong className="text-white uppercase">{order.paymentMethod || "cash"}</strong></span>
                      <span className="text-base font-bold text-[#C9A050]">
                        {(order.total || 0).toFixed(2)} JD
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleUpdateStatus(order.orderId || (order as any).id || "", "preparing")}
                        className="py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-amber-500/30 transition-all cursor-pointer"
                      >
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        <span>Start Prep</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(order.orderId || (order as any).id || "", "ready")}
                        className="py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-500/30 transition-all cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Mark Ready</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default KitchenDashboard;
