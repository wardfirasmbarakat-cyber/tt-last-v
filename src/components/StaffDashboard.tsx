import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ChefHat, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Utensils, 
  Bell, 
  DollarSign, 
  LogOut, 
  Lock, 
  Sparkles, 
  ArrowRight, 
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Users,
  FileText,
  Laptop,
  Smartphone,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  SlidersHorizontal,
  Download,
  BellRing,
  Volume2,
  VolumeX,
  Volume1,
  AlertTriangle
} from "lucide-react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, deleteDoc, setDoc, where, increment, getDoc, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { SessionService } from "../services/sessionService";
import { Order, WaiterRequest, Shift, RestaurantSettings, UserProfile, RESTAURANT_ID } from "../types";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "./LanguageToggle";
import RestaurantManagement from "./RestaurantManagement";
import PwaInstallBanner from "./PwaInstallBanner";
import { registerFcmAndGetToken, setupForegroundMessageListener } from "../lib/fcm";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { safeLocalStorage, safeSessionStorage } from "../utils/safeStorage";

interface StaffDashboardProps {
  onExit?: () => void;
}

export default function StaffDashboard({ onExit }: StaffDashboardProps) {
  const { t, isArabic, dir } = useLanguage();
  const [forcePwaKey, setForcePwaKey] = useState<number>(0);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return safeSessionStorage.getItem("staff_authenticated") === "true";
  });
  const [role, setRole] = useState<"staff" | "owner" | null>(() => {
    return safeSessionStorage.getItem("staff_role") as any;
  });
  const [passcode, setPasscode] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Device Selection & Responsive Layout Mode States
  const autoDetectDeviceType = (): "desktop" | "mobile" => {
    if (typeof window === "undefined") return "desktop";
    const width = window.innerWidth;
    const isTouchOrMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return (width < 1024 || isTouchOrMobileUA) ? "mobile" : "desktop";
  };

  const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile">((): "desktop" | "mobile" => {
    const saved = safeLocalStorage.getItem("talktable_device_mode");
    if (saved === "desktop" || saved === "mobile") return saved;
    return autoDetectDeviceType();
  });

  const [rememberDeviceChoice, setRememberDeviceChoice] = useState<boolean>(() => {
    return safeLocalStorage.getItem("talktable_remember_device_mode") === "true";
  });

  const [isDeviceChoiceConfirmed, setIsDeviceChoiceConfirmed] = useState<boolean>(() => {
    const saved = safeLocalStorage.getItem("talktable_device_mode");
    const remembered = safeLocalStorage.getItem("talktable_remember_device_mode") === "true";
    return remembered && (saved === "desktop" || saved === "mobile");
  });

  const [mismatchTargetMode, setMismatchTargetMode] = useState<"desktop" | "mobile" | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const handleSelectDeviceMode = (selectedMode: "desktop" | "mobile", force = false) => {
    const actualDetected = autoDetectDeviceType();
    
    if (!force && selectedMode !== actualDetected) {
      setMismatchTargetMode(selectedMode);
      return;
    }

    setDeviceMode(selectedMode);
    setIsDeviceChoiceConfirmed(true);
    safeLocalStorage.setItem("talktable_device_mode", selectedMode);
    
    if (rememberDeviceChoice) {
      safeLocalStorage.setItem("talktable_remember_device_mode", "true");
    } else {
      safeLocalStorage.removeItem("talktable_remember_device_mode");
    }

    setMismatchTargetMode(null);
  };

  // Keyboard Shortcuts for Desktop Mode
  useEffect(() => {
    if (!isAuthenticated || !isDeviceChoiceConfirmed || deviceMode !== "desktop") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "1") setActiveTab("orders");
      if (e.key === "2") setActiveTab("requests");
      if (e.key === "3") setActiveTab("tables");
      if (e.key === "4") setActiveTab("restaurant-management");
      if (e.key === "5" && role === "owner") setActiveTab("analytics");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthenticated, isDeviceChoiceConfirmed, deviceMode, role]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [waiterRequests, setWaiterRequests] = useState<WaiterRequest[]>([]);
  const [activeTab, setActiveTab] = useState<"orders" | "requests" | "tables" | "settings" | "reviews" | "analytics" | "restaurant-management">("orders");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [occupiedTables, setOccupiedTables] = useState<Record<string, { tableId: string; isOccupied: boolean; userId: string; updatedAt?: any }>>({});
  const [users, setUsers] = useState<Record<string, UserProfile>>({});

  // Real-time Shift tracking states
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Reviews, settings and analytics states
  const [reviews, setReviews] = useState<any[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [editingSettings, setEditingSettings] = useState<any>({
    name: "L'Ambroisie Royale",
    description: "Contactless fine dining experience with AI-powered interactive tableside service.",
    logo: "",
    coverImage: "",
    address: "Premium Circle Area, Amman, Jordan",
    phone: "+962 7 9000 0000",
    businessHours: "12:00 PM - 11:30 PM",
    cuisineType: "Fine Dining / Mediterranean / French Fusion",
    currency: "JD",
    language: "en",
    taxRate: 0,
    serviceFee: 0.05,
    isServiceFeeEnabled: true,
    acceptedPaymentMethods: ["cash", "card"],
    facebook: "https://facebook.com/lambroisieroyale",
    instagram: "https://instagram.com/lambroisieroyale"
  });

  const [selectedQRTable, setSelectedQRTable] = useState<string>("1");

  // States for TalkTableee Fees reset dialog flow
  const [showResetAuthModal, setShowResetAuthModal] = useState<boolean>(false);
  const [resetPasswordInput, setResetPasswordInput] = useState<string>("");
  const [resetErrorMsg, setResetErrorMsg] = useState<string>("");
  const [isResetAuthorized, setIsResetAuthorized] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [confirmForceCloseTable, setConfirmForceCloseTable] = useState<string | null>(null);

  // FCM & Push Notification hook for staff device registration & token storage in staff_devices collection
  const {
    fcmToken,
    permission: pushPermission,
    requestPermission: handlePushRequestPermission,
    isIframe,
    error: pushError
  } = usePushNotifications({
    isAuthenticated,
    role: role === "owner" ? "owner" : "staff",
    userId: `user_${role}`,
    userEmail: `${role}@talktablee.com`,
    autoRequest: true
  });

  const [showPushModal, setShowPushModal] = useState<boolean>(false);

  const pushStatus = pushPermission === "granted" ? "granted" : pushPermission === "denied" ? "denied" : "idle";

  const handleResetClick = () => {
    setShowResetAuthModal(true);
    setResetPasswordInput("");
    setResetErrorMsg("");
    setIsResetAuthorized(false);
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErrorMsg("");
    setIsResetting(true);

    try {
      const response = await fetch("/api/verify-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPasswordInput })
      });

      const data = await response.json();
      setIsResetting(false);

      if (response.ok && data.success) {
        setIsResetAuthorized(true);
        setResetErrorMsg("");
      } else {
        setResetErrorMsg(data.error || "Incorrect password.");
      }
    } catch (err: any) {
      setIsResetting(false);
      setResetErrorMsg("Failed to connect to the server for authorization.");
      console.error("Password verification error:", err);
    }
  };

  const handleConfirmReset = async () => {
    setIsResetting(true);
    setResetErrorMsg("");

    try {
      const response = await fetch("/api/reset-lifetime-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          password: resetPasswordInput,
          adminName: editingSettings.name ? `${editingSettings.name} Owner` : "Restaurant Owner"
        })
      });

      const data = await response.json();
      setIsResetting(false);

      if (response.ok && data.success) {
        triggerSystemAlert(`Lifetime total has been successfully reset! Previous total: ${data.previousLifetimeTotal.toFixed(2)} JD.`, "success");
        setShowResetAuthModal(false);
      } else {
        setResetErrorMsg(data.error || "Failed to reset fees on the server.");
      }
    } catch (err: any) {
      setIsResetting(false);
      setResetErrorMsg("Failed to connect to the server to perform reset.");
      console.error("Reset confirmation error:", err);
    }
  };

  const handleForceCloseTable = async (tableId: string) => {
    try {
      const lock = occupiedTables[tableId];
      const userId = lock?.userId || "unknown";
      const sessionId = lock?.userId || "unknown";
      
      const tableOrders = orders.filter(o => o.tableNumber === tableId && (userId === "unknown" || o.userId === userId));
      const activeOrders = tableOrders.filter(o => o.status !== "delivered" && o.status !== "cancelled" && o.status !== "finished");

      // 1. End table session & free lock in Firestore
      await deleteDoc(doc(db, "tables", tableId));
      await SessionService.finishSession(tableId);

      // 2. Write immutable audit record
      const auditId = `audit_${Date.now()}`;
      const staffRole = safeSessionStorage.getItem("staff_role") || "staff";
      const adminId = staffRole === "owner" ? "Owner Admin" : "Staff Member";
      
      try {
        await setDoc(doc(db, "auditLogs", auditId), {
          action: "FORCE_CLOSE_TABLE",
          timestamp: Timestamp.now(),
          authorizedAdmin: adminId,
          restaurantId: RESTAURANT_ID,
          tableNumber: tableId,
          sessionId: sessionId,
          activeOrdersCount: activeOrders.length,
          details: `Administrator force closed Table ${tableId} active session. Disconnected occupant ${userId.substring(0, 8)}. Preserved ${activeOrders.length} active orders.`
        });
      } catch (auditErr) {
        console.warn("Could not write audit log (non-critical):", auditErr);
      }

      triggerSystemAlert(`تم إنهاء جلسة الطاولة ${tableId} بنجاح وإتاحتها للزبائن الآخرين.`, "success");
      setConfirmForceCloseTable(null);
    } catch (err: any) {
      console.error("Failed to force close table:", err);
      triggerSystemAlert("فشل إكمال إجراء إنهاء الجلسة: " + (err?.message || String(err)), "error");
      setConfirmForceCloseTable(null);
    }
  };

  // Beautiful non-blocking custom alert system (replacing window.alert / window.confirm)
  const [systemAlert, setSystemAlert] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const triggerSystemAlert = (message: string, type: "success" | "error" | "info" = "info") => {
    setSystemAlert({ message, type });
  };
  useEffect(() => {
    if (systemAlert) {
      const timer = setTimeout(() => {
        setSystemAlert(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [systemAlert]);

  // States for custom End Shift modal
  const [showEndShiftModal, setShowEndShiftModal] = useState<boolean>(false);
  const [isEndingShift, setIsEndingShift] = useState<boolean>(false);

  // States for custom Delete Order modal
  const [deleteOrderTargetId, setDeleteOrderTargetId] = useState<string | null>(null);

  // States for inline order notes editing
  const [editingNoteOrderId, setEditingNoteOrderId] = useState<string | null>(null);
  const [editingNoteInput, setEditingNoteInput] = useState<string>("");

  const handleSaveOrderNotes = async (orderId: string) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, {
        notes: editingNoteInput,
        updatedAt: Timestamp.now()
      });
      triggerSystemAlert("Order notes saved and updated in real time!", "success");
      setEditingNoteOrderId(null);
    } catch (err) {
      console.error("Failed to update order notes:", err);
      triggerSystemAlert("Failed to update order notes.", "error");
    }
  };

  // Real-time audio-visual alerts state
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; type: "order" | "request" }>>([]);
  const mountTimeRef = React.useRef<number>(Date.now());

  // Continuous Alert Sound & Audio Controls State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return safeLocalStorage.getItem("staff_sound_enabled") !== "false";
  });
  const [audioVolume, setAudioVolume] = useState<number>(() => {
    const savedVol = safeLocalStorage.getItem("staff_audio_volume");
    return savedVol ? parseFloat(savedVol) : 0.8;
  });
  const [isAudioUnlocked, setIsAudioUnlocked] = useState<boolean>(false);
  const audioCtxRef = React.useRef<AudioContext | null>(null);

  // Helper to determine if an order is an unacknowledged new order
  const isUnacknowledgedOrder = (o: Order): boolean => {
    if (!o) return false;
    const isNewStatus = o.status === "new" || o.status === "New" || o.status === "pending" || o.orderStatus === "new" || o.orderStatus === "New";
    const notTerminal = o.status !== "finished" && o.status !== "cancelled" && o.status !== "delivered";
    return isNewStatus && notTerminal && !o.acknowledged;
  };

  const unacknowledgedOrders = React.useMemo(() => {
    return orders.filter(isUnacknowledgedOrder);
  }, [orders]);

  const playContinuousAlertChime = (vol = audioVolume) => {
    if (vol <= 0 || !soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().then(() => setIsAudioUnlocked(true)).catch(() => setIsAudioUnlocked(false));
      } else {
        setIsAudioUnlocked(true);
      }

      const now = ctx.currentTime;
      // High-visibility dual pitch alert sound: 880Hz (A5) then 1174.66Hz (D6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(vol * 0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.22);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1174.66, now + 0.12);
      gain2.gain.setValueAtTime(vol * 0.35, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.42);
    } catch (e) {
      console.warn("Continuous alert chime error:", e);
    }
  };

  // Continuous repeating interval sound as long as unacknowledged orders exist
  useEffect(() => {
    if (unacknowledgedOrders.length === 0 || !soundEnabled || audioVolume <= 0) {
      return;
    }

    playContinuousAlertChime(audioVolume);
    const intervalId = setInterval(() => {
      playContinuousAlertChime(audioVolume);
    }, 1400);

    return () => {
      clearInterval(intervalId);
    };
  }, [unacknowledgedOrders.length, soundEnabled, audioVolume]);

  const enableSoundNotifications = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        if (audioCtxRef.current.state === "suspended") {
          audioCtxRef.current.resume();
        }
      }
      setIsAudioUnlocked(true);
      setSoundEnabled(true);
      safeLocalStorage.setItem("staff_sound_enabled", "true");
      playContinuousAlertChime(audioVolume);
    } catch (e) {
      console.error("Failed to enable audio:", e);
    }
  };

  const acknowledgeOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, {
        acknowledged: true,
        acknowledgedAt: Timestamp.now(),
        acknowledgedBy: role || "staff",
        status: "preparing",
        orderStatus: "preparing",
        updatedAt: Timestamp.now()
      });
      setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, acknowledged: true, status: "preparing", orderStatus: "preparing" } : o));
      triggerSystemAlert(
        isArabic ? `تم إقرار استلام الطلب #${orderId.slice(0, 8)} وتحويله للتجهيز.` : `Order #${orderId.slice(0, 8)} acknowledged! Status updated to Preparing.`,
        "success"
      );
    } catch (err) {
      console.error("Failed to acknowledge order:", err);
      triggerSystemAlert("Failed to acknowledge order: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  };

  const acknowledgeAllOrders = async () => {
    if (unacknowledgedOrders.length === 0) return;
    try {
      const promises = unacknowledgedOrders.map(o =>
        updateDoc(doc(db, "orders", o.orderId), {
          acknowledged: true,
          acknowledgedAt: Timestamp.now(),
          acknowledgedBy: role || "staff",
          status: "preparing",
          orderStatus: "preparing",
          updatedAt: Timestamp.now()
        })
      );
      await Promise.all(promises);
      setOrders(prev => prev.map(o => isUnacknowledgedOrder(o) ? { ...o, acknowledged: true, status: "preparing", orderStatus: "preparing" } : o));
      triggerSystemAlert(
        isArabic ? `تم إقرار جميع الطلبات الجديدة (${unacknowledgedOrders.length}) بنجاح.` : `All ${unacknowledgedOrders.length} new orders acknowledged successfully!`,
        "success"
      );
    } catch (err) {
      console.error("Failed to acknowledge all orders:", err);
      triggerSystemAlert("Failed to acknowledge orders: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  };

  const playAlertSound = (frequency = 520) => {
    playContinuousAlertChime(audioVolume);
  };

  // Subscribe to real-time collections once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Subscribe to orders with real-time detection (querying without orderBy to prevent missing index errors)
    const ordersQuery = collection(db, "orders");
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const list: Order[] = [];
      let detectedNewOrder = false;
      let newOrderTable = "";

      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.type === "added") {
          const createdTime = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : (data.createdAt ? new Date(data.createdAt).getTime() : Date.now());
          
          // If the order was created after the staff opened the dashboard
          if (createdTime > mountTimeRef.current - 1500) {
            detectedNewOrder = true;
            newOrderTable = data.tableNumber || "Unknown";
          }
        }
      });

      snapshot.forEach((docSnap) => {
        list.push({ orderId: docSnap.id, ...docSnap.data() } as Order);
      });

      // Sort in memory by newest first
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });

      setOrders(list);

      if (detectedNewOrder) {
        playAlertSound(587.33); // D5 pitch chime
        const notifId = `order-${Date.now()}`;
        const newNotif = {
          id: notifId,
          message: `🛎️ Table ${newOrderTable} placed a new order!`,
          type: "order" as const
        };
        setNotifications((prev) => [newNotif, ...prev].slice(0, 4));
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== notifId));
        }, 6000);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "orders");
    });

    // 1b. Dedicated onSnapshot listener specifically for orders with status set to 'New' or 'new'
    const newOrdersOnlyQuery = query(
      collection(db, "orders"),
      where("status", "in", ["New", "new"])
    );
    const unsubscribeNewOrdersOnly = onSnapshot(newOrdersOnlyQuery, (snapshot) => {
      let newlyArrived = false;
      let tableNum = "";
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          const createdTime = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : (data.createdAt ? new Date(data.createdAt).getTime() : Date.now());
          if (createdTime > mountTimeRef.current - 2500) {
            newlyArrived = true;
            tableNum = data.tableNumber || "Unknown";
          }
        }
      });

      if (newlyArrived) {
        playAlertSound(659.25); // Higher pitch chime for instant awareness
        const notifId = `new-status-order-${Date.now()}`;
        setNotifications((prev) => [
          {
            id: notifId,
            message: `🛎️ NEW ORDER RECEIVED for Table ${tableNum}! Please acknowledge and mark as In Progress.`,
            type: "order" as const
          },
          ...prev
        ].slice(0, 4));
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== notifId));
        }, 7000);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "orders/new");
    });

    // 2. Subscribe to waiter requests with real-time detection
    const requestsQuery = collection(db, "waiterRequests");
    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      const list: WaiterRequest[] = [];
      let detectedNewRequest = false;
      let newRequestTable = "";
      let newRequestType = "";

      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.type === "added") {
          const createdTime = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : (data.createdAt ? new Date(data.createdAt).getTime() : Date.now());
          
          if (createdTime > mountTimeRef.current - 1500 && data.status === "pending") {
            detectedNewRequest = true;
            newRequestTable = data.tableNumber || "Unknown";
            newRequestType = data.type || "call_waiter";
          }
        }
      });

      snapshot.forEach((docSnap) => {
        list.push({ requestId: docSnap.id, ...docSnap.data() } as WaiterRequest);
      });

      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      });

      setWaiterRequests(list);

      if (detectedNewRequest) {
        playAlertSound(659.25); // E5 pitch chime (higher attention)
        const notifId = `req-${Date.now()}`;
        const requestNames: Record<string, string> = {
          call_waiter: "Staff Call",
          request_water: "Water Request",
          request_napkins: "Napkins Request",
          request_cutlery: "Cutlery Request",
          clean_table: "Table Cleaning",
          request_bill: "Bill Request"
        };
        const rName = requestNames[newRequestType] || "Table Call";
        const newNotif = {
          id: notifId,
          message: `🚨 Table ${newRequestTable} is requesting: ${rName}!`,
          type: "request" as const
        };
        setNotifications((prev) => [newNotif, ...prev].slice(0, 4));
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== notifId));
        }, 6000);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "waiterRequests");
    });

    const unsubscribeTables = onSnapshot(query(collection(db, "tables")), (snapshot) => {
      const locks: Record<string, any> = {};
      snapshot.forEach((doc) => {
        locks[doc.id] = { tableId: doc.id, ...doc.data() };
      });
      setOccupiedTables(locks);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "tables");
    });

    const unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersMap: Record<string, any> = {};
      snapshot.forEach((docSnap) => {
        usersMap[docSnap.id] = { userId: docSnap.id, ...docSnap.data() };
      });
      setUsers(usersMap);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "users");
    });

    return () => {
      unsubscribeOrders();
      unsubscribeNewOrdersOnly();
      unsubscribeRequests();
      unsubscribeTables();
      unsubscribeUsers();
    };
  }, [isAuthenticated]);

  // Real-time reviews for Owner
  useEffect(() => {
    if (!isAuthenticated || role !== "owner") return;

    const reviewsQuery = query(collection(db, "reviews"), orderBy("createdAt", "desc"));
    const unsubscribeReviews = onSnapshot(reviewsQuery, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ reviewId: docSnap.id, ...docSnap.data() });
      });
      setReviews(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "reviews");
    });

    return () => {
      unsubscribeReviews();
    };
  }, [isAuthenticated, role]);

  // Real-time settings subscription for all authenticated staff/owner
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribeSettings = onSnapshot(doc(db, "settings", "restaurant"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.currentShiftTalkTableFee === undefined || data.totalTalkTableFees === undefined) {
          updateDoc(doc(db, "settings", "restaurant"), {
            currentShiftTalkTableFee: data.currentShiftTalkTableFee ?? 0.0,
            totalTalkTableFees: data.totalTalkTableFees ?? 0.0
          }).catch(err => handleFirestoreError(err, OperationType.UPDATE, "settings/restaurant"));
        }
        setEditingSettings(data);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/restaurant");
    });

    return () => {
      unsubscribeSettings();
    };
  }, [isAuthenticated]);

  // Real-time open shift subscription for all authenticated staff/owner
  useEffect(() => {
    if (!isAuthenticated) return;

    const q = query(
      collection(db, "shifts"),
      where("status", "==", "open")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        setActiveShift({
          shiftId: docSnap.id,
          ...docSnap.data()
        } as Shift);
      } else {
        setActiveShift(null);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "shifts");
    });

    return () => unsubscribe();
  }, [isAuthenticated]);

  // Live Clock Tick for shift duration tracking
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-start active shift if settings say "Open" but no active shift document is found
  useEffect(() => {
    if (!isAuthenticated || !editingSettings) return;
    
    if (editingSettings.status === "Open" && !activeShift) {
      const timer = setTimeout(async () => {
        if (editingSettings.status === "Open" && !activeShift) {
          try {
            const shiftId = `shift_${Date.now()}`;
            const newShift: Shift = {
              shiftId,
              restaurantId: RESTAURANT_ID,
              openedBy: role || "staff",
              startTime: Timestamp.now(),
              totalOrders: 0,
              completedOrders: 0,
              cancelledOrders: 0,
              cashOrders: 0,
              cardOrders: 0,
              totalSales: 0,
              totalTalkTableeeFees: 0,
              averageOrderValue: 0,
              status: "open"
            };
            await setDoc(doc(db, "shifts", shiftId), newShift);
            await setDoc(doc(db, "settings", "restaurant"), {
              activeShiftId: shiftId,
              updatedAt: Timestamp.now()
            }, { merge: true });
          } catch (err) {
            console.error("Error auto-starting active shift:", err);
          }
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, editingSettings?.status, activeShift]);

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (passcode === "test123") {
      setIsAuthenticated(true);
      setRole("staff");
      safeSessionStorage.setItem("staff_authenticated", "true");
      safeSessionStorage.setItem("staff_role", "staff");
      setErrorMsg(null);
    } else if (passcode === "owner123") {
      setIsAuthenticated(true);
      setRole("owner");
      safeSessionStorage.setItem("staff_authenticated", "true");
      safeSessionStorage.setItem("staff_role", "owner");
      setErrorMsg(null);
    } else {
      setErrorMsg("رمز المرور غير صحيح. يرجى المحاولة مرة أخرى.");
      setPasscode("");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setRole(null);
    safeSessionStorage.removeItem("staff_authenticated");
    safeSessionStorage.removeItem("staff_role");
    setPasscode("");
  };

  // --- SHIFT CALCULATOR HELPERS & MUTATIONS ---

  const getOrderTime = (order: Order) => {
    if (!order.createdAt) return 0;
    if ((order.createdAt as any).toDate) return (order.createdAt as any).toDate().getTime();
    return new Date(order.createdAt as any).getTime();
  };

  const getShiftStartTime = (shift: Shift) => {
    if (!shift.startTime) return 0;
    if ((shift.startTime as any).toDate) return (shift.startTime as any).toDate().getTime();
    return new Date(shift.startTime as any).getTime();
  };

  const getShiftDurationStr = () => {
    if (!activeShift) return "--:--:--";
    const startMs = getShiftStartTime(activeShift);
    const nowMs = currentTime.getTime();
    const diffMs = Math.max(0, nowMs - startMs);

    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);

    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOpenShift = async () => {
    try {
      // 1. Check if an active shift already exists in Firestore (prevent duplicate shifts)
      const existingQuery = query(
        collection(db, "shifts"),
        where("status", "in", ["open", "OPEN"])
      );
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        const existingId = existingDoc.id;
        setActiveShift({
          shiftId: existingId,
          ...existingDoc.data()
        } as Shift);

        // Sync settings doc
        await setDoc(doc(db, "settings", "restaurant"), {
          status: "Open",
          activeShiftId: existingId,
          updatedAt: Timestamp.now()
        }, { merge: true });

        triggerSystemAlert("Active shift restored successfully!", "success");
        return;
      }

      // 2. Create a new active shift document
      const shiftId = `shift_${Date.now()}`;
      const newShift: Shift = {
        shiftId,
        restaurantId: RESTAURANT_ID,
        openedBy: role || "staff",
        startTime: Timestamp.now(),
        totalOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        cashOrders: 0,
        cardOrders: 0,
        totalSales: 0,
        totalTalkTableeeFees: 0,
        averageOrderValue: 0,
        status: "open"
      };

      // Create shift document
      await setDoc(doc(db, "shifts", shiftId), newShift);

      // Update restaurant settings
      await setDoc(doc(db, "settings", "restaurant"), {
        status: "Open",
        activeShiftId: shiftId,
        updatedAt: Timestamp.now()
      }, { merge: true });

      triggerSystemAlert("Shift has been opened successfully!", "success");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "shifts");
      triggerSystemAlert("Failed to open shift. Please ensure Firestore rules permit writes.", "error");
    }
  };

  const handleEndShiftClick = () => {
    setShowEndShiftModal(true);
  };

  const executeEndShift = async () => {
    if (!activeShift) return;
    setIsEndingShift(true);
    try {
      const startT = getShiftStartTime(activeShift);
      const shiftOrders = orders.filter(o => getOrderTime(o) >= startT);
      const completedOrdersList = shiftOrders.filter(o => o.status === 'delivered');
      
      const totalOrdersVal = shiftOrders.length;
      const completedOrdersVal = completedOrdersList.length;
      const cancelledOrdersVal = shiftOrders.filter(o => o.status === 'cancelled').length;
      const cashOrdersVal = shiftOrders.filter(o => o.paymentMethod === 'cash').length;
      const cardOrdersVal = shiftOrders.filter(o => o.paymentMethod === 'card').length;
      const totalSalesVal = Number(completedOrdersList.reduce((sum, o) => sum + o.total, 0).toFixed(2));
      const avgOrderValueVal = completedOrdersVal > 0 ? Number((totalSalesVal / completedOrdersVal).toFixed(2)) : 0;

      // Fetch current setting to add shift fee to lifetime total securely and exactly once
      const settingsRef = doc(db, "settings", "restaurant");
      const settingsSnap = await getDoc(settingsRef);
      let currentLifetime = 0.0;
      let currentShiftFee = 0.0;
      if (settingsSnap.exists()) {
        const sData = settingsSnap.data();
        currentLifetime = Number(sData.totalTalkTableFees || 0);
        currentShiftFee = Number(sData.currentShiftTalkTableFee || 0);
      }

      const newLifetimeTotal = Number((currentLifetime + currentShiftFee).toFixed(2));

      // 1. Save final shift totals and set status to closed
      await updateDoc(doc(db, "shifts", activeShift.shiftId), {
        status: "closed",
        endTime: Timestamp.now(),
        closedBy: role || "staff",
        totalOrders: totalOrdersVal,
        completedOrders: completedOrdersVal,
        cancelledOrders: cancelledOrdersVal,
        cashOrders: cashOrdersVal,
        cardOrders: cardOrdersVal,
        totalSales: totalSalesVal,
        totalTalkTableeeFees: currentShiftFee,
        averageOrderValue: avgOrderValueVal,
        updatedAt: Timestamp.now(),
        // Shift History: Each completed shift should permanently store
        shiftStart: activeShift.startTime,
        shiftEnd: Timestamp.now(),
        ordersCompleted: completedOrdersVal,
        talkTableFeesCollected: currentShiftFee,
      });

      // 2. Set restaurant settings status to Closed and update accumulators
      await setDoc(doc(db, "settings", "restaurant"), {
        status: "Closed",
        activeShiftId: "",
        totalTalkTableFees: newLifetimeTotal,
        currentShiftTalkTableFee: 0.0, // Reset only the Current Shift TalkTableee Fee back to 0.00 JD for the next shift
        updatedAt: Timestamp.now()
      }, { merge: true });

      // 3. Close every active table by releasing occupied tables
      const tableIdsToRelease = Object.keys(occupiedTables);
      for (const tid of tableIdsToRelease) {
        await deleteDoc(doc(db, "tables", tid));
        await SessionService.finishSession(tid);
      }

      triggerSystemAlert("Shift has been ended successfully. The restaurant is now Closed.", "success");
      setShowEndShiftModal(false);
    } catch (err) {
      console.error("Error ending shift:", err);
      triggerSystemAlert("Failed to end shift: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsEndingShift(false);
    }
  };

  // Dynamic values based on orders of the active shift
  const shiftStartTime = activeShift ? getShiftStartTime(activeShift) : 0;
  const shiftOrders = activeShift ? orders.filter(o => getOrderTime(o) >= shiftStartTime) : [];
  
  const totalOrdersVal = shiftOrders.length;
  const completedOrdersList = shiftOrders.filter(o => o.status === 'delivered');
  const completedOrdersVal = completedOrdersList.length;
  const cancelledOrdersVal = shiftOrders.filter(o => o.status === 'cancelled').length;
  const pendingOrdersVal = shiftOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)).length;
  const cashOrdersVal = shiftOrders.filter(o => o.paymentMethod === 'cash').length;
  const cardOrdersVal = shiftOrders.filter(o => o.paymentMethod === 'card').length;
  const totalSalesVal = completedOrdersList.reduce((sum, o) => sum + o.total, 0);
  const totalTalkTableeeFeesVal = completedOrdersList.reduce((sum, o) => sum + (o.talkTableFee ?? 0.05), 0);
  const avgOrderValueVal = completedOrdersVal > 0 ? (totalSalesVal / completedOrdersVal) : 0;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("Saving...");
    try {
      await setDoc(doc(db, "settings", "restaurant"), {
        ...editingSettings,
        taxRate: Number(editingSettings.taxRate),
        serviceFee: Number(editingSettings.serviceFee),
        isServiceFeeEnabled: Boolean(editingSettings.isServiceFeeEnabled),
        updatedAt: Timestamp.now()
      });
      setSaveStatus("Onboarding settings successfully saved!");
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveStatus("Failed to save settings: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Status transitions
  const updateOrderStatus = async (orderId: string, newStatus: Order["status"]) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      const existingOrder = orders.find(o => o.orderId === orderId);
      const previousStatus = existingOrder ? existingOrder.status : "unknown";

      const updateData: any = {
        status: newStatus,
        orderStatus: newStatus,
        updatedAt: Timestamp.now()
      };

      if (newStatus === "finished") {
        updateData.finishedBy = role || "staff";
        updateData.finishedAt = Timestamp.now();
        updateData.paymentStatus = "paid";

        // Release table lock so table is immediately reset to AVAILABLE with 0.00 JD total for the next customer
        if (existingOrder && existingOrder.tableNumber) {
          const tableId = existingOrder.tableNumber;
          const remainingActiveOrders = orders.filter(
            o => o.tableNumber === tableId && o.orderId !== orderId && o.status !== "finished" && o.status !== "cancelled"
          );
          if (remainingActiveOrders.length === 0) {
            try {
              await deleteDoc(doc(db, "tables", tableId));
              await SessionService.finishSession(tableId);
            } catch (err) {
              console.warn("Could not release table lock or finish session on finish order:", err);
            }
          }
        }
      }

      await updateDoc(orderRef, updateData);

      if ((newStatus === "delivered" || newStatus === "finished") && previousStatus !== "delivered" && previousStatus !== "finished") {
        await setDoc(doc(db, "settings", "restaurant"), {
          currentShiftTalkTableFee: increment(0.05),
          updatedAt: Timestamp.now()
        }, { merge: true });
      }

      if (newStatus === "finished") {
        triggerSystemAlert(
          isArabic ? `تم إنهاء الطلب #${orderId.slice(0, 8)} وأرشفته بنجاح.` : `Order #${orderId.slice(0, 8)} marked as finished and archived.`,
          "success"
        );
      }
    } catch (err) {
      console.error("Failed to update order status:", err);
      triggerSystemAlert("Failed to update order status: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  };

  const updatePaymentStatus = async (orderId: string, currentStatus: Order["paymentStatus"]) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      const nextPaymentStatus = currentStatus === "paid" ? "unpaid" : "paid";
      await updateDoc(orderRef, {
        paymentStatus: nextPaymentStatus,
        updatedAt: Timestamp.now()
      });
    } catch (err) {
      console.error("Failed to update payment status:", err);
    }
  };

  // Complete waiter request
  const completeWaiterRequest = async (requestId: string) => {
    try {
      const reqRef = doc(db, "waiterRequests", requestId);
      await updateDoc(reqRef, {
        status: "completed"
      });
    } catch (err) {
      console.error("Failed to complete waiter request:", err);
    }
  };

  // Delete/Clear old records if needed (Clean staff utility)
  const deleteOrderRecord = (orderId: string) => {
    setDeleteOrderTargetId(orderId);
  };

  const executeDeleteOrder = async () => {
    if (!deleteOrderTargetId) return;
    try {
      await deleteDoc(doc(db, "orders", deleteOrderTargetId));
      triggerSystemAlert("Order record successfully removed from history.", "success");
    } catch (err) {
      console.error("Failed to delete order:", err);
      triggerSystemAlert("Failed to delete order: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setDeleteOrderTargetId(null);
    }
  };

  // Calculations for stats
  const pendingOrdersCount = orders.filter(o => o.status === "pending" || o.status === "new" || o.status === "New").length;
  const preparingOrdersCount = orders.filter(o => o.status === "preparing").length;
  const readyOrdersCount = orders.filter(o => o.status === "ready").length;
  const pendingRequestsCount = waiterRequests.filter(r => r.status === "pending").length;

  const totalRevenue = orders
    .filter(o => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "unacknowledged") return isUnacknowledgedOrder(order);
    if (statusFilter === "active") return ["pending", "new", "New", "preparing", "ready", "delivered"].includes(order.status);
    if (statusFilter === "pending") return order.status === "pending" || order.status === "new" || order.status === "New";
    if (statusFilter === "finished") return order.status === "finished";
    return order.status === statusFilter;
  });

  // Render password screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div dir={dir} className="relative min-h-screen bg-[#050505] flex flex-col justify-center items-center p-6 text-white overflow-hidden font-sans">
        {/* Premium background radial glows */}
        <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-[#C9A050]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] bg-[#5066C9]/5 rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm bg-white/[0.02] border border-white/10 rounded-[32px] p-8 backdrop-blur-2xl text-center shadow-2xl relative"
        >
          {/* Logo / Badge */}
          <div className="w-14 h-14 bg-[#C9A050]/10 border border-[#C9A050]/30 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#C9A050]/10">
            <Lock className="w-6 h-6 text-[#C9A050]" />
          </div>

          <h2 className="text-xl font-display font-bold tracking-tight text-white">
            تسجيل دخول الموظفين والمدراء
          </h2>
          <p className="text-xs text-[#888888] mt-2 leading-relaxed max-w-[280px] mx-auto">
            يرجى إدخال رمز الدخول المعتمد للوصول إلى لوحة تحكم المطبخ وإدارة الطاولات.
          </p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div className="relative">
              <input
                id="staff-passcode-input"
                type="password"
                placeholder="••••••"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-center font-mono text-lg tracking-[0.3em] text-white focus:outline-none focus:border-[#C9A050] transition-colors placeholder:text-white/20"
                autoFocus
              />
            </div>

            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-right font-medium">{errorMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              id="staff-login-submit"
              type="submit"
              className="w-full h-12 bg-[#C9A050] hover:bg-[#b08c43] text-[#050505] font-bold text-sm rounded-xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#C9A050]/15 mt-2"
            >
              <span>دخول اللوحة</span>
              <ArrowRight className="w-4 h-4 rotate-180" />
            </button>

            {onExit && (
              <button
                id="staff-login-exit"
                type="button"
                onClick={onExit}
                className="w-full h-11 bg-white/5 hover:bg-white/10 text-white/60 font-semibold text-xs rounded-xl transition-colors border border-white/5 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>العودة لخدمة الزبائن</span>
              </button>
            )}
          </form>
        </motion.div>
      </div>
    );
  }

  // Render Welcome Device Choice Screen after login if device choice is not confirmed
  if (isAuthenticated && !isDeviceChoiceConfirmed) {
    const detected = autoDetectDeviceType();
    return (
      <div dir={dir} className="relative min-h-screen bg-[#050505] flex flex-col justify-center items-center p-6 text-white font-sans overflow-y-auto">
        {/* Background glows */}
        <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-[#C9A050]/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-[-100px] left-[-100px] w-[500px] h-[500px] bg-[#5066C9]/10 rounded-full blur-[140px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-2xl bg-[#0a0a0c]/90 border border-white/10 rounded-[32px] p-8 sm:p-10 backdrop-blur-2xl shadow-2xl relative my-auto space-y-8"
        >
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-[#C9A050]/10 border border-[#C9A050]/30 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-[#C9A050]/10">
              <ChefHat className="w-8 h-8 text-[#C9A050]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-white">
              Welcome to Talk Table
            </h1>
            <p className="text-sm text-[#a0a0a0] leading-relaxed max-w-lg mx-auto">
              Choose the device you are using for the best experience.
            </p>
            <p className="text-xs text-[#888888]">
              اختر الجهاز الذي تستخدمه للحصول على أفضل تجربة وأعلى أداء.
            </p>
          </div>

          {/* Device Selection Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Laptop / Desktop Option */}
            <motion.button
              id="device-select-laptop"
              whileHover={{ scale: 1.02, translateY: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelectDeviceMode("desktop")}
              className={`p-6 rounded-2xl border text-right transition-all cursor-pointer relative group flex flex-col justify-between h-full ${
                deviceMode === "desktop"
                  ? "bg-[#C9A050]/10 border-[#C9A050] shadow-xl shadow-[#C9A050]/10"
                  : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10 hover:border-white/20"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#C9A050]/15 border border-[#C9A050]/30 flex items-center justify-center text-[#C9A050]">
                    <Laptop className="w-6 h-6" />
                  </div>
                  {detected === "desktop" && (
                    <span className="text-[10px] font-bold font-mono px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full">
                      الجهاز المكتشف تلقائياً 💻
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>💻 Laptop / Desktop</span>
                </h3>
                <p className="text-xs text-white/70 mt-2 leading-relaxed">
                  Optimized for larger screens with advanced dashboard controls.
                </p>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                  مصمم للشاشات الكبيرة مع أدوات تحكم ومؤشرات متقدمة.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-bold text-[#C9A050]">
                <span>اختر وضع الكمبيوتر</span>
                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
              </div>
            </motion.button>

            {/* Mobile Phone Option */}
            <motion.button
              id="device-select-mobile"
              whileHover={{ scale: 1.02, translateY: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelectDeviceMode("mobile")}
              className={`p-6 rounded-2xl border text-right transition-all cursor-pointer relative group flex flex-col justify-between h-full ${
                deviceMode === "mobile"
                  ? "bg-[#C9A050]/10 border-[#C9A050] shadow-xl shadow-[#C9A050]/10"
                  : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10 hover:border-white/20"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  {detected === "mobile" && (
                    <span className="text-[10px] font-bold font-mono px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full">
                      الجهاز المكتشف تلقائياً 📱
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>📱 Mobile Phone</span>
                </h3>
                <p className="text-xs text-white/70 mt-2 leading-relaxed">
                  Optimized for touch interaction and smaller screens.
                </p>
                <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                  مصمم للتفاعل باللمس والشاشات الصغيرة والاستخدام بيد واحدة.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-bold text-[#C9A050]">
                <span>اختر وضع الهاتف</span>
                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
              </div>
            </motion.button>
          </div>

          {/* Remember choice checkbox */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <label className="flex items-center gap-2.5 text-xs text-white/80 cursor-pointer select-none bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-xl border border-white/10 transition-colors">
              <input
                id="remember-device-choice-checkbox"
                type="checkbox"
                checked={rememberDeviceChoice}
                onChange={(e) => {
                  const val = e.target.checked;
                  setRememberDeviceChoice(val);
                  if (val) {
                    safeLocalStorage.setItem("talktable_remember_device_mode", "true");
                  } else {
                    safeLocalStorage.removeItem("talktable_remember_device_mode");
                  }
                }}
                className="w-4 h-4 rounded border-white/20 bg-black/40 text-[#C9A050] focus:ring-[#C9A050] focus:ring-offset-0 cursor-pointer"
              />
              <span className="font-medium">Remember my choice on this device | تذكر اختياري على هذا الجهاز</span>
            </label>
          </div>
        </motion.div>

        {/* Device Mismatch Confirmation Dialog */}
        {mismatchTargetMode && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="w-full max-w-md bg-[#0e0e12] border border-amber-500/30 rounded-2xl p-6 shadow-2xl space-y-4 text-center"
            >
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center mx-auto text-amber-400">
                <AlertCircle className="w-6 h-6" />
              </div>

              <h3 className="text-lg font-bold text-white">
                تأكيد التوافق | Device Layout Notice
              </h3>

              <p className="text-xs text-white/80 leading-relaxed">
                The selected layout is optimized for a different device. Continue anyway?
              </p>
              <p className="text-xs text-amber-400/90 leading-relaxed font-sans">
                التصميم المختار مخصص لجهاز مختلف ({mismatchTargetMode === 'desktop' ? 'كمبيوتر محمول/مكتبي' : 'هاتف محمول'}). هل ترغب في المتابعة على أي حال؟
              </p>

              <div className="flex items-center gap-3 pt-2">
                <button
                  id="cancel-device-mismatch-btn"
                  type="button"
                  onClick={() => setMismatchTargetMode(null)}
                  className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white/80 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء | Cancel
                </button>
                <button
                  id="confirm-device-mismatch-btn"
                  type="button"
                  onClick={() => handleSelectDeviceMode(mismatchTargetMode, true)}
                  className="flex-1 py-2.5 bg-[#C9A050] hover:bg-[#b08c43] text-black font-bold text-xs rounded-xl transition-colors cursor-pointer shadow-lg shadow-[#C9A050]/15"
                >
                  متابعة | Continue
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-[#050505] text-white pb-16 font-sans">
      {/* Luxury Ambient Top Header */}
      <div className="border-b border-white/5 bg-[#050505]/60 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#C9A050]/10 border border-[#C9A050]/30 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-[#C9A050]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">
                لوحة تحكم وإدارة المطعم - TalkTablee
              </h1>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded">
                بث مباشر
              </span>
            </div>
            <p className="text-[10px] text-[#888888] font-mono mt-0.5">
              مركز إدارة الخدمة والطلبات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* FCM Push Notification Permission & Status Button */}
          <button
            id="fcm-push-status-btn"
            onClick={async () => {
              setShowPushModal(true);
              await handlePushRequestPermission();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              pushStatus === "granted"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
            }`}
            title={pushStatus === "granted" ? "إشعارات FCM نشطة للمتصفح والخلفية" : "انقر لإدارة وتفعيل إشعارات FCM للخلفية"}
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="font-bold text-[10px]">
              {pushStatus === "granted" ? "إشعارات FCM مفعلة" : "تفعيل الإشعارات 🔔"}
            </span>
          </button>

          {/* Quick Device Mode Toggle Button */}
          <button
            id="toggle-device-mode-header-btn"
            onClick={() => handleSelectDeviceMode(deviceMode === "desktop" ? "mobile" : "desktop")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A050]/10 hover:bg-[#C9A050]/20 text-[#C9A050] rounded-lg border border-[#C9A050]/30 text-xs transition-all active:scale-[0.98] cursor-pointer font-bold"
            title="تبديل عرض الواجهة بين الكمبيوتر والهاتف المحمول"
          >
            {deviceMode === "desktop" ? (
              <>
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px]">📱 وضع الهاتف</span>
              </>
            ) : (
              <>
                <Laptop className="w-3.5 h-3.5 text-[#C9A050]" />
                <span className="text-[10px]">💻 وضع الكمبيوتر</span>
              </>
            )}
          </button>

          <button
            id="staff-header-download-btn"
            onClick={() => {
              safeSessionStorage.removeItem("pwa_install_banner_dismissed");
              safeSessionStorage.removeItem("pwa_ios_banner_dismissed");
              setForcePwaKey(prev => prev + 1);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A050]/15 hover:bg-[#C9A050]/25 text-[#C9A050] border border-[#C9A050]/30 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
            title={isArabic ? "تحميل تطبيق طاقم العمل" : "Download Staff App"}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="font-bold text-[10px]">{isArabic ? "تحميل التطبيق" : "Download App"}</span>
          </button>

          <LanguageToggle />

          {onExit && (
            <button
              id="staff-header-exit-btn"
              onClick={onExit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg border border-white/5 text-xs transition-colors cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 text-[#C9A050]" />
              <span className="font-bold text-[10px]">وضع الزبائن</span>
            </button>
          )}

          {/* Sound Alert Quick Control */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-xs font-mono">
            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                safeLocalStorage.setItem("staff_sound_enabled", String(next));
                if (next) enableSoundNotifications();
              }}
              className="hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer text-white/80"
              title="Toggle alert sound"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-rose-400" />}
              <span className="text-[10px] font-bold">{soundEnabled ? "Sound On" : "Muted"}</span>
            </button>
            <button
              onClick={() => playContinuousAlertChime(audioVolume)}
              className="text-[10px] bg-white/10 hover:bg-white/20 text-amber-300 font-bold px-2 py-0.5 rounded transition-all cursor-pointer"
              title="Test alert sound"
            >
              Test Sound
            </button>
          </div>

          <button
            id="staff-logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg border border-white/5 text-xs transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="font-bold text-[10px]">تسجيل الخروج</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-6 mt-8 space-y-6">
        
        {/* 🚨 PERSISTENT NEW ORDER ALERT BANNER */}
        <AnimatePresence>
          {unacknowledgedOrders.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              className="bg-gradient-to-r from-rose-950/95 via-amber-950/90 to-rose-950/95 border-2 border-rose-500 rounded-2xl p-6 shadow-2xl shadow-rose-900/60 relative overflow-hidden backdrop-blur-md"
              id="persistent-new-order-alert-banner"
            >
              {/* Pulsing background overlay */}
              <div className="absolute inset-0 bg-rose-500/10 animate-pulse pointer-events-none" />

              {/* Banner Header */}
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-rose-500/30 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center shrink-0 animate-bounce">
                    <BellRing className="w-6 h-6 text-rose-400 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="bg-rose-500 text-white font-extrabold text-[10px] font-mono px-2.5 py-0.5 rounded-full uppercase tracking-widest animate-pulse">
                        🚨 NEW ORDER ALERT
                      </span>
                      <span className="text-xs font-mono text-amber-300 font-bold">
                        {unacknowledgedOrders.length} {unacknowledgedOrders.length === 1 ? "Order Needs Acknowledgment" : "Orders Need Acknowledgment"}
                      </span>
                    </div>
                    <h2 className="text-lg font-display font-black text-white mt-0.5">
                      {isArabic ? "تنبيه طلب جديد - اضغط إقرار الاستلام لإيقاف التنبيه الصوتي" : "New Customer Order Received — Press Acknowledge to Silence Alarm"}
                    </h2>
                  </div>
                </div>

                {/* Audio Controls & Acknowledge All */}
                <div className="flex flex-wrap items-center gap-3">
                  {!isAudioUnlocked && (
                    <button
                      onClick={enableSoundNotifications}
                      className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/30 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 animate-pulse"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>Enable Alert Sound</span>
                    </button>
                  )}

                  <button
                    id="acknowledge-all-orders-btn"
                    onClick={acknowledgeAllOrders}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/30 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Acknowledge All ({unacknowledgedOrders.length})</span>
                  </button>
                </div>
              </div>

              {/* Unacknowledged Orders Cards */}
              <div className="relative z-10 pt-4 space-y-3">
                {unacknowledgedOrders.map((order) => {
                  const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                  const timeString = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div
                      key={order.orderId}
                      className="bg-black/70 border border-amber-500/40 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-amber-400 transition-all shadow-md"
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-[#C9A050] text-[#050505] text-xs font-black font-mono px-2.5 py-0.5 rounded-md">
                            TABLE {order.tableNumber}
                          </span>
                          <span className="text-xs text-amber-300 font-mono font-bold">
                            Order #{order.orderId.substring(0, 8).toUpperCase()}
                          </span>
                          <span className="text-[10px] text-white/60 font-mono flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3" /> {timeString}
                          </span>
                          {order.customerName && (
                            <span className="text-xs text-white/90 font-medium">
                              👤 {order.customerName}
                            </span>
                          )}
                          {order.orderSource && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                              {order.orderSource}
                            </span>
                          )}
                        </div>

                        {/* Items list */}
                        <div className="text-xs text-white/90 font-medium flex flex-wrap items-center gap-x-3 gap-y-1">
                          {order.items?.map((item, idx) => (
                            <span key={idx} className="bg-white/10 px-2.5 py-1 rounded border border-white/10 font-mono text-white">
                              <span className="text-[#C9A050] font-bold mr-1">{item.quantity}x</span>
                              {item.name}
                              {item.note && <span className="text-amber-300 text-[10px] ml-1">({item.note})</span>}
                            </span>
                          ))}
                        </div>

                        {/* Order Notes */}
                        {order.notes && (
                          <div className="text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg flex items-start gap-1.5">
                            <FileText className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
                            <span><strong>Kitchen Notes:</strong> "{order.notes}"</span>
                          </div>
                        )}
                      </div>

                      {/* Right side: Total and ACKNOWLEDGE ORDER Button */}
                      <div className="flex items-center justify-between lg:justify-end gap-4 border-t lg:border-t-0 border-white/10 pt-3 lg:pt-0 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] text-white/50 font-mono block">Total Amount</span>
                          <span className="text-base font-mono font-bold text-amber-300">{order.total.toFixed(2)} JD</span>
                        </div>

                        <button
                          id={`acknowledge-order-btn-${order.orderId}`}
                          onClick={() => acknowledgeOrder(order.orderId)}
                          className="bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs py-3 px-6 rounded-xl shadow-lg shadow-amber-500/30 transition-all active:scale-95 cursor-pointer flex items-center gap-2 animate-bounce"
                        >
                          <BellRing className="w-4 h-4" />
                          <span>ACKNOWLEDGE ORDER</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* At-a-glance Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-white/60 block">الطلبات النشطة</span>
              <span className="text-xl font-bold font-mono text-white mt-0.5 block">{pendingOrdersCount + preparingOrdersCount}</span>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-white/60 block">جاهز للتقديم</span>
              <span className="text-xl font-bold font-mono text-emerald-400 mt-0.5 block">{readyOrdersCount}</span>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-[#C9A050]/10 border border-[#C9A050]/20 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-[#C9A050]" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-white/60 block">طلبات الخدمة</span>
              <span className={`text-xl font-bold font-mono mt-0.5 block ${pendingRequestsCount > 0 ? 'text-rose-400 animate-pulse' : 'text-white/60'}`}>{pendingRequestsCount}</span>
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-white/60 block">الإيرادات اليومية</span>
              <span className="text-xl font-bold font-mono text-white mt-0.5 block">{totalRevenue.toFixed(2)} د.أ</span>
            </div>
          </div>
        </div>

        {/* TalkTableee Platform Fee Accounting System */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6" id="talktablee-accounting-panel">
          <div className="bg-[#0A120D] border border-emerald-500/15 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
            <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-emerald-400">رسوم الشفت الحالي</span>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-mono rounded font-bold uppercase tracking-wider">تحديث مباشر</span>
              </div>
              <h3 className="text-2xl font-mono font-black text-emerald-400 tracking-tight" id="current-shift-fees-display">
                {(editingSettings.currentShiftTalkTableFee || 0.00).toFixed(2)} د.أ
              </h3>
            </div>
            <p className="text-[11px] text-white/50 font-sans mt-2">المحصلة خلال هذا الشفت النشط (0.05 د.أ لكل طلب مكتمل).</p>
          </div>

          <div className="bg-[#0F110E] border border-amber-500/15 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
            <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-[#C9A050]">إجمالي رسوم TalkTablee</span>
                <button
                  id="reset-lifetime-fees-btn"
                  onClick={handleResetClick}
                  className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 font-bold text-[10px] rounded-lg transition-all active:scale-[0.98] cursor-pointer"
                >
                  إعادة ضبط إجمالي الرسوم
                </button>
              </div>
              <h3 className="text-2xl font-mono font-black text-[#C9A050] tracking-tight" id="lifetime-total-fees-display">
                {(editingSettings.totalTalkTableFees || 0.00).toFixed(2)} د.أ
              </h3>
            </div>
            <p className="text-[11px] text-white/50 font-sans mt-2">إجمالي الرسوم التراكمية المستحقة للمنصة.</p>
          </div>
        </div>

        {/* Today's Shift Calculator */}
        <div className="bg-[#0D0D0D]/90 border border-white/5 rounded-2xl p-6 relative overflow-hidden" id="shift-calculator-card">
          {/* Ambient subtle glow background */}
          <div className="absolute top-0 left-0 w-64 h-64 bg-[#C9A050]/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white/50">شفت وسجل اليوم</span>
                {activeShift ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full animate-pulse" id="shift-status-badge">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> شفت نشط
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold rounded-full" id="shift-status-badge">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> لا يوجد شفت نشط
                  </span>
                )}
              </div>
              <h2 className="text-xl font-display font-bold tracking-tight text-white flex items-center gap-2">
                <span>حاسبة وإحصائيات ورد اليوم</span>
                {activeShift && (
                  <span className="text-xs font-mono font-medium text-[#C9A050] bg-[#C9A050]/10 px-2 py-0.5 rounded border border-[#C9A050]/20">
                    ID: {activeShift.shiftId.split('_')[1] || activeShift.shiftId}
                  </span>
                )}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {activeShift ? (
                <div className="flex items-center gap-3">
                  <div className="bg-white/5 border border-white/5 px-4 py-2 rounded-xl text-center min-w-[100px]">
                    <span className="text-[10px] font-bold text-white/50 block">مدة العمل الحالية</span>
                    <span className="text-sm font-bold font-mono text-[#C9A050] block mt-0.5" id="shift-duration-val">
                      {getShiftDurationStr()}
                    </span>
                  </div>
                  <button
                    id="end-shift-btn"
                    onClick={handleEndShiftClick}
                    className="h-11 px-5 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 font-bold text-xs rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                  >
                    إنهاء الشفت
                  </button>
                </div>
              ) : (
                <button
                  id="open-shift-btn"
                  onClick={handleOpenShift}
                  className="h-11 px-6 bg-[#C9A050] text-[#050505] hover:bg-[#b08c43] font-bold text-xs rounded-xl transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[#C9A050]/15"
                >
                  <Sparkles className="w-4 h-4" /> فتح شفت جديد
                </button>
              )}
            </div>
          </div>

          {activeShift ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-6">
              <div className="bg-white/[0.01] border border-white/5 p-3.5 rounded-xl">
                <span className="text-[10px] font-bold text-white/50 block">بداية الشفت</span>
                <span className="text-xs font-semibold font-mono text-white mt-1 block">
                  {activeShift?.startTime?.toDate 
                    ? activeShift.startTime.toDate().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : new Date(activeShift.startTime).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <div className="bg-white/[0.01] border border-white/5 p-3.5 rounded-xl">
                <span className="text-[10px] font-bold text-white/50 block">الوقت الحالي</span>
                <span className="text-xs font-semibold font-mono text-white mt-1 block">
                  {currentTime.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <div className="bg-white/[0.01] border border-white/5 p-3.5 rounded-xl">
                <span className="text-[10px] font-bold text-white/50 block">الطلبات النشطة</span>
                <span className="text-xs font-semibold font-mono text-white mt-1 block">
                  {totalOrdersVal} <span className="text-[#888888] font-normal font-sans">({pendingOrdersVal} قيد التحضير)</span>
                </span>
              </div>
              <div className="bg-white/[0.01] border border-white/5 p-3.5 rounded-xl">
                <span className="text-[10px] font-bold text-white/50 block">حالات الطلبات</span>
                <span className="text-xs font-semibold font-mono text-white mt-1 block">
                  {completedOrdersVal} مكتمل <span className="text-[#888888] font-normal font-sans">/ {cancelledOrdersVal} ملغي</span>
                </span>
              </div>
              <div className="bg-white/[0.01] border border-white/5 p-3.5 rounded-xl">
                <span className="text-[10px] font-bold text-white/50 block">تقسيمات الدفع</span>
                <span className="text-xs font-semibold font-mono text-white mt-1 block">
                  {cashOrdersVal} نقداً <span className="text-[#888888] font-normal font-sans">/ {cardOrdersVal} بطاقة</span>
                </span>
              </div>
              <div className="bg-white/[0.01] border border-[#C9A050]/15 p-3.5 rounded-xl col-span-2 sm:col-span-1 bg-[#C9A050]/[0.01]">
                <span className="text-[10px] font-bold text-[#C9A050] block">إجمالي المبيعات</span>
                <span className="text-sm font-bold font-mono text-white mt-1 block">
                  {totalSalesVal.toFixed(2)} د.أ
                </span>
              </div>
              <div className="bg-white/[0.01] border border-emerald-500/15 p-3.5 rounded-xl col-span-2 sm:col-span-1 bg-emerald-500/[0.01]">
                <span className="text-[10px] font-bold text-emerald-400 block">رسوم TalkTablee</span>
                <span className="text-sm font-bold font-mono text-emerald-400 mt-1 block">
                  {totalTalkTableeeFeesVal.toFixed(2)} د.أ
                </span>
              </div>
              <div className="bg-white/[0.01] border border-white/5 p-3.5 rounded-xl col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-white/50 block">متوسط قيمة الطلب</span>
                <span className="text-sm font-bold font-mono text-white mt-1 block">
                  {avgOrderValueVal.toFixed(2)} د.أ
                </span>
              </div>
            </div>
          ) : (
            <div className="pt-6 text-center text-white/50 text-xs font-sans py-8 bg-white/[0.01] border border-dashed border-white/5 rounded-xl mt-4">
              🚪 الشفت مغلق حالياً. اضغط على "فتح شفت جديد" لمباشرة واستقبال الطلبات وإيرادات اليوم.
            </div>
          )}
        </div>

        {/* Console Nav & Sub-filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-b border-white/5 pb-4">
          <div className="flex bg-white/5 rounded-xl p-1 border border-white/5 self-start">
            <button
              id="staff-tab-orders"
              onClick={() => setActiveTab("orders")}
              className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                activeTab === "orders" 
                  ? "bg-[#C9A050] text-[#050505] shadow-md" 
                  : "text-white/60 hover:text-white"
              }`}
            >
              Customer Orders ({orders.length})
            </button>
            <button
              id="staff-tab-requests"
              onClick={() => setActiveTab("requests")}
              className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer relative ${
                activeTab === "requests" 
                  ? "bg-[#C9A050] text-[#050505] shadow-md" 
                  : "text-white/60 hover:text-white"
              }`}
            >
              Table Service Requests
              {pendingRequestsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold font-mono">
                  {pendingRequestsCount}
                </span>
              )}
            </button>
            <button
              id="staff-tab-tables"
              onClick={() => setActiveTab("tables")}
              className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer relative ${
                activeTab === "tables" 
                  ? "bg-[#C9A050] text-[#050505] shadow-md" 
                  : "text-white/60 hover:text-white"
              }`}
            >
              Session Management ({Object.keys(occupiedTables).filter(id => occupiedTables[id]?.isOccupied).length})
            </button>
            <button
              id="staff-tab-restaurant-management"
              onClick={() => setActiveTab("restaurant-management")}
              className={`px-4 py-2 rounded-lg font-cairo text-xs font-bold tracking-wider transition-colors cursor-pointer relative flex items-center gap-1.5 ${
                activeTab === "restaurant-management" 
                  ? "bg-amber-500 text-zinc-950 shadow-md font-extrabold" 
                  : "text-amber-400/90 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20"
              }`}
            >
              <span>إدارة القائمة والضريبة</span>
            </button>
            {role === "owner" && (
              <>
                <button
                  id="staff-tab-settings"
                  onClick={() => setActiveTab("settings")}
                  className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    activeTab === "settings" 
                      ? "bg-[#C9A050] text-[#050505] shadow-md" 
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Onboarding Settings
                </button>
                <button
                  id="staff-tab-reviews"
                  onClick={() => setActiveTab("reviews")}
                  className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    activeTab === "reviews" 
                      ? "bg-[#C9A050] text-[#050505] shadow-md" 
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Diner Reviews ({reviews.length})
                </button>
                <button
                  id="staff-tab-analytics"
                  onClick={() => setActiveTab("analytics")}
                  className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    activeTab === "analytics" 
                      ? "bg-[#C9A050] text-[#050505] shadow-md" 
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  Analytics & Setup
                </button>
              </>
            )}
          </div>

          {/* Context Filter for Orders */}
          {activeTab === "orders" && (
            <div className="flex flex-wrap gap-1.5 bg-white/[0.02] p-1 rounded-lg border border-white/5">
              {[
                { value: "all", label: "All Orders" },
                { value: "unacknowledged", label: `🚨 Unacknowledged (${unacknowledgedOrders.length})` },
                { value: "active", label: "Active" },
                { value: "pending", label: "Pending" },
                { value: "preparing", label: "Preparing" },
                { value: "ready", label: "Ready" },
                { value: "delivered", label: "Served" },
                { value: "finished", label: "Finished" },
                { value: "cancelled", label: "Cancelled" }
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    statusFilter === filter.value
                      ? "bg-white/10 text-white border border-white/10"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live List Display area */}
        <AnimatePresence mode="wait">
          {activeTab === "orders" ? (
            <motion.div
              key="orders-grid"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {filteredOrders.length === 0 ? (
                <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-12 text-center text-white/30">
                  <ChefHat className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-mono text-xs">No orders matching the current filter status.</p>
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const createdDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                  const timeString = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  // Status specific coloring
                  const statusColors: Record<string, string> = {
                    New: "bg-purple-500/20 text-purple-300 border-purple-500/30 font-bold animate-pulse",
                    new: "bg-purple-500/20 text-purple-300 border-purple-500/30 font-bold animate-pulse",
                    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                    preparing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                    ready: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                    delivered: "bg-teal-500/10 text-teal-300 border-teal-500/20",
                    finished: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold",
                    cancelled: "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  };

                  return (
                    <motion.div
                      id={`staff-order-card-${order.orderId}`}
                      key={order.orderId}
                      layout
                      className={`rounded-2xl p-5 transition-all flex flex-col md:flex-row md:items-start justify-between gap-6 ${
                        isUnacknowledgedOrder(order)
                          ? "bg-rose-950/20 border-2 border-rose-500 shadow-2xl shadow-rose-900/30"
                          : "bg-white/[0.02] border border-white/5 hover:border-white/10"
                      }`}
                    >
                      {/* Left: Metadata & Table */}
                      <div className="space-y-3 flex-1">
                        {isUnacknowledgedOrder(order) && (
                          <div className="w-full bg-rose-500/20 border border-rose-500/40 rounded-xl p-2.5 mb-3 flex items-center justify-between text-xs font-bold text-rose-300 font-mono animate-pulse">
                            <span className="flex items-center gap-1.5">
                              <BellRing className="w-4 h-4 text-rose-400 animate-pulse" />
                              🚨 NEW ORDER RECEIVED — ACKNOWLEDGE REQUIRED
                            </span>
                            <button
                              id={`card-top-acknowledge-btn-${order.orderId}`}
                              onClick={() => acknowledgeOrder(order.orderId)}
                              className="bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs py-1.5 px-3 rounded-lg shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                            >
                              <BellRing className="w-3.5 h-3.5" />
                              ACKNOWLEDGE
                            </button>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="bg-[#C9A050] text-[#050505] text-xs font-bold font-mono px-3 py-1 rounded-lg">
                            TABLE {order.tableNumber}
                          </span>
                          <span className="text-[10px] text-white/40 font-mono">
                            ID: #{order.orderId.substring(0, 8).toUpperCase()}
                          </span>
                          {order.orderSource === "AI Waiter" && (
                            <span className="text-[10px] font-mono font-bold bg-[#C9A050]/15 text-[#C9A050] border border-[#C9A050]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Ward AI Waiter
                            </span>
                          )}
                          <span className="text-[10px] text-white/40 font-mono bg-white/5 px-2 py-0.5 rounded flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {timeString}
                          </span>
                          <span className={`text-[9px] uppercase tracking-wider font-mono font-bold border px-2 py-0.5 rounded ${statusColors[order.status] || "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                            {order.status}
                          </span>
                        </div>

                        {/* Order Items Breakdown */}
                        <div className="space-y-2.5 pt-2">
                          {order.items?.map((item, idx) => (
                            <div key={idx} className="border-b border-white/[0.03] last:border-0 pb-2 last:pb-0">
                              <div className="flex items-start gap-2">
                                <span className="font-mono text-sm text-[#C9A050] font-bold">
                                  {item.quantity}x
                                </span>
                                <div className="flex-1">
                                  <span className="text-sm font-medium text-white/90">{item.name}</span>
                                  {item.customizations && item.customizations.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {item.customizations.map((cust, cIdx) => (
                                        <span key={cIdx} className="bg-white/5 border border-white/5 text-[9px] px-1.5 py-0.5 rounded text-white/40 font-mono">
                                          {cust.title}: {cust.selected.join(", ")}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {item.note && (
                                    <div className="mt-1.5 font-mono text-[10px] text-[#C9A050] bg-[#C9A050]/10 border border-[#C9A050]/20 px-2 py-1 rounded-lg inline-flex items-center gap-1">
                                      <FileText className="w-3 h-3 text-[#C9A050]" />
                                      <span>Item Note: "{item.note}"</span>
                                    </div>
                                  )}
                                </div>
                                <span className="text-xs font-mono text-white/50">${(item.price * item.quantity).toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Kitchen / Order Notes Callout & Interactive Staff Notes Editor */}
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-mono space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[#C9A050] font-bold">
                              <FileText className="w-4 h-4 text-[#C9A050]" />
                              <span>Kitchen & Staff Order Notes</span>
                            </div>
                            {editingNoteOrderId !== order.orderId && (
                              <button
                                id={`edit-note-btn-${order.orderId}`}
                                onClick={() => {
                                  setEditingNoteOrderId(order.orderId);
                                  setEditingNoteInput(order.notes || "");
                                }}
                                className="px-2.5 py-1 text-[10px] font-mono text-[#C9A050] hover:text-white bg-[#C9A050]/10 hover:bg-[#C9A050]/20 rounded-lg border border-[#C9A050]/25 transition-all cursor-pointer flex items-center gap-1"
                              >
                                {order.notes ? "Edit Note" : "+ Add Note"}
                              </button>
                            )}
                          </div>

                          {editingNoteOrderId === order.orderId ? (
                            <div className="flex flex-col gap-2 pt-1">
                              <textarea
                                value={editingNoteInput}
                                onChange={(e) => setEditingNoteInput(e.target.value)}
                                placeholder="Enter order notes or kitchen instructions (e.g., extra spicy, no onions, gluten free)..."
                                className="w-full bg-black/60 border border-[#C9A050]/40 rounded-lg p-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C9A050] font-sans resize-y min-h-[60px]"
                                autoFocus
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setEditingNoteOrderId(null)}
                                  className="px-3 py-1 text-[10px] text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all cursor-pointer font-sans"
                                >
                                  Cancel
                                </button>
                                <button
                                  id={`save-note-btn-${order.orderId}`}
                                  onClick={() => handleSaveOrderNotes(order.orderId)}
                                  className="px-3 py-1 text-[10px] font-bold text-[#050505] bg-[#C9A050] hover:bg-[#b08c43] rounded-lg transition-all cursor-pointer font-sans"
                                >
                                  Save Note
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-white/90 font-sans text-xs">
                              {order.notes ? (
                                <p className="bg-[#C9A050]/10 border border-[#C9A050]/20 p-2 rounded-lg text-white/90">
                                  <span className="text-[#C9A050] font-mono font-bold block text-[10px] mb-0.5">INSTRUCTIONS:</span>
                                  {order.notes}
                                </p>
                              ) : (
                                <p className="text-white/30 font-mono text-[11px] italic">No special instructions attached yet. Click '+ Add Note' to add one.</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Price & Payment footer */}
                        <div className="pt-3 border-t border-white/5 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-white/40 flex items-center gap-1">
                              Payment Method:
                              <span className="text-[#C9A050] font-semibold flex items-center gap-1 ml-1 font-mono">
                                {order.paymentMethod === "card" ? "💳 Card" : "💵 Cash"}
                              </span>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-white/30 font-mono bg-white/5 px-2 py-0.5 rounded">TalkTablee Fee: {(order.talkTableFee ?? 0.05).toFixed(2)} JD</span>
                              <span className="text-white/40">Total: <span className="font-mono font-bold text-white text-sm ml-1">{order.total.toFixed(2)} JD</span></span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs bg-white/[0.02] p-2 rounded-xl border border-white/5">
                            <span className="text-white/40 flex items-center gap-1.5">
                              Status:
                              {order.paymentStatus === "paid" ? (
                                <span className="text-emerald-400 font-bold font-mono flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Paid
                                </span>
                              ) : (
                                <span className="text-amber-400 font-bold font-mono flex items-center gap-1 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  Awaiting Payment
                                </span>
                              )}
                            </span>

                            <button
                              id={`toggle-payment-status-${order.orderId}`}
                              onClick={() => updatePaymentStatus(order.orderId, order.paymentStatus)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                order.paymentStatus === "paid"
                                  ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/15"
                                  : "bg-emerald-500 text-[#050505] hover:bg-emerald-400 shadow-md shadow-emerald-500/10"
                              }`}
                            >
                              {order.paymentStatus === "paid" ? "Mark Unpaid" : "Mark Paid"}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions Column */}
                      <div className="flex flex-col xs:flex-row md:flex-col gap-2 shrink-0 justify-end">
                        {isUnacknowledgedOrder(order) && (
                          <button
                            id={`action-acknowledge-${order.orderId}`}
                            onClick={() => acknowledgeOrder(order.orderId)}
                            className="bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs py-2.5 px-4 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-400/20 animate-bounce"
                          >
                            <BellRing className="w-4 h-4" />
                            <span>ACKNOWLEDGE</span>
                          </button>
                        )}
                        {["pending", "new", "New"].includes(order.status) && (
                          <button
                            id={`action-prep-${order.orderId}`}
                            onClick={() => updateOrderStatus(order.orderId, "preparing")}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2 px-4 rounded-xl transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <ChefHat className="w-3.5 h-3.5" />
                            <span>Prepare Order</span>
                          </button>
                        )}

                        {order.status === "preparing" && (
                          <button
                            id={`action-ready-${order.orderId}`}
                            onClick={() => updateOrderStatus(order.orderId, "ready")}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2 px-4 rounded-xl transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Ready</span>
                          </button>
                        )}

                        {order.status === "ready" && (
                          <button
                            id={`action-deliver-${order.orderId}`}
                            onClick={() => updateOrderStatus(order.orderId, "delivered")}
                            className="bg-[#C9A050] hover:bg-[#b08c43] text-[#050505] font-semibold text-xs py-2 px-4 rounded-xl transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Utensils className="w-3.5 h-3.5" />
                            <span>Serve to Table</span>
                          </button>
                        )}

                        {/* Finish Order: Marks the order complete, updates status to 'finished', records staff ID, and moves out of active view without deleting order history */}
                        {["pending", "new", "New", "preparing", "ready", "delivered"].includes(order.status) && (
                          <button
                            id={`action-finish-${order.orderId}`}
                            onClick={() => updateOrderStatus(order.orderId, "finished")}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Finish Order</span>
                          </button>
                        )}

                        {["pending", "new", "New", "preparing", "ready"].includes(order.status) && (
                          <button
                            id={`action-cancel-${order.orderId}`}
                            onClick={() => updateOrderStatus(order.orderId, "cancelled")}
                            className="bg-white/5 hover:bg-rose-500/10 text-white/50 hover:text-rose-400 font-semibold text-xs py-2 px-4 rounded-xl transition-colors border border-white/5 hover:border-rose-500/20 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Cancel Order</span>
                          </button>
                        )}

                        {/* Records deletion */}
                        {["delivered", "finished", "cancelled"].includes(order.status) && (
                          <button
                            id={`action-delrecord-${order.orderId}`}
                            onClick={() => deleteOrderRecord(order.orderId)}
                            className="bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-[10px] py-1.5 px-3 rounded-lg border border-white/5 cursor-pointer"
                          >
                            Remove Record
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          ) : activeTab === "requests" ? (
            <motion.div
              key="requests-feed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {waiterRequests.length === 0 ? (
                <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-12 text-center text-white/30">
                  <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-mono text-xs">لا توجد طلبات خدمة طاولات نشطة حالياً.</p>
                </div>
              ) : (
                waiterRequests.map((req) => {
                  const createdDate = req.createdAt?.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
                  const timeString = createdDate.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });

                  const requestTypes: Record<string, { label: string; icon: string }> = {
                    call_waiter: { label: "استدعاء الموظف", icon: "🛎️" },
                    request_water: { label: "طلب مياه نقية", icon: "💧" },
                    request_napkins: { label: "طلب مناديل", icon: "🧻" },
                    request_cutlery: { label: "طلب أدوات مائدة", icon: "🍴" },
                    clean_table: { label: "تنظيف الطاولة", icon: "✨" },
                    request_bill: { label: "طلب الفاتورة / الحساب", icon: "💵" }
                  };

                  const typeInfo = requestTypes[req.type] || { label: "استدعاء طاولة", icon: "🛎️" };
                  const isCompleted = req.status === "completed";

                  return (
                    <motion.div
                      id={`staff-req-card-${req.requestId}`}
                      key={req.requestId}
                      layout
                      className={`bg-white/[0.02] border rounded-2xl p-4 flex items-center justify-between gap-4 transition-all ${
                        isCompleted 
                          ? "border-white/5 opacity-55" 
                          : "border-[#C9A050]/20 bg-[#C9A050]/[0.01]"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-xl shrink-0">
                          {typeInfo.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="bg-[#C9A050] text-[#050505] text-[10px] font-bold font-mono px-2.5 py-0.5 rounded">
                              طاولة {req.tableNumber}
                            </span>
                            <span className="text-sm font-semibold text-white">
                              {typeInfo.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-white/40 font-mono mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> تم الطلب في الساعة {timeString}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isCompleted ? (
                          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-mono font-semibold px-3 py-1 bg-emerald-400/5 border border-emerald-400/10 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تمت الخدمة</span>
                          </div>
                        ) : (
                          <button
                            id={`action-comp-req-${req.requestId}`}
                            onClick={() => completeWaiterRequest(req.requestId)}
                            className="bg-[#C9A050] hover:bg-[#b08c43] text-[#050505] font-semibold text-xs py-2 px-4 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[#C9A050]/10"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تأكيد وإكمال الخدمة</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          ) : (
            <motion.div
              key="tables-grid"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Session Management View (Accessible to all Staff) */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[24px] p-6 space-y-6" id="active-sessions-management-panel">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-[#C9A050]/10 text-[#C9A050] rounded-lg text-xs">🛎️</span>
                      <h3 className="text-base font-semibold text-white tracking-tight">
                        إدارة جلسات الطاولات الحية
                      </h3>
                    </div>
                    <p className="text-xs text-[#888888] mt-0.5">
                      متابعة جلسات الزوار المباشرة عند الطاولات، مراجعة الطلبات والرصيد، وإنهاء الجلسات فوراً عند مغادرة الزبائن.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white/50 bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span>
                      {Object.keys(occupiedTables).filter(id => occupiedTables[id]?.isOccupied).length} جلسات نشطة
                    </span>
                  </div>
                </div>

                {(() => {
                  const activeTableRows = Object.keys(occupiedTables)
                    .sort((a, b) => {
                      const numA = parseInt(a, 10);
                      const numB = parseInt(b, 10);
                      if (isNaN(numA) || isNaN(numB)) {
                        return a.localeCompare(b);
                      }
                      return numA - numB;
                    })
                    .map((tableId) => {
                      const lock = occupiedTables[tableId];
                      const isOccupied = !!(lock && lock.isOccupied);
                      const isReserved = isOccupied && lock.userId?.startsWith("staff_");
                      
                      if (!isOccupied) return null;

                      // Status
                      const currentStatus = isReserved ? "محجوزة" : "مشغولة";
                      
                      // Session status
                      const sessionStatus = !isReserved ? "نشطة" : "مغلقة";
                      
                      // Filter orders
                      const tableOrders = orders.filter(o => o.tableNumber === tableId && o.userId === lock?.userId);
                      const activeOrder = tableOrders.find(o => o.status !== "delivered" && o.status !== "cancelled" && o.status !== "finished");
                      const orderStatusStr = activeOrder 
                        ? (activeOrder.status === "pending" ? "قيد الانتظار" : activeOrder.status === "preparing" ? "قيد التحضير" : activeOrder.status === "ready" ? "جاهز للتقديم" : "تم التسليم")
                        : (tableOrders.some(o => o.status === "delivered") ? "تم التسليم" : "لا توجد طلبات");
                      
                      // Bill total
                      const billTotal = tableOrders
                        .filter(o => o.status !== "cancelled" && o.status !== "finished")
                        .reduce((sum, o) => sum + o.total, 0);

                      // Customer Name
                      const customerName = isReserved 
                        ? "حجز بواسطة الموظفين" 
                        : (users[lock?.userId]?.name || `زائر (${lock?.userId?.substring(0, 6) || "—"})`);

                      // Payment method
                      const paymentMethod = tableOrders.length > 0
                        ? (tableOrders[tableOrders.length - 1].paymentMethod === "card" ? "💳 بطاقة إلكترونية" : "💵 نقداً")
                        : "—";

                      // Guests & Waiter
                      const guestsCount = (lock as any)?.guests || `${(parseInt(tableId) % 3) + 2} زوار`;
                      const assignedWaiter = (lock as any)?.assignedWaiter || `مباشر ${(parseInt(tableId) % 4) + 1}`;

                      // Dates
                      const updatedAtVal = lock?.updatedAt;
                      const startDate = updatedAtVal?.toDate ? updatedAtVal.toDate() : (updatedAtVal ? new Date(updatedAtVal) : null);
                      const startTimeStr = startDate ? startDate.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }) : "غير محدد";
                      
                      // Duration
                      let timeOccupiedStr = "غير محدد";
                      if (startDate) {
                        const diffMs = Date.now() - startDate.getTime();
                        const diffMins = Math.floor(diffMs / 60000);
                        timeOccupiedStr = diffMins < 60 
                          ? `${diffMins} دقيقة` 
                          : `${Math.floor(diffMins / 60)} ساعة و ${diffMins % 60} دقيقة`;
                      }

                      return {
                        tableId,
                        isReserved,
                        currentStatus,
                        sessionStatus,
                        customerName,
                        guestsCount,
                        orderStatusStr,
                        paymentMethod,
                        billTotal,
                        startTimeStr,
                        timeOccupiedStr,
                        assignedWaiter,
                      };
                    })
                    .filter((row): row is NonNullable<typeof row> => row !== null);

                  if (activeTableRows.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center p-12 text-center bg-white/[0.01] border border-white/5 rounded-[24px]">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                          <Users className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-semibold text-white">جميع الطاولات متاحة</h4>
                        <p className="text-xs text-[#888888] mt-1 max-w-sm leading-relaxed">
                          لا توجد جلسات عملاء نشطة أو حجوزات حالية. كافة الطاولات فارغة ومستعدة لاستقبال الزوار الجدد.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right font-sans text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-white/5 text-white/40 uppercase text-[10px] font-bold tracking-wider">
                            <th className="py-3.5 px-4 text-right">الطاولة</th>
                            <th className="py-3.5 px-4 text-right">العميل</th>
                            <th className="py-3.5 px-4 text-right">مدة الجلسة</th>
                            <th className="py-3.5 px-4 text-right">الطلبات النشطة</th>
                            <th className="py-3.5 px-4 text-right">إجمالي الفاتورة</th>
                            <th className="py-3.5 px-4 text-right">طريقة الدفع</th>
                            <th className="py-3.5 px-4 text-left">الإجراء</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {activeTableRows.map((row) => (
                            <tr key={row.tableId} className="hover:bg-white/[0.01] transition-colors bg-red-500/[0.01]" id={`active-session-row-${row.tableId}`}>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                  <span className="font-bold text-white text-sm">طاولة {row.tableId}</span>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="space-y-0.5">
                                  <div className="text-white/90 font-sans font-medium">{row.customerName}</div>
                                  <div className="text-white/40 text-[10px]">{row.guestsCount}</div>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="space-y-0.5">
                                  <div className="text-white/80 font-mono">{row.timeOccupiedStr}</div>
                                  <div className="text-white/40 text-[10px]">منذ {row.startTimeStr}</div>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider ${
                                  row.orderStatusStr === "قيد الانتظار" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                  row.orderStatusStr === "قيد التحضير" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse" :
                                  row.orderStatusStr === "جاهز للتقديم" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                  row.orderStatusStr === "تم التسليم" ? "bg-white/5 text-white/50 border border-white/5" : 
                                  "bg-white/5 text-white/20 border border-white/5"
                                }`}>
                                  {row.orderStatusStr}
                                </span>
                              </td>
                              <td className="py-4 px-4 font-bold text-[#C9A050] text-sm font-mono">
                                {row.billTotal > 0 ? `${row.billTotal.toFixed(2)} د.أ` : "—"}
                              </td>
                              <td className="py-4 px-4 text-white/60 font-sans text-[11px]">
                                {row.paymentMethod}
                              </td>
                              <td className="py-4 px-4 text-left">
                                {row.isReserved ? (
                                  <button
                                    id={`staff-release-active-res-${row.tableId}`}
                                    onClick={async () => {
                                      try {
                                        await deleteDoc(doc(db, "tables", row.tableId));
                                      } catch (err) {
                                        console.error("Failed to release staff res:", err);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 font-bold text-xs rounded-lg transition-all active:scale-[0.98] cursor-pointer"
                                  >
                                    إلغاء الحجز
                                  </button>
                                ) : (
                                  <button
                                    id={`force-close-table-btn-${row.tableId}`}
                                    onClick={() => setConfirmForceCloseTable(row.tableId)}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5 border border-red-500/30 shadow-md shadow-red-900/10"
                                  >
                                    <span>إنهاء الجلسة</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-[24px] p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-white tracking-tight">
                      لوحة إقفال وحجز الطاولات
                    </h3>
                    <p className="text-xs text-[#888888] mt-0.5">
                      مراجعة الحالة، فك القفل الإجباري، أو إتمام الحجز اليدوي للطاولات في الوقت الفعلي.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-white/40">الدليل:</span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/5 px-2.5 py-0.5 border border-emerald-500/10 rounded-lg">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>متاحة</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/5 px-2.5 py-0.5 border border-red-500/10 rounded-lg">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <span>مشغولة / مقفلة</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "15", "16"].map((tableId) => {
                    const lock = occupiedTables[tableId];
                    const isOccupied = lock && lock.isOccupied;
                    const displayUser = isOccupied ? (lock.userId.startsWith("staff_") ? "حجز بواسطة الموظفين" : `زائر (${lock.userId.substring(0, 10)})`) : "";

                    return (
                      <div
                        id={`staff-table-item-${tableId}`}
                        key={tableId}
                        className={`border rounded-2xl p-4 flex flex-col justify-between h-36 transition-all ${
                          isOccupied
                            ? "bg-red-500/[0.02] border-red-500/20 shadow-lg shadow-red-500/[0.02]"
                            : "bg-white/[0.01] border-white/5"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] font-bold text-[#C9A050] block">الطاولة</span>
                            <span className="text-2xl font-bold font-mono text-white tracking-tight leading-none">ط {tableId}</span>
                          </div>
                          <span className={`w-2 h-2 rounded-full ${isOccupied ? "bg-red-500" : "bg-emerald-500 animate-pulse"}`} />
                        </div>

                        <div className="mt-2 text-xs text-[#888888] truncate">
                          {isOccupied ? (
                            <>
                              <div className="text-red-400 font-bold text-[10px] mb-0.5">مشغولة</div>
                              <div className="truncate text-white/70 text-[11px]">{displayUser}</div>
                            </>
                          ) : (
                            <>
                              <div className="text-emerald-400 font-bold text-[10px] mb-0.5">شاغرة</div>
                              <div className="text-white/30 text-[11px]">جاهزة للزبائن</div>
                            </>
                          )}
                        </div>

                        <div className="mt-3 pt-3 border-t border-white/5">
                          {isOccupied ? (
                            lock?.userId === "staff_reservation" ? (
                              <button
                                id={`staff-release-table-${tableId}`}
                                onClick={async () => {
                                  try {
                                    await deleteDoc(doc(db, "tables", tableId));
                                  } catch (err) {
                                    console.error("Failed to release lock:", err);
                                  }
                                }}
                                className="w-full text-xs font-bold py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 rounded transition-all cursor-pointer"
                              >
                                إلغاء الحجز
                              </button>
                            ) : (
                              <button
                                id={`staff-release-table-${tableId}`}
                                onClick={() => setConfirmForceCloseTable(tableId)}
                                className="w-full text-[11px] font-bold py-1 bg-red-600 hover:bg-red-700 text-white border border-red-500/30 rounded transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-red-900/10"
                              >
                                <span>⚠️ إنهاء الجلسة</span>
                              </button>
                            )
                          ) : (
                            <button
                              id={`staff-lock-table-${tableId}`}
                              onClick={async () => {
                                try {
                                  await setDoc(doc(db, "tables", tableId), {
                                    tableId,
                                    isOccupied: true,
                                    userId: "staff_reservation",
                                    updatedAt: Timestamp.now()
                                  });
                                } catch (err) {
                                  console.error("Failed to lock table manually:", err);
                                }
                              }}
                              className="w-full text-xs font-bold py-1 bg-[#C9A050]/10 hover:bg-[#C9A050]/20 text-[#C9A050] border border-[#C9A050]/20 rounded transition-all cursor-pointer"
                            >
                              حجز الطاولة
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "settings" && role === "owner" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="bg-white/[0.02] border border-white/5 rounded-[32px] p-6 sm:p-8 backdrop-blur-2xl"
            >
              <div className="flex justify-between items-center border-b border-white/5 pb-5 mb-6">
                <div>
                  <h3 className="text-lg font-display font-semibold text-white">إعدادات المطعم وهويته</h3>
                  <p className="text-xs text-[#888888] mt-0.5">تخصيص الهوية التجارية للمطعم، رسوم الخدمة الديناميكية، والمعلومات المحلية.</p>
                </div>
              </div>

              {/* Display Mode Configuration Panel */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>📱 Display Mode | وضع عرض لوحة التحكم</span>
                    </h4>
                    <p className="text-xs text-white/60 mt-0.5">
                      اختر نمط العرض المحسن لجهازك الحالي (كمبيوتر محمول/مكتبي أو هاتف محمول).
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#C9A050] bg-[#C9A050]/10 px-3 py-1 rounded-full border border-[#C9A050]/20 self-start sm:self-auto">
                    الوضع الحالي: {deviceMode === "desktop" ? "💻 كمبيوتر محمول/مكتبي" : "📱 هاتف محمول"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <button
                    id="settings-select-laptop-btn"
                    type="button"
                    onClick={() => handleSelectDeviceMode("desktop")}
                    className={`p-4 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between ${
                      deviceMode === "desktop"
                        ? "bg-[#C9A050]/15 border-[#C9A050] text-white"
                        : "bg-white/5 hover:bg-white/10 border-white/10 text-white/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#C9A050]/20 flex items-center justify-center text-[#C9A050]">
                        <Laptop className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">💻 Laptop / Desktop</div>
                        <div className="text-[10px] text-white/50">أدوات تحكم ومؤشرات متقدمة للشاشات الكبيرة</div>
                      </div>
                    </div>
                    {deviceMode === "desktop" && <Check className="w-5 h-5 text-[#C9A050]" />}
                  </button>

                  <button
                    id="settings-select-mobile-btn"
                    type="button"
                    onClick={() => handleSelectDeviceMode("mobile")}
                    className={`p-4 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between ${
                      deviceMode === "mobile"
                        ? "bg-[#C9A050]/15 border-[#C9A050] text-white"
                        : "bg-white/5 hover:bg-white/10 border-white/10 text-white/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">📱 Mobile Phone</div>
                        <div className="text-[10px] text-white/50">تصفح باللمس وشريط تنقل سفلي</div>
                      </div>
                    </div>
                    {deviceMode === "mobile" && <Check className="w-5 h-5 text-[#C9A050]" />}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/10">
                  <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer select-none">
                    <input
                      id="settings-remember-choice-checkbox"
                      type="checkbox"
                      checked={rememberDeviceChoice}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setRememberDeviceChoice(val);
                        if (val) {
                          safeLocalStorage.setItem("talktable_remember_device_mode", "true");
                        } else {
                          safeLocalStorage.removeItem("talktable_remember_device_mode");
                        }
                      }}
                      className="w-4 h-4 rounded border-white/20 bg-black/40 text-[#C9A050] focus:ring-[#C9A050]"
                    />
                    <span>تذكر اختياري على هذا الجهاز | Remember choice</span>
                  </label>

                  <button
                    id="settings-reset-device-choice-btn"
                    type="button"
                    onClick={() => {
                      setIsDeviceChoiceConfirmed(false);
                      safeLocalStorage.removeItem("talktable_remember_device_mode");
                    }}
                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    إعادة اختيار الجهاز عند الدخول القادم 🔄
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Brand Profile */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9A050]">ملف العلامة التجارية</h4>
                    
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/60 block">اسم المطعم</label>
                      <input
                        type="text"
                        value={editingSettings.name || ""}
                        onChange={(e) => setEditingSettings({ ...editingSettings, name: e.target.value })}
                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/60 block">الشعار والوصف المختصر</label>
                      <textarea
                        value={editingSettings.description || ""}
                        onChange={(e) => setEditingSettings({ ...editingSettings, description: e.target.value })}
                        className="w-full h-20 bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors resize-none"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/60 block">رابط الشعار (Logo URL)</label>
                      <input
                        type="text"
                        value={editingSettings.logo || ""}
                        onChange={(e) => setEditingSettings({ ...editingSettings, logo: e.target.value })}
                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/60 block">رابط صورة الغلاف (Cover Image URL)</label>
                      <input
                        type="text"
                        value={editingSettings.coverImage || ""}
                        onChange={(e) => setEditingSettings({ ...editingSettings, coverImage: e.target.value })}
                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors"
                        required
                      />
                    </div>
                  </div>

                  {/* Operational Settings */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9A050]">الإعدادات التشغيلية</h4>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-white/60 block">نوع المطبخ / المأكولات</label>
                        <input
                          type="text"
                          value={editingSettings.cuisineType || ""}
                          onChange={(e) => setEditingSettings({ ...editingSettings, cuisineType: e.target.value })}
                          className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-white/60 block">أوقات العمل</label>
                        <input
                          type="text"
                          value={editingSettings.businessHours || ""}
                          onChange={(e) => setEditingSettings({ ...editingSettings, businessHours: e.target.value })}
                          className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-white/60 block">رقم هاتف التواصل</label>
                        <input
                          type="text"
                          value={editingSettings.phone || ""}
                          onChange={(e) => setEditingSettings({ ...editingSettings, phone: e.target.value })}
                          className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-white/60 block">العملة المحلية</label>
                        <input
                          type="text"
                          value={editingSettings.currency || ""}
                          onChange={(e) => setEditingSettings({ ...editingSettings, currency: e.target.value })}
                          className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-white/60 block">العنوان الفعلي للمطعم</label>
                      <input
                        type="text"
                        value={editingSettings.address || ""}
                        onChange={(e) => setEditingSettings({ ...editingSettings, address: e.target.value })}
                        className="w-full h-11 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white focus:outline-none focus:border-[#C9A050] transition-colors"
                        required
                      />
                    </div>

                    {/* Pricing Config */}
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl space-y-3">
                      <h5 className="text-xs font-bold text-[#C9A050]/90">الضرائب ورسوم الخدمة</h5>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/80">تفعيل رسوم الخدمة الديناميكية</span>
                        <input
                          type="checkbox"
                          checked={editingSettings.isServiceFeeEnabled ?? true}
                          onChange={(e) => setEditingSettings({ ...editingSettings, isServiceFeeEnabled: e.target.checked })}
                          className="w-4 h-4 rounded border-white/10 text-[#C9A050] bg-white/5 accent-[#C9A050]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-white/50 block">نسبة الضريبة %</label>
                          <input
                            type="number"
                            step="0.1"
                            value={editingSettings.taxRate || 0}
                            onChange={(e) => setEditingSettings({ ...editingSettings, taxRate: Number(e.target.value) })}
                            className="w-full h-9 bg-white/5 border border-white/10 rounded-lg px-3 text-xs text-white focus:outline-none focus:border-[#C9A050]"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-white/50 block">قيمة رسوم الخدمة (د.أ)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editingSettings.serviceFee || 0}
                            onChange={(e) => setEditingSettings({ ...editingSettings, serviceFee: Number(e.target.value) })}
                            className="w-full h-9 bg-white/5 border border-white/10 rounded-lg px-3 text-xs text-white focus:outline-none focus:border-[#C9A050]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-5 flex items-center justify-between">
                  {saveStatus ? (
                    <div className="text-xs font-bold text-[#C9A050]">
                      {saveStatus}
                    </div>
                  ) : (
                    <div />
                  )}

                  <button
                    id="save-settings-btn"
                    type="submit"
                    className="h-11 px-6 bg-[#C9A050] hover:bg-[#b08c43] text-[#050505] font-bold text-xs rounded-xl transition-colors active:scale-[0.98] shadow-lg shadow-[#C9A050]/15 cursor-pointer"
                  >
                    حفظ ونشر الإعدادات
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {activeTab === "reviews" && role === "owner" && (
            <motion.div
              key="reviews"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Review Metrics Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    label: "جودة الطعام والوجبات",
                    avg: reviews.length ? (reviews.reduce((sum, r) => sum + (r.foodRating || 0), 0) / reviews.length).toFixed(1) : "—"
                  },
                  {
                    label: "كفاءة طاقم الخدمة",
                    avg: reviews.length ? (reviews.reduce((sum, r) => sum + (r.serviceRating || 0), 0) / reviews.length).toFixed(1) : "—"
                  },
                  {
                    label: "الأجواء والنظافة",
                    avg: reviews.length ? (reviews.reduce((sum, r) => sum + (r.atmosphereRating || 0), 0) / reviews.length).toFixed(1) : "—"
                  }
                ].map((metric, i) => (
                  <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 text-center">
                    <span className="text-xs font-bold text-white/50 block">{metric.label}</span>
                    <span className="text-3xl font-bold font-mono text-[#C9A050] mt-1.5 block">{metric.avg} / 5.0</span>
                  </div>
                ))}
              </div>

              {/* Reviews List */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-6 sm:p-8 backdrop-blur-2xl space-y-6">
                <div>
                  <h3 className="text-lg font-display font-semibold text-white">سجل تقييمات وآراء الزوار</h3>
                  <p className="text-xs text-[#888888] mt-0.5">ملاحظات وتقييمات حية من الزبائن أثناء تواجدهم عند الطاولات.</p>
                </div>

                <div className="space-y-4">
                  {reviews.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-white/5 rounded-2xl text-white/40 text-xs">
                      لم يتم تسجيل أي تقييمات من الزبائن في النظام حتى الآن.
                    </div>
                  ) : (
                    reviews.map((review) => {
                      const createdDate = review.createdAt && typeof review.createdAt.toDate === "function"
                        ? review.createdAt.toDate()
                        : review.createdAt 
                          ? new Date(review.createdAt) 
                          : new Date();

                      return (
                        <div key={review.reviewId} className="bg-white/5 border border-white/5 rounded-2xl p-5 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-bold text-white block">{review.userName || "زائر راقٍ"}</span>
                              <span className="text-[10px] text-white/40 block mt-0.5">{createdDate.toLocaleDateString('ar-JO')} الساعة {createdDate.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            
                            <div className="flex gap-4 text-xs font-bold">
                              <div>
                                <span className="text-white/40 ml-1.5">الطعام:</span>
                                <span className="text-[#C9A050]">{"★".repeat(review.foodRating || 0)}</span>
                              </div>
                              <div>
                                <span className="text-white/40 ml-1.5">الخدمة:</span>
                                <span className="text-[#C9A050]">{"★".repeat(review.serviceRating || 0)}</span>
                              </div>
                              <div>
                                <span className="text-white/40 ml-1.5">الأجواء:</span>
                                <span className="text-[#C9A050]">{"★".repeat(review.atmosphereRating || 0)}</span>
                              </div>
                            </div>
                          </div>

                          {review.comments && (
                            <p className="text-xs italic text-white/70 leading-relaxed pt-2 border-t border-white/5">
                              "{review.comments}"
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "analytics" && role === "owner" && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Popular Dishes & Tables stats */}
                <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-6 backdrop-blur-2xl space-y-6">
                  <div>
                    <h3 className="text-base font-display font-semibold text-white">الأطباق الأكثر طلباً</h3>
                    <p className="text-xs text-[#888888] mt-0.5">الوجبات الأكثر مبيعاً بناءً على طلبات العملاء الحية.</p>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const itemCounts: Record<string, number> = {};
                      orders.forEach(o => {
                        if (o.status !== "cancelled" && o.items) {
                          o.items.forEach(item => {
                            itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
                          });
                        }
                      });
                      const popularItems = Object.entries(itemCounts)
                        .map(([name, count]) => ({ name, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5);

                      if (popularItems.length === 0) {
                        return (
                          <div className="text-xs text-white/30 text-center py-6">
                            لا تتوفر بيانات مبيعات مسجلة بعد.
                          </div>
                        );
                      }

                      return popularItems.map((pi, index) => (
                        <div key={index} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                          <span className="text-xs font-semibold text-white">{pi.name}</span>
                          <span className="text-xs font-mono font-bold text-[#C9A050] bg-[#C9A050]/10 border border-[#C9A050]/20 px-2.5 py-0.5 rounded-lg">{pi.count} طلبات</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-6 backdrop-blur-2xl space-y-6">
                  <div>
                    <h3 className="text-base font-display font-semibold text-white">ترتيب إشغال الطاولات</h3>
                    <p className="text-xs text-[#888888] mt-0.5">الطاولات الأعلى توليداً لإجمالي الفواتير والزيارات.</p>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const tableCounts: Record<string, number> = {};
                      orders.forEach(o => {
                        if (o.status !== "cancelled" && o.tableNumber) {
                          tableCounts[o.tableNumber] = (tableCounts[o.tableNumber] || 0) + 1;
                        }
                      });
                      const popularTables = Object.entries(tableCounts)
                        .map(([tableId, count]) => ({ tableId, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5);

                      if (popularTables.length === 0) {
                        return (
                          <div className="text-xs text-white/30 text-center py-6">
                            لا تتوفر حركة طاولات مسجلة بعد.
                          </div>
                        );
                      }

                      return popularTables.map((pt, index) => (
                        <div key={index} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                          <span className="text-xs font-semibold text-white font-sans">طاولة {pt.tableId}</span>
                          <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-lg">{pt.count} عمليات دفع</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* QR Code Setup Simulator Card */}
              <div className="bg-white/[0.02] border border-white/5 rounded-[32px] p-6 sm:p-8 backdrop-blur-2xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-5 mb-6">
                  <div>
                    <h3 className="text-base font-display font-semibold text-white">مولد بطاقات رمز الاستجابة السريعة (QR Code) للطاولات</h3>
                    <p className="text-xs text-[#888888] mt-0.5">إنشاء وتنزيل رمز QR مخصص لكل طاولة لتيسير طلب العملاء المباشر.</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-white/50">اختر الطاولة:</span>
                    <select
                      value={selectedQRTable}
                      onChange={(e) => setSelectedQRTable(e.target.value)}
                      className="bg-white/10 border border-white/15 text-white text-xs font-bold rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#C9A050]"
                    >
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "15", "16"].map((tId) => (
                        <option key={tId} value={tId} className="bg-black text-white">طاولة {tId}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-around gap-8 p-6 bg-white/[0.01] border border-white/5 rounded-2xl">
                  {/* Virtual Printable Card Sign Mockup */}
                  <div className="w-[280px] bg-white text-black p-6 rounded-[24px] shadow-2xl border border-gray-200 text-center flex flex-col justify-between h-[380px]">
                    <div className="space-y-1">
                      <h4 className="text-[10px] uppercase font-bold text-gray-400">أهلاً بكم في</h4>
                      <h3 className="text-lg font-serif font-black text-[#C9A050] tracking-tight">{editingSettings.name || "TalkTablee"}</h3>
                      <div className="w-8 h-[1.5px] bg-[#C9A050] mx-auto mt-2" />
                    </div>

                    {/* Simulated High-Res QR Code Sign block */}
                    <div className="w-36 h-36 border-4 border-[#C9A050]/20 bg-white rounded-2xl mx-auto flex flex-col items-center justify-center relative p-3">
                      <div className="w-full h-full border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center bg-gray-50 p-2 space-y-1">
                        {/* High-Fi abstract geometric pattern representation of QR */}
                        <div className="grid grid-cols-6 gap-[1.5px] w-full h-full opacity-90">
                          {[...Array(36)].map((_, i) => (
                            <div
                              key={i}
                              className={`rounded-sm ${(i * 7) % 5 === 0 || (i + 3) % 4 === 0 || i < 6 || i % 6 === 0 || i > 30 ? "bg-black" : "bg-transparent"}`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border-2 border-[#C9A050]/30 w-7 h-7 rounded-lg flex items-center justify-center p-0.5">
                        <span className="text-sm font-black font-mono text-black">T</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-gray-400">امسح الرمز للطلب المباشر</div>
                      <div className="text-xs font-bold bg-black text-white px-3 py-1 rounded-full inline-block">طاولة {selectedQRTable}</div>
                    </div>
                  </div>

                  {/* Settings instructions */}
                  <div className="max-w-md space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">رابط ربط الطاولة المباشر</h4>
                      <p className="text-[11px] font-mono text-[#C9A050] bg-[#C9A050]/5 border border-[#C9A050]/15 p-3 rounded-xl select-all break-all">
                        {window.location.origin}/?table={selectedQRTable}
                      </p>
                    </div>

                    <ul className="text-xs text-white/60 space-y-2 leading-relaxed list-disc list-inside">
                      <li>توجيه تلقائي ومباشر لجلسة العميل عند مسح الرمز.</li>
                      <li>قفل حالة الطاولة تلقائياً في لوحة التحكم للحد من التعارض.</li>
                      <li>متوافق كلياً مع كافة الكاميرات الذكية دون الحاجة لتطبيق مستقلاً.</li>
                    </ul>

                    <button
                      onClick={() => {
                        window.print();
                      }}
                      className="h-11 px-6 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl transition-colors border border-white/10 flex items-center gap-2 cursor-pointer pt-0.5"
                    >
                      <span>طباعة بطاقة الطاولة</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "restaurant-management" && (
            <motion.div
              key="restaurant-management"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <RestaurantManagement
                userRole={role}
                settings={editingSettings}
                onUpdateSettings={(newS) => setEditingSettings(prev => ({ ...prev, ...newS }))}
                triggerAlert={triggerSystemAlert}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Live Staff Alerts Notifications Overlays */}
      <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-3 pointer-events-none w-full max-w-[360px]">
        <AnimatePresence>
          {notifications.map((notif) => {
            const isOrder = notif.type === "order";
            return (
              <motion.div
                id={`staff-alert-${notif.id}`}
                key={notif.id}
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="pointer-events-auto bg-[#0a0a0c]/95 border border-[#C9A050]/20 rounded-2xl p-4 shadow-2xl flex items-center gap-3 relative overflow-hidden backdrop-blur-xl"
              >
                <div className="absolute top-0 right-0 w-1 h-full bg-[#C9A050]" />
                
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  isOrder 
                    ? "bg-[#C9A050]/10 text-[#C9A050] border-[#C9A050]/20" 
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}>
                  {isOrder ? (
                    <ChefHat className="w-4.5 h-4.5" />
                  ) : (
                    <Bell className="w-4.5 h-4.5 animate-bounce" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white/50">
                    {isOrder ? "طلب جديد وارد" : "نداء خدمة / نادل"}
                  </div>
                  <p className="text-xs text-white font-medium mt-0.5 leading-relaxed">
                    {notif.message}
                  </p>
                </div>

                <button
                  onClick={() => setNotifications((prev) => prev.filter((n) => n.id !== notif.id))}
                  className="text-white/40 hover:text-white transition-colors cursor-pointer p-1 shrink-0"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Force Close Table Confirmation Dialog Modal */}
      <AnimatePresence>
        {confirmForceCloseTable !== null && (() => {
          const tableId = confirmForceCloseTable;
          const lock = occupiedTables[tableId];
          const userId = lock?.userId;
          const tableOrders = orders.filter(o => o.tableNumber === tableId && o.userId === userId);
          const activeOrders = tableOrders.filter(o => o.status !== "delivered" && o.status !== "cancelled" && o.status !== "finished");
          const hasActiveOrders = activeOrders.length > 0;

          return (
            <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" id="force-close-modal-overlay">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-[#0F0F11] border border-white/10 rounded-[28px] p-6 relative overflow-hidden shadow-2xl space-y-6"
                id="force-close-modal-container"
              >
                {/* Top red warning bar */}
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center justify-center text-xl">
                    ⚠️
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white tracking-tight" id="force-close-title">
                      إنهاء جلسة الزبون؟
                    </h3>
                    <p className="text-xs text-white/40">طاولة {tableId} • إجراء إداري حاسم</p>
                  </div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 text-white/70 p-4 rounded-xl space-y-3">
                  <p className="text-xs text-[#CCCCCC] font-semibold">
                    سيتم قطع اتصال جهاز الزبون بهذه الطاولة فوراً.
                  </p>
                  <p className="text-xs text-[#888888] leading-relaxed">
                    لن يتمكن العميل من تقديم طلبات جديدة أو استدعاء النادل من خلال هذه الجلسة.
                  </p>
                  <p className="text-[11px] text-[#888888]/80 leading-relaxed italic border-t border-white/5 pt-2">
                    ستظل الطلبات والسجلات السابقة محفوظة ومتاحة للربط مع المحاسبة وطاقم الخدمة.
                  </p>
                </div>

                {hasActiveOrders && (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3 rounded-xl text-xs leading-relaxed">
                    ⚠️ تنبيه: يوجد {activeOrders.length} طلب نشط قيد التجهيز في المطبخ حالياً. سيتم الاحتفاظ بها بآمان.
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmForceCloseTable(null)}
                    className="h-10 px-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-xs font-bold text-white/60 hover:text-white transition-colors cursor-pointer"
                    id="force-close-cancel-btn"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={() => handleForceCloseTable(tableId)}
                    className="h-10 px-5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-lg shadow-red-500/10"
                    id="force-close-confirm-btn"
                  >
                    <span>تأكيد إنهاء الجلسة</span>
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Secure Administrator Reset Authorization Modal Dialog */}
      <AnimatePresence>
        {showResetAuthModal && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" id="reset-auth-modal-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0F0F11] border border-white/10 rounded-[28px] p-6 relative overflow-hidden shadow-2xl"
              id="reset-auth-modal-container"
            >
              {/* Subtle top red alert bar */}
              <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">يتطلب إذن المسؤول الإداري</h3>
                  <p className="text-xs text-white/40">بروتوكول الأمان المالي مفعل</p>
                </div>
              </div>

              {!isResetAuthorized ? (
                <form onSubmit={handleVerifyPassword} className="space-y-4" id="reset-password-form">
                  <p className="text-xs text-white/70 leading-relaxed">
                    الوصول للعدادات التراكمية مقيد. يرجى إدخال كلمة السر الرئيسية للتحقق من مستوى الصلاحية.
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-white/50 block">أدخل كلمة المرور</label>
                    <input
                      type="password"
                      value={resetPasswordInput}
                      onChange={(e) => setResetPasswordInput(e.target.value)}
                      placeholder="••••••••••••••"
                      className="w-full h-11 bg-white/5 border border-white/10 focus:border-rose-500/40 rounded-xl px-4 font-mono text-white text-xs placeholder-white/20 focus:outline-none transition-colors"
                      required
                      id="reset-password-input"
                    />
                  </div>

                  {resetErrorMsg && (
                    <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl" id="reset-error-container">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="text-xs font-semibold" id="reset-error-msg">{resetErrorMsg}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowResetAuthModal(false)}
                      className="h-10 px-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-xs font-bold text-white/60 hover:text-white transition-colors cursor-pointer"
                      id="reset-cancel-auth-btn"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={isResetting}
                      className="h-10 px-5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      id="reset-submit-auth-btn"
                    >
                      {isResetting ? "جاري التحقق..." : "تأكيد الهوية"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4" id="reset-confirmation-step">
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" />
                    <div className="space-y-1">
                      <span className="text-xs font-black uppercase tracking-wider block">تحذير: إجراء حساس ونھائي</span>
                      <p className="text-xs leading-relaxed" id="reset-warning-text">
                        سيؤدي هذا الإجراء إلى إعادة تعيين إجمالي رسوم TalkTablee التراكمية نهائياً. لا يمكن التراجع عن هذا الإجراء.
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-white/70 leading-relaxed">
                    يتم تسجيل جميع محاولات إعادة التعيين بأمان في سجل المراجعة الإدارية. انقر على "تصفير" للمتابعة.
                  </p>

                  {resetErrorMsg && (
                    <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="text-xs font-semibold">{resetErrorMsg}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowResetAuthModal(false)}
                      className="h-10 px-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-xs font-bold text-white/60 hover:text-white transition-colors cursor-pointer"
                      id="reset-abort-btn"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmReset}
                      disabled={isResetting}
                      className="h-10 px-5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                      id="reset-confirm-btn"
                    >
                      {isResetting ? "جاري التصفير..." : "تصفير العداد"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Toast Alert */}
      <AnimatePresence>
        {systemAlert && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 p-4 rounded-xl border max-w-sm shadow-2xl backdrop-blur-md ${
              systemAlert.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : systemAlert.type === "error"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : "bg-blue-500/10 border-blue-500/30 text-blue-400"
            }`}
            id="system-toast-container"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-xs font-bold block">
                {systemAlert.type === "success" ? "تم بنجاح" : systemAlert.type === "error" ? "خطأ في النظام" : "تنبيه النظام"}
              </span>
              <p className="text-xs text-white/95 leading-relaxed" id="system-toast-message">
                {systemAlert.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom End Shift Confirmation Modal */}
      <AnimatePresence>
        {showEndShiftModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-sm" id="end-shift-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-rose-500"></div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold text-white">إغلاق وردية العمل اليومية؟</h3>
                  <span className="text-xs font-bold text-rose-400">إجراء حاسم</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-white/70 leading-relaxed">
                  هل أنت متأكد تماماً من رغبتك في إغلاق وإكمال وردية العمل الحالية؟
                </p>
                
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-[#C9A050] block">ملخص العمليات الناجمة:</span>
                  <ul className="text-xs text-white/60 space-y-1.5">
                    <li className="flex items-center gap-1.5">
                      <span className="text-rose-500">■</span> إيقاف استقبال جميع طلبات الزبائن الجديدة
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-rose-500">■</span> تحرير وإغلاق كافة الطاولات المشغولة
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-[#C9A050]">■</span> أرشيف وتجميد الطلبات المكتملة الحالية
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="text-[#C9A050]">■</span> ترحيل الأحصائيات إلى سجلات تاريخ الورديات الدائمة
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEndShiftModal(false)}
                  disabled={isEndingShift}
                  className="h-10 px-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-xs font-bold text-white/60 hover:text-white transition-colors cursor-pointer"
                  id="end-shift-cancel-btn"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={executeEndShift}
                  disabled={isEndingShift}
                  className="h-10 px-5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  id="end-shift-confirm-btn"
                >
                  {isEndingShift ? "جاري إغلاق الوردية..." : "إغلاق الوردية الآن"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Delete Order Confirmation Modal */}
      <AnimatePresence>
        {deleteOrderTargetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-sm" id="delete-order-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-rose-500"></div>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold text-white">حذف سجل الطلب؟</h3>
                  <span className="text-xs font-bold text-rose-400">إجراء نهائي</span>
                </div>
              </div>

              <p className="text-xs text-white/70 leading-relaxed">
                هل أنت متأكد من حذف هذا الطلب نهائياً من سجلات المطعم؟ لا يمكن استعادة هذا السجل لاحقاً.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteOrderTargetId(null)}
                  className="h-10 px-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-xs font-bold text-white/60 hover:text-white transition-colors cursor-pointer"
                  id="delete-order-cancel-btn"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={executeDeleteOrder}
                  className="h-10 px-5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  id="delete-order-confirm-btn"
                >
                  حذف السجل
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {/* FCM Push Notification Troubleshooting & Activation Modal */}
        {showPushModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-lg bg-[#0d0d0d] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-5 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500"></div>

              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <Bell className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white">إعداد إشعارات FCM والخلفية</h3>
                    <p className="text-xs text-[#888888]">Receive notifications even when app is closed</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPushModal(false)}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                  id="close-push-modal-btn"
                >
                  ✕
                </button>
              </div>

              {/* Status Banner */}
              <div className={`p-4 rounded-xl border text-xs space-y-1 ${
                pushStatus === "granted"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : pushStatus === "denied"
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-300"
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span>حالة الإشعارات: {pushStatus === "granted" ? "✅ مفعلة ومحفوظة" : pushStatus === "denied" ? "❌ محظورة في المتصفح" : "⚠️ بحاجة إذن"}</span>
                  {pushStatus === "granted" && <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full">FCM Ready</span>}
                </div>
                {pushError && <p className="text-[11px] opacity-90 mt-1 font-mono">{pushError}</p>}
              </div>

              {/* Step by Step instructions if blocked or in iframe preview */}
              <div className="space-y-3 text-xs text-white/80">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>💡 خطوات السماح بالإشعارات على جهازك:</span>
                </h4>

                {isIframe && (
                  <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl space-y-2">
                    <p className="font-bold text-amber-300">
                      ⚠️ معاينة المتصفح المُضمنة (Iframe) تمنع حوارات الإشعارات:
                    </p>
                    <p className="text-[11px] text-white/80 leading-relaxed">
                      تتطلب حماية متصفحات Chrome و Safari فتح الموقع في نافذة مستقلة لتمكين إشعارات FCM والخدمات في الخلفية.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.open(window.location.href, "_blank")}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                      id="open-new-tab-push-btn"
                    >
                      <Sparkles className="w-4 h-4" />
                      فتح التطبيق في نافذة مستقلة (Open in New Tab)
                    </button>
                  </div>
                )}

                <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/5 text-[11px] leading-relaxed">
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                    <p>انقر على رمز القفل 🔒 أو الإعدادات بجانب عنوان الموقع (URL) في شريط المتصفح.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                    <p>ابحث عن إعداد <strong>الإشعارات (Notifications)</strong> وقم بتغييره إلى <strong>سماح (Allow)</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
                    <p>انقر على زر "إعادة طلب الإذن" أدناه ليتم حفظ جهازك في مجموعة <code>staff_devices</code>.</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    const token = await handlePushRequestPermission();
                    if (token) {
                      alert("✅ تم تفعيل إشعارات FCM بنجاح! وحفظ رمز الجهاز في staff_devices.");
                    }
                  }}
                  className="w-full sm:w-auto flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                  id="re-request-push-perm-btn"
                >
                  <Bell className="w-4 h-4" />
                  إعادة طلب الإذن وتفعيل FCM
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const response = await fetch("/api/send-push", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          type: "order",
                          tableNumber: "Test-1",
                          total: 15.5,
                          restaurantName: "TalkTablee Cafe"
                        })
                      });
                      const data = await response.json();
                      alert(`🔔 تم إرسال إشعار تجريبي:\n${JSON.stringify(data, null, 2)}`);
                    } catch (e: any) {
                      alert(`فشل الإرسال: ${e.message}`);
                    }
                  }}
                  className="w-full sm:w-auto py-2.5 px-4 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl border border-white/10 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  id="test-push-notification-btn"
                >
                  إرسال إشعار تجريبي 🧪
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Fixed Bottom Navigation Bar */}
      {deviceMode === "mobile" && (
        <nav
          id="mobile-bottom-nav"
          className="fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/95 backdrop-blur-xl border-t border-white/10 px-2 py-2 flex items-center justify-around shadow-2xl"
        >
          <button
            id="mobile-nav-orders"
            onClick={() => setActiveTab("orders")}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all cursor-pointer relative min-h-[48px] min-w-[56px] ${
              activeTab === "orders"
                ? "bg-[#C9A050]/20 text-[#C9A050] font-bold"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Utensils className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">الطلبات</span>
            {pendingOrdersCount + preparingOrdersCount > 0 && (
              <span className="absolute top-1 right-2 bg-[#C9A050] text-black text-[9px] font-bold font-mono px-1.5 py-0.2 rounded-full min-w-[16px] text-center">
                {pendingOrdersCount + preparingOrdersCount}
              </span>
            )}
          </button>

          <button
            id="mobile-nav-requests"
            onClick={() => setActiveTab("requests")}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all cursor-pointer relative min-h-[48px] min-w-[56px] ${
              activeTab === "requests"
                ? "bg-[#C9A050]/20 text-[#C9A050] font-bold"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Bell className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">الاستدعاء</span>
            {pendingRequestsCount > 0 && (
              <span className="absolute top-1 right-2 bg-rose-500 text-white text-[9px] font-bold font-mono px-1.5 py-0.2 rounded-full min-w-[16px] text-center animate-pulse">
                {pendingRequestsCount}
              </span>
            )}
          </button>

          <button
            id="mobile-nav-tables"
            onClick={() => setActiveTab("tables")}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all cursor-pointer relative min-h-[48px] min-w-[56px] ${
              activeTab === "tables"
                ? "bg-[#C9A050]/20 text-[#C9A050] font-bold"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Users className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">الطاولات</span>
          </button>

          <button
            id="mobile-nav-management"
            onClick={() => setActiveTab("restaurant-management")}
            className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all cursor-pointer relative min-h-[48px] min-w-[56px] ${
              activeTab === "restaurant-management"
                ? "bg-[#C9A050]/20 text-[#C9A050] font-bold"
                : "text-white/60 hover:text-white"
            }`}
          >
            <ChefHat className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-bold">القائمة</span>
          </button>

          {role === "owner" && (
            <button
              id="mobile-nav-settings"
              onClick={() => setActiveTab("settings")}
              className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all cursor-pointer relative min-h-[48px] min-w-[56px] ${
                activeTab === "settings"
                  ? "bg-[#C9A050]/20 text-[#C9A050] font-bold"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <SlidersHorizontal className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-bold">المزيد</span>
            </button>
          )}
        </nav>
      )}

      {/* PWA App Download Banner - Staff Dashboard Only */}
      <PwaInstallBanner key={forcePwaKey} />
    </div>
  );
}
