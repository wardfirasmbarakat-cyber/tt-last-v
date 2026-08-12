import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc, onSnapshot, Timestamp } from "firebase/firestore";
import { Compass, Bot, Bell, ShoppingCart, MessageSquare, ArrowLeft, Loader2, Sparkles, X, ChevronDown, ChevronUp, Menu, Shield, Lock, LogIn, AlertCircle, Printer, CheckCircle2, Receipt, Mic, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { db, handleFirestoreError, OperationType } from "./lib/firebase";
import { CartItem, Order, UserProfile, RestaurantSettings } from "./types";

// Import Views
import TableSelectScreen from "./components/TableSelectScreen";
import WelcomeScreen from "./components/WelcomeScreen";
import ThankYouScreen from "./components/ThankYouScreen";
import { VoiceEngineProvider } from "./components/VoiceEngine";
import { useLanguage } from "./context/LanguageContext";
import LanguageToggle from "./components/LanguageToggle";
import PwaInstallBanner from "./components/PwaInstallBanner";
import BrowserCompatibilityAlert from "./components/BrowserCompatibilityAlert";
import DebugPanel from "./components/DebugPanel";

// Lazy Loaded Views for Code Splitting & Performance Optimization
const MenuView = React.lazy(() => import("./components/MenuView"));
const AiWaiterChat = React.lazy(() => import("./components/AiWaiterChat"));
const CartAndOrdering = React.lazy(() => import("./components/CartAndOrdering"));
const TableActions = React.lazy(() => import("./components/TableActions"));
const ReviewsView = React.lazy(() => import("./components/ReviewsView"));
const StaffDashboard = React.lazy(() => import("./components/StaffDashboard"));

import { safeLocalStorage, safeSessionStorage } from "./utils/safeStorage";
import { logAppLifecycle, logFirebaseInit, logReactState, logDebug } from "./utils/safariDebugger";
import { CartOrderService } from "./services/voice/cartOrderService";

type ViewTab = "welcome" | "menu" | "ai-waiter" | "cart" | "table-actions" | "reviews" | "staff-dashboard";

export default function App() {
  const { t, dir, isArabic } = useLanguage();
  const [currentTab, setCurrentTab] = useState<ViewTab>("welcome");
  const [isNavVisible, setIsNavVisible] = useState(true);

  // Defer non-essential Firestore background listeners until after the initial browser paint frame
  const [isInitialPainted, setIsInitialPainted] = useState(false);

  useEffect(() => {
    let handle: number;
    const timer = setTimeout(() => {
      handle = requestAnimationFrame(() => {
        setIsInitialPainted(true);
      });
    }, 60);

    return () => {
      clearTimeout(timer);
      if (handle) cancelAnimationFrame(handle);
    };
  }, []);

  // Restaurant Settings State & Sync Listener
  const [settings, setSettings] = useState<RestaurantSettings>(() => {
    const saved = safeLocalStorage.getItem("restaurant_settings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      name: "Salein Cafe",
      description: "Experience premium specialty coffee and cafe dining guided by Ward | ورد, your AI Voice Waiter.",
      logo: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=150",
      coverImage: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80&w=1200",
      address: "Amman, Jordan",
      phone: "+962 7 9000 0000",
      businessHours: "08:00 AM - 12:00 AM",
      cuisineType: "Specialty Coffee & Gourmet Cafe",
      currency: "JD",
      language: "ar",
      taxRate: 0,
      serviceFee: 0.05,
      isServiceFeeEnabled: true,
      acceptedPaymentMethods: ["cash", "card"],
      facebook: "https://facebook.com/saleincafe",
      instagram: "https://instagram.com/saleincafe"
    };
  });

  // ------------------------------------------------------------------
  // Safari & App Mount Sequence Diagnostics
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).__appMountTimeout) {
      clearTimeout((window as any).__appMountTimeout);
    }

    logAppLifecycle("App root component mounted successfully", {
      currentTab,
      windowLocation: typeof window !== "undefined" ? window.location.href : "SSR",
      viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "Unknown",
    }, "success");

    return () => {
      logAppLifecycle("App root component unmounting", null, "warn");
    };
  }, []);

  // Track React State updates in debug panel
  useEffect(() => {
    logReactState("App", "currentTab", currentTab);
  }, [currentTab]);

  useEffect(() => {
    logReactState("App", "settings", { name: settings?.name, status: settings?.status });
  }, [settings?.name, settings?.status]);

  useEffect(() => {
    if (!isInitialPainted) return;

    const unsubscribe = onSnapshot(doc(db, "settings", "restaurant"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as RestaurantSettings;
        setSettings(data);
        safeLocalStorage.setItem("restaurant_settings", JSON.stringify(data));
        logFirebaseInit("Loaded restaurant settings from Firestore", { name: data.name, status: data.status }, "success");
      } else {
        logFirebaseInit("No restaurant settings doc found, seeding defaults", null, "warn");
        const defaults: RestaurantSettings = {
          name: "Salein Cafe",
          description: "Experience premium specialty coffee and cafe dining guided by Ward | ورد, your AI Voice Waiter.",
          logo: "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=150",
          coverImage: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80&w=1200",
          address: "Amman, Jordan",
          phone: "+962 7 9000 0000",
          businessHours: "08:00 AM - 12:00 AM",
          cuisineType: "Specialty Coffee & Gourmet Cafe",
          currency: "JD",
          language: "en",
          taxRate: 0,
          serviceFee: 0.05,
          isServiceFeeEnabled: true,
          acceptedPaymentMethods: ["cash", "card"],
          facebook: "https://facebook.com/saleincafe",
          instagram: "https://instagram.com/saleincafe"
        };
        setDoc(doc(db, "settings", "restaurant"), {
          ...defaults,
          updatedAt: Timestamp.now()
        }).catch(err => {
          console.warn("Seeding default settings note:", err);
          logFirebaseInit("Seeding default settings note", err, "warn");
        });
      }
    }, (error) => {
      console.warn("Settings listener note: ", error);
      logFirebaseInit("Settings listener note", error, "warn");
    });
    return () => unsubscribe();
  }, [isInitialPainted]);
  
  // Auth & Profile State - Auto-provisioned Guest for zero-barrier interaction
  const [user] = useState<any>(() => {
    let savedId = safeLocalStorage.getItem("guest_user_id");
    if (!savedId) {
      savedId = `guest_${Math.random().toString(36).substring(2, 11)}`;
      safeLocalStorage.setItem("guest_user_id", savedId);
    }
    return {
      uid: savedId,
      displayName: "Gourmet Diner",
      email: "guest@gourmet.com"
    };
  });

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const userId = safeLocalStorage.getItem("guest_user_id") || "gourmet_guest";
    return {
      userId,
      name: "Gourmet Diner",
      email: "guest@gourmet.com",
      role: "customer",
      loyaltyPoints: 0,
      createdAt: new Date()
    };
  });

  const [isTableSelected, setIsTableSelected] = useState(() => {
    let tableParam = null;
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        tableParam = params.get("table");
      } catch (e) {}
    }
    if (tableParam) return true;
    const saved = safeSessionStorage.getItem("selected_table_number");
    return !!saved;
  });

  const [tableNumber, setTableNumber] = useState(() => {
    let tableParam = null;
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        tableParam = params.get("table");
      } catch (e) {}
    }
    if (tableParam) return tableParam;
    return safeSessionStorage.getItem("selected_table_number") || "12";
  });
  
  const handleSelectTable = async (table: string) => {
    try {
      const tableRef = doc(db, "tables", table);
      await setDoc(tableRef, {
        tableId: table,
        isOccupied: true,
        userId: user.uid,
        updatedAt: Timestamp.now()
      });
    } catch (err) {
      console.error("Failed to lock table in Firestore:", err);
    }
    setTableNumber(table);
    sessionStorage.setItem("selected_table_number", table);
    setIsTableSelected(true);
  };

  const handleResetTable = async () => {
    try {
      if (tableNumber) {
        const tableRef = doc(db, "tables", tableNumber);
        await deleteDoc(tableRef);
      }
    } catch (err) {
      console.error("Failed to release table lock:", err);
    }
    sessionStorage.removeItem("selected_table_number");
    setIsTableSelected(false);
  };

  // Refresh lock state on mount or table change to keep Firestore in sync with session
  useEffect(() => {
    if (!isInitialPainted) return;

    if (isTableSelected && tableNumber && user?.uid) {
      const tableRef = doc(db, "tables", tableNumber);
      setDoc(tableRef, {
        tableId: tableNumber,
        isOccupied: true,
        userId: user.uid,
        updatedAt: Timestamp.now()
      }).catch((err) => {
        console.error("Failed to self-lock table on mount:", err);
      });
    }
  }, [isInitialPainted, isTableSelected, tableNumber, user?.uid]);

  // ------------------------------------------------------------------
  // REAL-TIME SHIFT SOURCE OF TRUTH (Requirement: Firebase active shift is source of truth)
  // ------------------------------------------------------------------
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [isShiftChecking, setIsShiftChecking] = useState<boolean>(true);
  const [shiftCheckError, setShiftCheckError] = useState<boolean>(false);

  useEffect(() => {
    if (!isInitialPainted) return;

    setIsShiftChecking(true);
    setShiftCheckError(false);

    const q = query(
      collection(db, "shifts"),
      where("status", "in", ["open", "OPEN"])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setIsShiftChecking(false);
        setShiftCheckError(false);
        if (!snapshot.empty) {
          const docSnap = snapshot.docs[0];
          setActiveShift({
            shiftId: docSnap.id,
            ...docSnap.data()
          });
        } else {
          setActiveShift(null);
        }
      },
      (error) => {
        console.warn("Shift check error note:", error);
        setIsShiftChecking(false);
        setShiftCheckError(true);
      }
    );

    return () => unsubscribe();
  }, [isInitialPainted]);

  // Centralized Derived State: Restaurant is open ONLY when an active OPEN shift exists in Firebase
  const restaurantCanAcceptOrders = !isShiftChecking && !shiftCheckError && activeShift !== null && (activeShift.status?.toLowerCase() === "open");

  const [isSessionForceClosed, setIsSessionForceClosed] = useState(false);

  // Real-time table occupancy listener to check if the session is force closed by staff/admin
  useEffect(() => {
    if (!isInitialPainted || !isTableSelected || !tableNumber || !user?.uid) {
      setIsSessionForceClosed(false);
      return;
    }

    const tableRef = doc(db, "tables", tableNumber);
    const unsubscribe = onSnapshot(tableRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        // If the table is occupied by someone else, or isOccupied is false, trigger end session
        if (!data.isOccupied || data.userId !== user.uid) {
          setIsSessionForceClosed(true);
        } else {
          setIsSessionForceClosed(false);
        }
      } else {
        // If the document does not exist, it was deleted (Force Closed!)
        setIsSessionForceClosed(true);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `tables/${tableNumber}`);
    });

    return () => unsubscribe();
  }, [isInitialPainted, isTableSelected, tableNumber, user?.uid]);

  const [favorites, setFavorites] = useState<string[]>([]);
  
  // Cart & Order State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [initialAiQuery, setInitialAiQuery] = useState<string>("");

  const handleAskWard = (query: string) => {
    setInitialAiQuery(query);
    setCurrentTab("ai-waiter");
  };

  // Track table selection and active order state
  useEffect(() => {
    logReactState("App", "tableSelection", { tableNumber, isTableSelected });
  }, [tableNumber, isTableSelected]);

  useEffect(() => {
    logReactState("App", "activeOrder", activeOrder ? { id: activeOrder.orderId, status: activeOrder.status } : "null");
  }, [activeOrder]);

  // Sync customer's active/latest order from Firestore in real-time
  useEffect(() => {
    if (!isInitialPainted || !user?.uid) return;

    logFirebaseInit("Subscribing to customer orders listener", { userId: user.uid }, "info");
    const q = query(
      collection(db, "orders"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      logFirebaseInit("Customer orders listener fired", { docCount: snapshot.size }, "info");
      const userOrders: Order[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        userOrders.push({
          orderId: docSnap.id,
          ...data
        } as Order);
      });

      if (userOrders.length === 0) {
        setActiveOrder(null);
        return;
      }

      // Sort by createdAt descending
      userOrders.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });

      // Prefer the latest in-progress order (pending, preparing, ready)
      const active = userOrders.find(o => o.status !== "delivered" && o.status !== "cancelled" && o.status !== "finished");
      if (active) {
        setActiveOrder(active);
      } else {
        // If order is delivered (and not finished), keep it as activeOrder so customer can review/pay
        const delivered = userOrders.find(o => o.status === "delivered");
        if (delivered) {
          setActiveOrder(delivered);
        } else {
          // If all orders are finished or cancelled, clear activeOrder!
          setActiveOrder(null);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "orders");
    });

    return () => unsubscribe();
  }, [isInitialPainted, user?.uid]);

  // Force redirect to Cart (tracking) screen if restaurant is closed but user has an active order in progress
  useEffect(() => {
    const hasActiveOrderInProgress = activeOrder && activeOrder.status !== "delivered" && activeOrder.status !== "cancelled" && activeOrder.status !== "finished";
    if (settings?.status === "Closed" && hasActiveOrderInProgress && currentTab !== "cart") {
      setCurrentTab("cart");
    }
  }, [settings?.status, activeOrder, currentTab]);

  // Global Toast System for Table Service
  const [toasts, setToasts] = useState<any[]>([]);
  const mountTimeRef = useRef(Date.now());
  const processedRequestIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isInitialPainted || !user?.uid) return;

    const activeTimeouts = new Set<NodeJS.Timeout>();

    const q = query(
      collection(db, "waiterRequests"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const requestId = data.requestId || change.doc.id;
        
        // Convert Timestamp to JS Date safely
        const createdDate = data.createdAt && typeof data.createdAt.toDate === "function"
          ? data.createdAt.toDate()
          : data.createdAt 
            ? new Date(data.createdAt) 
            : new Date();

        // Ignore requests created before the application was loaded or mounted
        if (createdDate.getTime() < mountTimeRef.current - 1500) {
          return;
        }

        const requestTypes: Record<string, string> = {
          call_waiter: "Call Waiter Request",
          request_water: "Fresh Water Request",
          request_napkins: "Linen Napkins Request",
          request_cutlery: "Silverware Cutlery Request",
          clean_table: "Table Cleaning Request",
          request_bill: "Bill Check Request"
        };

        const serviceName = requestTypes[data.type] || "Table Service Action";

        if (change.type === "added") {
          const pendingKey = `${requestId}_pending`;
          if (processedRequestIdsRef.current.has(pendingKey)) {
            return;
          }
          processedRequestIdsRef.current.add(pendingKey);

          // Toast for when the request is dispatched
          const newToast = {
            id: pendingKey,
            name: serviceName,
            status: "pending",
            message: `Dispatched request for Table ${data.tableNumber}. Service staff has been alerted.`,
            createdAt: Date.now()
          };
          setToasts((prev) => {
            // Avoid duplicates
            if (prev.some(t => t.id === newToast.id)) return prev;
            return [...prev, newToast];
          });

          // Auto-remove dispatch toast after 3.5 seconds
          const tId = setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== newToast.id));
            activeTimeouts.delete(tId);
          }, 3500);
          activeTimeouts.add(tId);

        } else if (change.type === "modified") {
          if (data.status === "completed") {
            const completedKey = `${requestId}_completed`;
            if (processedRequestIdsRef.current.has(completedKey)) {
              return;
            }
            processedRequestIdsRef.current.add(completedKey);

            // Toast for when staff has acknowledged/handled the request
            const newToast = {
              id: completedKey,
              name: serviceName,
              status: "completed",
              message: `Acknowledged! A service staff member is on their way with your items.`,
              createdAt: Date.now()
            };
            setToasts((prev) => {
              // Dismiss the corresponding pending toast immediately
              const filtered = prev.filter(t => t.id !== `${requestId}_pending`);
              if (filtered.some(t => t.id === newToast.id)) return filtered;
              return [...filtered, newToast];
            });

            // Auto-remove completed toast after 5 seconds
            const tId = setTimeout(() => {
              setToasts(prev => prev.filter(t => t.id !== newToast.id));
              activeTimeouts.delete(tId);
            }, 5000);
            activeTimeouts.add(tId);
          }
        }
      });
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "waiterRequests");
    });

    return () => {
      unsubscribe();
      activeTimeouts.forEach(clearTimeout);
    };
  }, [isInitialPainted, user?.uid]);

  // 1. Parse URL for Table Number on load and fetch favorites
  useEffect(() => {
    if (!isInitialPainted) return;

    const params = new URLSearchParams(window.location.search);
    const table = params.get("table");
    if (table) {
      setTableNumber(table);
      setIsTableSelected(true);
    }
    loadFavorites(user.uid);
  }, [isInitialPainted]);

  // 2. Load & Toggle Favorites from Firestore with LocalStorage fallback
  const loadFavorites = async (userId: string) => {
    try {
      const q = query(collection(db, "favorites"), where("userId", "==", userId));
      const querySnapshot = await getDocs(q);
      const favItemIds: string[] = [];
      querySnapshot.forEach((doc) => {
        favItemIds.push(doc.data().itemId);
      });
      setFavorites(favItemIds);
      try { localStorage.setItem(`favorites_${userId}`, JSON.stringify(favItemIds)); } catch (e) { /* ignore */ }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "favorites");
      try {
        const saved = localStorage.getItem(`favorites_${userId}`);
        if (saved) setFavorites(JSON.parse(saved));
      } catch (e) { /* ignore */ }
    }
  };

  const handleToggleFavorite = async (itemId: string) => {
    if (!user) return;

    const favoriteId = `${user.uid}_${itemId}`;
    const favDocRef = doc(db, "favorites", favoriteId);

    const isFav = favorites.includes(itemId);
    const newFavs = isFav ? favorites.filter(id => id !== itemId) : [...favorites, itemId];
    setFavorites(newFavs);
    try { localStorage.setItem(`favorites_${user.uid}`, JSON.stringify(newFavs)); } catch (e) { /* ignore */ }

    try {
      if (isFav) {
        await deleteDoc(favDocRef);
      } else {
        await setDoc(favDocRef, {
          favoriteId,
          userId: user.uid,
          itemId,
          createdAt: new Date()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `favorites/${favoriteId}`);
    }
  };

  // 4. Cart State Helpers
  const handleAddToCart = (itemOrItems: CartItem | CartItem[]) => {
    const rawItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    const normalizedItems = rawItems.map(item => CartOrderService.normalizeCartItem(item));

    let updatedCart: CartItem[] = [];
    setCart(prev => {
      updatedCart = CartOrderService.addItemsToCart(prev, normalizedItems);
      return updatedCart;
    });

    const fallbackCart = CartOrderService.addItemsToCart(cart, normalizedItems);
    return updatedCart.length > 0 ? updatedCart : fallbackCart;
  };

  const handleUpdateQuantity = (cartId: string, delta: number) => {
    let updatedCart: CartItem[] = [];
    setCart(prev => {
      updatedCart = prev.map(item => {
        if (item.id === cartId) {
          const nextQty = item.quantity + delta;
          return nextQty > 0 ? { ...item, quantity: nextQty } : item;
        }
        return item;
      }).filter(item => item.quantity > 0);
      return updatedCart;
    });
    
    let updated = cart.map(item => {
      if (item.id === cartId) {
        const nextQty = item.quantity + delta;
        return nextQty > 0 ? { ...item, quantity: nextQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0);
    
    return updatedCart.length > 0 ? updatedCart : updated;
  };

  const handleRemoveItem = (cartId: string) => {
    let updatedCart: CartItem[] = [];
    setCart(prev => {
      updatedCart = prev.filter(item => item.id !== cartId);
      return updatedCart;
    });
    let updated = cart.filter(item => item.id !== cartId);
    return updatedCart.length > 0 ? updatedCart : updated;
  };

  const handleUpdateItemNote = (cartId: string, note: string) => {
    let updatedCart: CartItem[] = [];
    setCart(prev => {
      updatedCart = prev.map(item => item.id === cartId ? { ...item, note } : item);
      return updatedCart;
    });
    let updated = cart.map(item => item.id === cartId ? { ...item, note } : item);
    return updatedCart.length > 0 ? updatedCart : updated;
  };

  const handleClearCart = () => setCart([]);

  // Digital Receipt State & Generator
  const [digitalReceipt, setDigitalReceipt] = useState<any | null>(null);

  const generateDigitalReceipt = (order: Order, customItems?: (CartItem | any)[]) => {
    const items = (order.items && order.items.length > 0)
      ? order.items
      : (order.orderedItems && order.orderedItems.length > 0)
        ? order.orderedItems
        : (customItems || []);

    const subtotal = order.subtotal || items.reduce((sum: number, item: any) => sum + (Number(item.price || item.basePrice || 0) * (item.quantity || 1)), 0);
    const tax = 0;
    const talkTableFee = order.talkTableFee !== undefined ? order.talkTableFee : 0.05;
    const total = order.total || Number((subtotal + tax + talkTableFee).toFixed(2));

    let createdTimeStr = new Date().toLocaleString();
    if (order.createdAt) {
      if (typeof (order.createdAt as any).toDate === "function") {
        createdTimeStr = (order.createdAt as any).toDate().toLocaleString();
      } else if (order.createdAt instanceof Date) {
        createdTimeStr = order.createdAt.toLocaleString();
      } else if (typeof order.createdAt === "string" || typeof order.createdAt === "number") {
        createdTimeStr = new Date(order.createdAt).toLocaleString();
      }
    }

    const summary = {
      orderId: order.orderId || `ORD-${Date.now()}`,
      restaurantName: settings?.name || "Salein Cafe",
      tableNumber: order.tableNumber || tableNumber || "12",
      customerName: order.customerName || userProfile?.name || "Gourmet Diner",
      items,
      subtotal,
      tax,
      talkTableFee,
      total,
      paymentMethod: order.paymentMethod || "cash",
      notes: order.notes || "",
      orderSource: order.orderSource || "AI Waiter",
      createdAt: createdTimeStr,
      status: order.status || "pending"
    };

    setDigitalReceipt(summary);
    return summary;
  };

  // 5. Handle active order on success
  const handleOrderPlaced = async (order: Order) => {
    try {
      // Ensure items array and orderedItems array are preserved during transition
      const orderItems = order.items && order.items.length > 0
        ? order.items
        : ((order as any).orderedItems || []);

      const payloadToSave = {
        ...order,
        items: orderItems,
        orderedItems: orderItems,
        status: order.status || "pending",
        orderStatus: order.orderStatus || "new",
        updatedAt: Timestamp.now()
      };

      console.log(`[App handleOrderPlaced] Preparing to write order ${order.orderId} for Table ${order.tableNumber} to Firestore 'orders' collection. Schema:`, JSON.stringify(payloadToSave, null, 2));

      const orderRef = doc(db, "orders", order.orderId);
      await setDoc(orderRef, payloadToSave, { merge: true });

      console.log(`[App handleOrderPlaced] Successfully persisted order ${order.orderId} to Firestore 'orders' collection. Real-time Kitchen Dashboard updated.`);
    } catch (err) {
      console.error(`[App handleOrderPlaced] Error persisting order document to Firestore:`, err);
    }
    setActiveOrder(order);
    generateDigitalReceipt(order);
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Closed screen Admin Login states
  const [closedAdminPasscode, setClosedAdminPasscode] = useState("");
  const [closedAdminError, setClosedAdminError] = useState("");
  const [showClosedAdminModal, setShowClosedAdminModal] = useState(false);

  const handleClosedAdminLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setClosedAdminError("");

    if (closedAdminPasscode === "owner123") {
      safeSessionStorage.setItem("staff_authenticated", "true");
      safeSessionStorage.setItem("staff_role", "owner");
      setShowClosedAdminModal(false);
      setClosedAdminPasscode("");
      setCurrentTab("staff-dashboard");
    } else if (closedAdminPasscode === "test123") {
      safeSessionStorage.setItem("staff_authenticated", "true");
      safeSessionStorage.setItem("staff_role", "staff");
      setShowClosedAdminModal(false);
      setClosedAdminPasscode("");
      setCurrentTab("staff-dashboard");
    } else {
      setClosedAdminError("Invalid passcode. Please try again.");
    }
  };

  // Helper to render Admin Login Modal across closed/loading/error screens
  const renderClosedAdminModal = () => (
    <AnimatePresence>
      {showClosedAdminModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-[#121216] border border-[#C9A050]/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-white text-left relative overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#C9A050]" />
                <h3 className="font-display font-bold text-sm text-white">Admin & Staff Portal Login</h3>
              </div>
              <button
                onClick={() => {
                  setShowClosedAdminModal(false);
                  setClosedAdminError("");
                }}
                className="text-white/50 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleClosedAdminLogin} className="space-y-4">
              <p className="text-xs text-white/70">
                Enter your staff or owner passcode to manage settings, open shifts, or view sales:
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono font-bold text-[#C9A050] tracking-wider block">
                  Passcode
                </label>
                <input
                  type="password"
                  value={closedAdminPasscode}
                  onChange={(e) => setClosedAdminPasscode(e.target.value)}
                  placeholder="Enter passcode..."
                  autoFocus
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#C9A050] font-mono"
                />
              </div>

              {closedAdminError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2.5 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{closedAdminError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowClosedAdminModal(false);
                    setClosedAdminError("");
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A050] to-[#e5be70] text-black font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all active:scale-95 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Log In</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Bypass table selection for staff dashboard
  if (currentTab === "staff-dashboard") {
    return (
      <VoiceEngineProvider>
        <React.Suspense fallback={
          <div className="min-h-screen bg-[#0d1117] text-white flex flex-col items-center justify-center p-4 gap-3">
            <Loader2 className="w-8 h-8 text-[#C9A050] animate-spin" />
            <p className="font-mono text-xs text-white/70">Loading Staff & Kitchen Dashboard...</p>
          </div>
        }>
          <StaffDashboard onExit={() => setCurrentTab("welcome")} />
        </React.Suspense>
      </VoiceEngineProvider>
    );
  }

  // ------------------------------------------------------------------
  // RESTAURANT AVAILABILITY CHECKS (Shift-based source of truth)
  // ------------------------------------------------------------------

  // 1. Loading State: Checking whether an active shift exists in Firebase
  if (isShiftChecking) {
    return (
      <VoiceEngineProvider>
        <div className="min-h-screen bg-[#050505] text-[#F5F5F7] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden" id="shift-loading-screen">
          <div className="max-w-md w-full space-y-4 bg-[#0D0D0D]/90 border border-white/10 p-8 rounded-3xl backdrop-blur-xl relative z-10 shadow-2xl flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-[#C9A050] animate-spin" />
            <h2 className="text-lg font-bold text-white" id="loading-availability-title">
              {isArabic ? "جاري التحقق من حالة المطعم..." : "Checking restaurant availability..."}
            </h2>
            <p className="text-xs text-[#888888]" id="loading-availability-sub">
              {isArabic ? "يرجى الانتظار بينما نتحقق من حالة الوردية الحالية." : "Please wait while we verify the active shift status."}
            </p>
            <div className="pt-4 w-full">
              <button
                id="login-as-admin-loading-btn"
                onClick={() => setShowClosedAdminModal(true)}
                className="w-full bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Shield className="w-4 h-4 text-[#C9A050]" />
                <span>{isArabic ? "تسجيل دخول الإدارة" : "Log in as Admin"}</span>
              </button>
            </div>
          </div>
          {renderClosedAdminModal()}
        </div>
      </VoiceEngineProvider>
    );
  }

  // 2. Error State: Network or permission issue checking shift status in Firebase
  if (shiftCheckError) {
    return (
      <VoiceEngineProvider>
        <div className="min-h-screen bg-[#050505] text-[#F5F5F7] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden" id="shift-error-screen">
          <div className="max-w-md w-full space-y-4 bg-[#0D0D0D]/90 border border-white/10 p-8 rounded-3xl backdrop-blur-xl relative z-10 shadow-2xl flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white" id="shift-error-title">
              {isArabic ? "مشكلة في التحقق من حالة المطعم" : "Unable to Verify Restaurant Status"}
            </h2>
            <p className="text-xs text-[#888888] leading-relaxed" id="shift-error-sub">
              {isArabic
                ? "نواجه مشكلة في التحقق من حالة المطعم. يرجى المحاولة بعد قليل."
                : "We're having trouble checking whether the restaurant is open. Please try again shortly."}
            </p>
            <div className="pt-4 w-full space-y-2">
              <button
                onClick={() => {
                  setIsShiftChecking(true);
                  setShiftCheckError(false);
                }}
                className="w-full bg-[#C9A050] text-black font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isArabic ? "إعادة المحاولة" : "Retry"}</span>
              </button>
              <button
                id="login-as-admin-error-btn"
                onClick={() => setShowClosedAdminModal(true)}
                className="w-full bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Shield className="w-4 h-4 text-[#C9A050]" />
                <span>{isArabic ? "تسجيل دخول الإدارة" : "Log in as Admin"}</span>
              </button>
            </div>
          </div>
          {renderClosedAdminModal()}
        </div>
      </VoiceEngineProvider>
    );
  }

  // 3. Closed State: No active OPEN shift document in Firebase
  const hasActiveOrderInProgress = activeOrder && activeOrder.status !== "delivered" && activeOrder.status !== "cancelled" && activeOrder.status !== "finished";

  if (!restaurantCanAcceptOrders && !hasActiveOrderInProgress) {
    return (
      <VoiceEngineProvider>
        <div className="min-h-screen bg-[#050505] text-[#F5F5F7] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden" id="restaurant-closed-screen">
          {/* Background Ambient Glows */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-red-900/10 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="absolute top-[-10%] right-[-10%] w-[300px] h-[300px] bg-[#C9A050]/5 rounded-full blur-[120px] pointer-events-none"></div>

          <div className="max-w-md w-full space-y-6 bg-[#0D0D0D]/90 border border-white/10 p-8 rounded-3xl backdrop-blur-xl relative z-10 shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto text-2xl animate-pulse shadow-lg" id="closed-icon-div">
              🚪
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-display font-semibold tracking-tight text-white" id="closed-title">
                {isArabic ? "المطعم مغلق حالياً" : "Restaurant is Closed"}
              </h1>
              <p className="text-sm text-[#888888] leading-relaxed" id="closed-msg-1">
                {isArabic
                  ? "المطعم مغلق حالياً. سيتم فتح الطلبات عند بدء الوردية القادمة."
                  : "The restaurant is currently closed. Ordering will be available when the next shift opens."}
              </p>
              {tableNumber && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-mono text-[#C9A050] mt-2">
                  <span>{isArabic ? `طاولة رقم ${tableNumber}` : `Table ${tableNumber}`}</span>
                </div>
              )}
            </div>

            <div className="pt-2 space-y-3 border-t border-white/10">
              <button
                id="orders-unavailable-btn"
                disabled
                className="w-full bg-white/5 border border-white/5 text-white/40 cursor-not-allowed font-medium py-3 rounded-xl text-xs uppercase tracking-wider"
              >
                {isArabic ? "الطلبات غير متاحة حالياً" : "Orders Unavailable"}
              </button>

              {/* Log in as Admin / Staff Button */}
              <button
                id="login-as-admin-closed-btn"
                onClick={() => setShowClosedAdminModal(true)}
                className="w-full bg-gradient-to-r from-[#C9A050] to-[#e5be70] hover:brightness-110 text-black font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                <Shield className="w-4 h-4" />
                <span>{isArabic ? "تسجيل دخول الإدارة" : "Log in as Admin"}</span>
              </button>
            </div>
          </div>

          {renderClosedAdminModal()}
        </div>
      </VoiceEngineProvider>
    );
  }

  if (isSessionForceClosed) {
    const handleAcknowledgeForceClose = () => {
      // Clear temporary cart data
      setCart([]);
      
      // Clear local session details
      sessionStorage.removeItem("selected_table_number");
      localStorage.removeItem("guest_user_id");
      
      // Reset table selection and end-session state
      setIsTableSelected(false);
      setIsSessionForceClosed(false);
      setCurrentTab("welcome");
    };

    return (
      <VoiceEngineProvider>
        <div dir={dir}>
          <ThankYouScreen
            settings={settings}
            tableNumber={tableNumber}
            activeOrder={activeOrder}
            onFinish={handleAcknowledgeForceClose}
          />
        </div>
      </VoiceEngineProvider>
    );
  }

  if (!isTableSelected) {
    return (
      <VoiceEngineProvider>
        <div dir={dir}>
          <TableSelectScreen
            onSelectTable={handleSelectTable}
            initialTable={tableNumber}
            onEnterAdmin={() => setCurrentTab("staff-dashboard")}
            currentUserId={user?.uid}
            settings={settings}
          />
        </div>
      </VoiceEngineProvider>
    );
  }

  return (
    <VoiceEngineProvider>
      <div dir={dir} className="min-h-screen bg-brand-50 text-[#F5F5F7] flex flex-col justify-between pb-20 relative overflow-hidden">
        {/* Background Ambient Glows */}
      <div className="absolute top-[-200px] left-[-100px] w-[500px] h-[500px] bg-[#C9A050]/8 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-100px] right-[-50px] w-[400px] h-[400px] bg-[#5066C9]/8 rounded-full blur-[100px] pointer-events-none z-0"></div>
      
      {/* Top micro Navigation header when inside deep views */}
      {currentTab !== "welcome" && !(settings?.status === "Closed" && hasActiveOrderInProgress) && (
        <div className="bg-[#050505]/60 backdrop-blur-md sticky top-0 border-b border-white/5 px-4 py-3 flex items-center justify-between z-40 shadow-sm">
          <button
            id="back-to-welcome"
            onClick={() => setCurrentTab("welcome")}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#888888] hover:text-[#C9A050] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            <span>{t("nav.welcome")}</span>
          </button>
          
          <div className="text-center flex items-center gap-1.5 justify-center">
            <span className="text-[10px] uppercase font-mono text-[#C9A050] tracking-[0.2em] font-bold">
              {t("common.table")} {tableNumber}
            </span>
            <button
              id="change-table-nav"
              onClick={handleResetTable}
              className="text-[8px] uppercase tracking-wider text-[#888888] hover:text-[#C9A050] underline cursor-pointer"
            >
              ({t("welcome.changeTable")})
            </button>
          </div>

          <div>
            <LanguageToggle variant="compact" />
          </div>
        </div>
      )}

      {/* Main Container / Router switch with animations */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <React.Suspense fallback={<div className="flex justify-center p-12 h-full items-center"><Loader2 className="w-8 h-8 animate-spin text-[#C9A050]" /></div>}>
            {currentTab === "welcome" && (
              <WelcomeScreen
                tableNumber={tableNumber}
                user={user}
                userProfile={userProfile}
                onNavigate={setCurrentTab}
                onChangeTable={handleResetTable}
                settings={settings}
              />
            )}

            {currentTab === "menu" && (
              <MenuView
                onAddToCart={handleAddToCart}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                isSignedIn={true}
                onOpenLogin={() => {}}
                onAskWard={handleAskWard}
                cart={cart}
                onNavigateToCart={() => setCurrentTab('cart')}
              />
            )}

            {currentTab === "ai-waiter" && (
              <AiWaiterChat
                tableNumber={tableNumber}
                cart={cart}
                onAddToCart={handleAddToCart}
                onUpdateCart={(newCart) => setCart(newCart)}
                onNavigate={(tab: string) => setCurrentTab(tab as any)}
                onOrderPlaced={handleOrderPlaced}
                onClearCart={handleClearCart}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onUpdateItemNote={handleUpdateItemNote}
                initialQuery={initialAiQuery}
                onClearInitialQuery={() => setInitialAiQuery("")}
              />
            )}

            {currentTab === "cart" && (
              <CartAndOrdering
                cart={cart}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onClearCart={handleClearCart}
                userId={user?.uid || null}
                tableNumber={tableNumber}
                onOrderPlaced={handleOrderPlaced}
                activeOrder={activeOrder}
                onUpdateActiveOrder={setActiveOrder}
                settings={settings}
              />
            )}

            {currentTab === "table-actions" && (
              <TableActions
                tableNumber={tableNumber}
                userId={user?.uid || null}
              />
            )}

            {currentTab === "reviews" && (
              <ReviewsView
                user={user}
              />
            )}
            </React.Suspense>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating Glassmorphic Nav bar (Only shown when not on welcome screen) */}
      {currentTab !== "welcome" && !(settings?.status === "Closed" && hasActiveOrderInProgress) && (
        <>
          <motion.div
            initial={false}
            animate={{
              y: isNavVisible ? 0 : 120,
              opacity: isNavVisible ? 1 : 0,
              pointerEvents: isNavVisible ? "auto" : "none",
            }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-white/5 backdrop-blur-2xl border border-white/10 p-1.5 rounded-[18px] shadow-2xl flex justify-around items-center z-50 glow-ambient"
          >
            {[
              { tab: "menu", icon: Compass, label: t("nav.menu") },
              { tab: "ai-waiter", icon: Bot, label: t("nav.aiWaiter") },
              { tab: "table-actions", icon: Bell, label: t("nav.tableActions") },
              { tab: "cart", icon: ShoppingCart, label: t("nav.cart"), badge: cartCount },
              { tab: "reviews", icon: MessageSquare, label: t("nav.reviews") }
            ].map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.tab;

              return (
                <button
                  id={`nav-tab-${item.tab}`}
                  key={item.tab}
                  onClick={() => setCurrentTab(item.tab as ViewTab)}
                  className="flex flex-col items-center justify-center min-w-[48px] min-h-[48px] p-1.5 relative group focus:outline-none cursor-pointer active:scale-95 transition-transform"
                >
                  <div className={`relative p-2 rounded-xl transition-all ${
                    isActive
                      ? "bg-[#C9A050] text-[#050505] shadow-lg shadow-[#C9A050]/20 scale-105"
                      : "text-white/50 hover:text-[#C9A050] hover:bg-white/5"
                  }`}>
                    <Icon className="w-5 h-5" />
                    
                    {/* Cart counts badge */}
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white font-mono text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border border-white animate-pulse">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[8.5px] font-bold uppercase tracking-wider font-mono mt-0.5 transition-colors ${
                    isActive ? "text-[#C9A050]" : "text-white/40 group-hover:text-[#C9A050]"
                  }`}>
                    {item.label}
                  </span>
                </button>
              );
            })}

            {/* Collapse/Hide Button */}
            <button
              onClick={() => setIsNavVisible(false)}
              className="flex flex-col items-center justify-center p-1 relative group focus:outline-none cursor-pointer text-white/30 hover:text-[#C9A050]"
              title="Minimize Navigation"
            >
              <div className="relative p-1.5 rounded-xl transition-all hover:bg-white/5">
                <ChevronDown className="w-4 h-4" />
              </div>
              <span className="text-[7.5px] font-bold uppercase tracking-wider font-mono mt-0.5">
                Hide
              </span>
            </button>
          </motion.div>

          {/* Expose Trigger Button when minimized */}
          <AnimatePresence>
            {!isNavVisible && (
              <motion.button
                id="expand-nav-btn"
                initial={{ opacity: 0, y: 50, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.8 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsNavVisible(true)}
                className="fixed bottom-4 right-4 z-50 bg-[#C9A050] text-[#050505] px-3.5 py-2.5 rounded-full shadow-lg shadow-[#C9A050]/20 flex items-center gap-2 font-mono font-bold text-[10px] uppercase tracking-wider focus:outline-none cursor-pointer border border-[#C9A050]/50"
              >
                <Menu className="w-3.5 h-3.5 animate-pulse" />
                <span>Show Menu</span>
                {cartCount > 0 && (
                  <span className="bg-white text-black font-mono font-extrabold text-[8px] w-4 h-4 rounded-full flex items-center justify-center border border-black/10">
                    {cartCount}
                  </span>
                )}
              </motion.button>
            )}
          </AnimatePresence>

          {/* Large Floating Voice AI Microphone Button */}
          {currentTab !== "ai-waiter" && (
            <motion.button
              id="global-floating-voice-mic-btn"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleAskWard("Hello Ward! Can you help me order from the menu?")}
              className="fixed bottom-20 right-4 z-40 bg-gradient-to-r from-[#C9A050] to-[#b08b40] text-[#050505] p-3.5 sm:px-4 sm:py-3.5 rounded-full shadow-2xl flex items-center gap-2 border-2 border-white/20 font-bold text-xs backdrop-blur-md cursor-pointer hover:shadow-[#C9A050]/40 transition-all"
              title="Talk to Ward (Voice AI)"
            >
              <div className="relative flex items-center justify-center">
                <Mic className="w-5 h-5 text-[#050505] animate-pulse" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <span className="font-mono text-[11px] font-extrabold uppercase">
                Ward Voice AI
              </span>
            </motion.button>
          )}
        </>
      )}

      {/* Real-time Service Toast Notifications */}
      <div className="fixed top-6 right-4 left-4 sm:left-auto sm:w-[380px] z-[9999] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const isCompleted = toast.status === "completed";
            return (
              <motion.div
                id={`toast-notification-${toast.id}`}
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.9 }}
                className="pointer-events-auto w-full bg-[#0a0a0c]/90 backdrop-blur-xl border rounded-2xl p-4 shadow-2xl flex gap-3 relative overflow-hidden"
                style={{
                  borderColor: isCompleted ? "rgba(201, 160, 80, 0.25)" : "rgba(255, 255, 255, 0.08)"
                }}
              >
                {/* Premium Accent Glow inside Toast */}
                <div className={`absolute top-0 left-0 w-1.5 h-full ${isCompleted ? 'bg-[#C9A050]' : 'bg-white/20'}`} />
                
                {/* Icon wrapper */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                  isCompleted 
                    ? "bg-[#C9A050]/10 text-[#C9A050] border-[#C9A050]/20" 
                    : "bg-white/5 text-white/50 border-white/5"
                }`}>
                  {isCompleted ? (
                    <motion.div
                      animate={{ rotate: [0, 15, -15, 0] }}
                      transition={{ duration: 0.5, repeat: 2 }}
                    >
                      <Sparkles className="w-4.5 h-4.5" />
                    </motion.div>
                  ) : (
                    <Loader2 className="w-4.5 h-4.5 animate-spin text-white/40" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white">
                      {toast.name}
                    </span>
                    <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono font-bold ${
                      isCompleted 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" 
                        : "bg-amber-500/10 text-[#C9A050] border border-amber-500/10"
                    }`}>
                      {isCompleted ? "Acknowledged" : "Dispatched"}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/60 mt-1 leading-relaxed">
                    {toast.message}
                  </p>
                </div>

                {/* Close Button */}
                <button
                  onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="absolute top-3.5 right-3.5 text-white/40 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Printable Digital Receipt View Overlay */}
      <AnimatePresence>
        {digitalReceipt && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="printable-receipt bg-[#0d0d11] border border-[#C9A050]/40 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-white relative my-8 overflow-hidden"
            >
              {/* Glow Effects */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#C9A050]/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Close button (hidden during print) */}
              <button
                onClick={() => setDigitalReceipt(null)}
                className="print:hidden absolute top-4 right-4 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
                title="Close Receipt"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Cafe Branding & Header */}
              <div className="text-center pb-6 border-b border-white/10 space-y-2">
                <div className="w-14 h-14 bg-[#C9A050]/15 border border-[#C9A050]/30 text-[#C9A050] rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner">
                  ☕
                </div>
                <div>
                  <h2 className="text-2xl font-display font-bold text-white tracking-wide">
                    {digitalReceipt.restaurantName || "Salein Cafe"}
                  </h2>
                  <p className="text-xs text-[#C9A050] font-mono tracking-wider uppercase font-semibold mt-0.5">
                    Digital Order Receipt 🧾
                  </p>
                  <p className="text-[11px] text-white/50 font-mono mt-1">
                    TalkTableee AI Waiter Service • Amman, Jordan
                  </p>
                </div>
              </div>

              {/* Status Badge & Order Details */}
              <div className="py-4 border-b border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Sent directly to kitchen</span>
                  </div>
                  <span className="text-xs font-mono text-white/60">
                    {digitalReceipt.orderSource}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-white/5 p-3 rounded-2xl text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-white/40 block">Order ID</span>
                    <span className="font-mono font-bold text-[#C9A050] text-xs truncate block">{digitalReceipt.orderId}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-mono text-white/40 block">Table Number</span>
                    <span className="font-mono font-bold text-white text-xs block">Table {digitalReceipt.tableNumber}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-mono text-white/40 block">Payment Method</span>
                    <span className="font-mono font-bold text-white text-xs uppercase block">{digitalReceipt.paymentMethod}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-mono text-white/40 block">Date & Time</span>
                    <span className="font-mono text-[10px] text-white/70 block">{digitalReceipt.createdAt}</span>
                  </div>
                </div>
              </div>

              {/* Itemized Breakdown */}
              <div className="py-4 border-b border-white/10 space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase text-[#C9A050] tracking-wider">
                  Order Items ({digitalReceipt.items.length})
                </h3>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {digitalReceipt.items.map((item: any, idx: number) => {
                    const itemPrice = Number(item.price || item.basePrice || 0);
                    const qty = item.quantity || 1;
                    const lineTotal = (itemPrice * qty).toFixed(2);
                    return (
                      <div key={idx} className="flex items-start justify-between text-xs pb-2 border-b border-white/5 last:border-0">
                        <div className="space-y-0.5 flex-1 pr-3">
                          <div className="flex items-center gap-1.5 font-semibold text-white">
                            <span className="text-[#C9A050] font-mono font-bold">{qty}x</span>
                            <span>{item.name}</span>
                          </div>
                          {item.customizations && item.customizations.length > 0 && (
                            <div className="text-[10px] text-white/50 pl-4 space-y-0.5">
                              {item.customizations.map((c: any, cIdx: number) => (
                                <div key={cIdx}>
                                  {c.title}: {Array.isArray(c.selected) ? c.selected.join(", ") : c.selected}
                                </div>
                              ))}
                            </div>
                          )}
                          {(item.note || item.notes) && (
                            <div className="text-[10px] text-amber-400/90 pl-4 italic">
                              Note: "{item.note || item.notes}"
                            </div>
                          )}
                        </div>
                        <span className="font-mono font-bold text-white shrink-0">
                          {lineTotal} JD
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Kitchen Special Instructions */}
              {digitalReceipt.notes && (
                <div className="py-3 border-b border-white/10 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 text-xs my-3">
                  <span className="font-mono font-bold text-amber-400 block text-[10px] uppercase tracking-wider mb-0.5">
                    Kitchen Special Instructions
                  </span>
                  <p className="text-white/80 italic text-xs">"{digitalReceipt.notes}"</p>
                </div>
              )}

              {/* Financial Totals */}
              <div className="py-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-white/60">
                  <span>Subtotal</span>
                  <span>{Number(digitalReceipt.subtotal).toFixed(2)} JD</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Tax (0%)</span>
                  <span>0.00 JD</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>TalkTableee Service Fee</span>
                  <span>{Number(digitalReceipt.talkTableFee).toFixed(2)} JD</span>
                </div>
                <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-white/15">
                  <span className="text-[#C9A050]">Total</span>
                  <span className="text-[#C9A050]">{Number(digitalReceipt.total).toFixed(2)} JD</span>
                </div>
              </div>

              {/* Footer Message */}
              <div className="text-center pt-2 pb-4 space-y-1">
                <p className="text-[11px] text-emerald-400 font-medium">
                  Thank you for choosing Salein Cafe and for using TalkTableee!
                </p>
                <p className="text-[10px] text-white/40">
                  Our chefs have already started preparing your order. Enjoy your meal!
                </p>
              </div>

              {/* Action Buttons */}
              <div className="print:hidden flex gap-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#C9A050] to-[#e5be70] text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
                <button
                  onClick={() => setDigitalReceipt(null)}
                  className="py-3 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Browser Compatibility & Permissions Alert Overlay */}
      <BrowserCompatibilityAlert />

      {/* Safari & System Diagnostics Overlay Panel */}
      <DebugPanel />
    </div>
    </VoiceEngineProvider>
  );
}
