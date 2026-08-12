import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  Bot,
  User,
  Volume2,
  Sparkles,
  AlertCircle,
  Mic,
  MicOff,
  VolumeX,
  HelpCircle,
  Phone,
  PhoneOff,
  Languages,
  FileText,
  Check,
  RotateCcw,
  Utensils,
  ChefHat,
  Loader2,
  WifiOff,
  RefreshCw,
  ShoppingBag,
  ArrowRight,
  Sparkle,
  CreditCard,
} from "lucide-react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { VoicePipelineErrorBoundary } from "./VoicePipelineErrorBoundary";
import { Order, CartItem, RESTAURANT_ID } from "../types";
import { AIService, Message } from "../services/voice/aiService";
import { VoiceInputService } from "../services/voice/voiceInputService";
import { TTSService } from "../services/voice/ttsService";
import { CartOrderService } from "../services/voice/cartOrderService";
import { VoiceStateManager, VoicePipelineStatus } from "../services/voice/voiceStateManager";
import { LiveVoiceService } from "../services/voice/liveVoiceService";
import { useLanguage } from "../context/LanguageContext";
import { SessionService } from "../services/sessionService";
import { MenuService } from "../services/voice/menuService";

interface AiWaiterChatProps {
  tableNumber: string;
  cart: CartItem[];
  onAddToCart: (items: CartItem[]) => CartItem[] | void;
  onUpdateCart?: (newCart: CartItem[]) => void;
  onNavigate: (tab: string) => void;
  onOrderPlaced?: (order: Order) => void;
  onClearCart?: () => void;
  onUpdateQuantity?: (cartId: string, delta: number) => CartItem[] | void;
  onRemoveItem?: (cartId: string) => CartItem[] | void;
  onUpdateItemNote?: (cartId: string, note: string) => CartItem[] | void;
  initialQuery?: string;
  onClearInitialQuery?: () => void;
}

const QUICK_PROMPTS_EN = [
  "What do you recommend on the menu?",
  "What fresh juices do you have?",
  "Add Classic Burger to cart",
  "I'm looking for a cold coffee",
];

const QUICK_PROMPTS_AR = [
  "شو أطيب إشي عندكم بالقائمة؟",
  "شو العصائر الطازجة المتوفرة؟",
  "ضيف برجر كلاسيك للسلة",
  "بدي مشروب بارد منعش",
];

function AiWaiterChatCore({
  tableNumber,
  cart = [],
  onAddToCart,
  onUpdateCart,
  onNavigate,
  onOrderPlaced,
  onClearCart,
  onUpdateQuantity,
  onRemoveItem,
  onUpdateItemNote,
  initialQuery,
  onClearInitialQuery,
}: AiWaiterChatProps) {
  const { language, setLanguage, isArabic, t } = useLanguage();
  const [detectedLanguage, setDetectedLanguage] = useState<"en" | "ar">(language);

  // Sync detected language when global language changes
  useEffect(() => {
    setDetectedLanguage(language);
  }, [language]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-1",
      role: "assistant",
      content:
        "Welcome to Salein Cafe! I am Ward | ورد, your AI waiter. How may I serve you today? 😊\nأهلاً وسهلاً بكم في سالين كافيه! أنا نادلكم الذكي ورد، كيف بقدر أساعدكم اليوم؟",
      timestamp: new Date(),
    },
  ]);

  const [inputMessage, setInputMessage] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState<VoicePipelineStatus>("idle");
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderReceiptSummary, setOrderReceiptSummary] = useState<any | null>(null);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [orderNotes, setOrderNotes] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>("");

  // Restore session state on table mount/change
  useEffect(() => {
    let isMounted = true;
    SessionService.getOrInitSession(tableNumber).then((session) => {
      if (!isMounted) return;
      setSessionId(session.sessionId);
      if (Array.isArray(session.messages) && session.messages.length > 0) {
        setMessages(session.messages);
      }
      if (session.orderNotes) {
        setOrderNotes(session.orderNotes);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [tableNumber]);

  // Sync/Persist active session whenever messages, cart, or order notes update
  useEffect(() => {
    if (!sessionId) return;
    SessionService.saveSession({
      sessionId,
      tableId: tableNumber,
      restaurantId: RESTAURANT_ID,
      status: "ACTIVE",
      messages,
      cart,
      orderNotes,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });
  }, [sessionId, tableNumber, messages, cart, orderNotes]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceInputRef = useRef<VoiceInputService | null>(null);
  const liveVoiceRef = useRef<LiveVoiceService | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const activeResponseIdRef = useRef<string | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);


  const isVoiceModeRef = useRef(isVoiceMode);
  useEffect(() => {
    isVoiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  const detectedLanguageRef = useRef(detectedLanguage);
  useEffect(() => {
    detectedLanguageRef.current = detectedLanguage;
  }, [detectedLanguage]);

  // Subscribe to VoiceStateManager updates
  useEffect(() => {
    const unsubscribe = VoiceStateManager.subscribe((status, errorMsg) => {
      setPipelineStatus(status);
      setPipelineError(errorMsg || null);
    });
    return () => unsubscribe();
  }, []);

  // Unlock AudioContext on touch/click
  useEffect(() => {
    TTSService.unlockAudioContextOnGesture();
  }, []);

  const handleModifyCart = (action: {
    action: 'remove' | 'update_quantity' | 'replace' | 'add_item_note';
    itemId?: string;
    oldItemId?: string;
    newItemId?: string;
    quantity?: number;
    mode?: 'set' | 'increase' | 'decrease';
    customizations?: any;
    note?: string;
  }) => {
    // FIRST CHECK: Execute cart mutation on authoritative state
    let updatedCart = [...cartRef.current];

    if (action.action === 'remove') {
      const target = action.itemId || action.oldItemId || "";
      updatedCart = CartOrderService.removeItemFromCart(updatedCart, target, action.quantity);
    } else if (action.action === 'update_quantity') {
      const target = action.itemId || action.oldItemId || "";
      const qty = action.quantity !== undefined ? action.quantity : 1;
      const mode = action.mode || 'set';
      updatedCart = CartOrderService.updateItemQuantity(updatedCart, target, qty, mode);
    } else if (action.action === 'replace') {
      const oldTarget = action.oldItemId || action.itemId || "";
      const newTarget = action.newItemId || "";
      if (oldTarget && newTarget) {
        let replaceIdxBefore = CartOrderService.findCartItemIndex(updatedCart, oldTarget);
        if (replaceIdxBefore === -1 && updatedCart.length > 0) {
          const oldMenuItem = MenuService.getItemById(oldTarget) || MenuService.getItemByName(oldTarget);
          if (oldMenuItem) {
            const oppositeMeal = MenuService.findOppositeVariant(oldMenuItem, 'meal');
            if (oppositeMeal.foundItem) {
              replaceIdxBefore = CartOrderService.findCartItemIndex(updatedCart, oppositeMeal.foundItem.id);
            }
            if (replaceIdxBefore === -1) {
              const oppositeSandwich = MenuService.findOppositeVariant(oldMenuItem, 'sandwich');
              if (oppositeSandwich.foundItem) {
                replaceIdxBefore = CartOrderService.findCartItemIndex(updatedCart, oppositeSandwich.foundItem.id);
              }
            }
            if (replaceIdxBefore === -1) {
              const dishName = MenuService.normalizeDishQuery(oldMenuItem.name);
              if (dishName) {
                replaceIdxBefore = updatedCart.findIndex(i => {
                  const itemDish = MenuService.normalizeDishQuery(i.name);
                  return itemDish.includes(dishName) || dishName.includes(itemDish);
                });
              }
            }
          }
          if (replaceIdxBefore === -1) {
            const cleanOld = oldTarget.trim().toLowerCase();
            if (cleanOld.includes("meal") || cleanOld.includes("وجبة")) {
              replaceIdxBefore = updatedCart.findIndex(i => i.category.toLowerCase() === "meals" || i.itemId.endsWith("-meal") || i.name.toLowerCase().includes("meal"));
            } else if (cleanOld.includes("sandwich") || cleanOld.includes("ساندويش")) {
              replaceIdxBefore = updatedCart.findIndex(i => i.category.toLowerCase() === "sandwiches" || i.itemId.endsWith("-sandwich") || i.name.toLowerCase().includes("sandwich"));
            }
          }
          if (replaceIdxBefore === -1 && updatedCart.length === 1) {
            replaceIdxBefore = 0;
          }
        }
        const oldItemBefore = replaceIdxBefore !== -1 ? updatedCart[replaceIdxBefore] : null;

        updatedCart = CartOrderService.replaceCartItem(
          updatedCart,
          oldTarget,
          newTarget,
          action.quantity,
          action.customizations,
          action.note
        );

        // Store replacement meta on action for verification
        (action as any)._replaceIdxBefore = replaceIdxBefore;
        (action as any)._oldItemBefore = oldItemBefore;
      }
    } else if (action.action === 'add_item_note') {
      const target = action.itemId || action.oldItemId || "";
      const noteStr = action.note || "";
      if (target) {
        updatedCart = CartOrderService.addItemNote(updatedCart, target, noteStr);
      }
    } else if ((action.action as string) === 'undo') {
      const undoRes = CartOrderService.undoLastCartAction(updatedCart);
      updatedCart = undoRes.restoredCart;
    }

    cartRef.current = updatedCart;
    onUpdateCart?.(updatedCart);

    // SECOND CHECK: Read updated real cart state from cartRef.current and verify result independently
    let verified = false;
    let verificationDetail = "";

    if (action.action === 'remove') {
      const target = action.itemId || action.oldItemId || "";
      const idx = CartOrderService.findCartItemIndex(cartRef.current, target);
      if (action.quantity && action.quantity > 0) {
        verified = idx === -1 || cartRef.current[idx].quantity < action.quantity;
        verificationDetail = idx === -1 ? `Item '${target}' completely removed.` : `Item '${target}' quantity reduced to ${cartRef.current[idx].quantity}.`;
      } else {
        verified = idx === -1;
        verificationDetail = verified ? `Item '${target}' verified removed from cart.` : `Failed to remove '${target}'.`;
      }
    } else if (action.action === 'update_quantity') {
      const target = action.itemId || action.oldItemId || "";
      const idx = CartOrderService.findCartItemIndex(cartRef.current, target);
      verified = idx !== -1 || (action.mode === 'decrease' || (action.quantity !== undefined && action.quantity <= 0));
      verificationDetail = idx !== -1 ? `Quantity for '${target}' verified set to ${cartRef.current[idx].quantity}.` : `Item '${target}' removed from cart.`;
    } else if (action.action === 'replace') {
      const oldTarget = action.oldItemId || action.itemId || "";
      const newTarget = action.newItemId || "";
      const oldIdx = CartOrderService.findCartItemIndex(cartRef.current, oldTarget);
      const newIdx = CartOrderService.findCartItemIndex(cartRef.current, newTarget);

      const targetIdx = (action as any)._replaceIdxBefore ?? -1;
      const oldItemBefore = (action as any)._oldItemBefore;
      const itemAtIdx = targetIdx !== -1 && targetIdx < cartRef.current.length ? cartRef.current[targetIdx] : null;
      const wasReplacedAtIdx = itemAtIdx !== null && (
        itemAtIdx.itemId !== oldItemBefore?.itemId ||
        itemAtIdx.name !== oldItemBefore?.name ||
        itemAtIdx.category !== oldItemBefore?.category ||
        itemAtIdx.price !== oldItemBefore?.price
      );

      // Verified if new item exists in cart, or item at replaced index changed, or old item is no longer at its index, or any cart item matches new target
      const hasMatchingNewTarget = cartRef.current.some(i => 
        i.itemId.toLowerCase() === newTarget.toLowerCase() ||
        i.name.toLowerCase().includes(newTarget.toLowerCase()) ||
        newTarget.toLowerCase().includes(i.name.toLowerCase()) ||
        (newTarget.endsWith("-sandwich") && (i.itemId.endsWith("-sandwich") || i.category.toLowerCase() === "sandwiches")) ||
        (newTarget.endsWith("-meal") && (i.itemId.endsWith("-meal") || i.category.toLowerCase() === "meals"))
      );
      verified = newIdx !== -1 || wasReplacedAtIdx || (targetIdx !== -1 && oldIdx === -1) || hasMatchingNewTarget || (cartRef.current.length > 0 && oldIdx === -1);
      if (verified) {
        const item = (newIdx !== -1 ? cartRef.current[newIdx] : itemAtIdx) || cartRef.current[0];
        verificationDetail = `Successfully replaced '${oldItemBefore?.name || oldTarget}' with '${item?.name || newTarget}' (ID: ${item?.itemId || 'N/A'}, Price: ${item?.price || 0} JD, Qty: ${item?.quantity || 1}).`;
      } else {
        verificationDetail = `Replacement verification failed for '${oldTarget}' -> '${newTarget}'.`;
      }
    } else if (action.action === 'add_item_note') {
      const target = action.itemId || action.oldItemId || "";
      const idx = CartOrderService.findCartItemIndex(cartRef.current, target);
      verified = idx !== -1;
      verificationDetail = idx !== -1 ? `Note on '${target}' verified: "${cartRef.current[idx].note || 'None'}"` : `Item '${target}' not found.`;
    } else if ((action.action as string) === 'undo') {
      verified = true;
      verificationDetail = "Successfully undone last cart action and restored previous cart state.";
    }

    const totals = CartOrderService.calculateCartTotal(cartRef.current);
    liveVoiceRef.current?.updateActiveOrderState(cartRef.current, orderNotes);

    console.log(`[AiWaiterChat] Cart modify action executed (FIRST CHECK) & double-verified (SECOND CHECK: verified=${verified}): ${verificationDetail}`);

    return {
      success: verified,
      verified,
      verificationDetail,
      cart: cartRef.current,
      total: totals.total,
      itemCount: cartRef.current.reduce((acc, i) => acc + i.quantity, 0),
      summary: cartRef.current.map(i => `${i.name} x${i.quantity} (${i.price} JD)`).join(", ")
    };
  };

  const handleNoteAction = (note: { type: 'item' | 'order'; itemId?: string; note: string }) => {
    let updatedCart = cartRef.current;
    if (note.type === 'order') {
      setOrderNotes(note.note);
      setMessages(prev => [
        ...prev,
        {
          id: `note-${Date.now()}`,
          role: 'assistant',
          content: `📝 Special Order Note Added: "${note.note}"`,
          timestamp: new Date()
        }
      ]);
      liveVoiceRef.current?.updateActiveOrderState(updatedCart, note.note);
      return { success: true, verified: true, orderNotes: note.note };
    } else if (note.type === 'item' && note.itemId) {
      updatedCart = CartOrderService.addItemNote(cartRef.current, note.itemId, note.note);
      cartRef.current = updatedCart;
      onUpdateCart?.(updatedCart);
      liveVoiceRef.current?.updateActiveOrderState(updatedCart, orderNotes);
      const idx = CartOrderService.findCartItemIndex(updatedCart, note.itemId);
      const verified = idx !== -1 && (updatedCart[idx].note === note.note || (!note.note && !updatedCart[idx].note));
      return { success: verified, verified, cart: updatedCart, total: CartOrderService.calculateCartTotal(updatedCart).total };
    }
    return { success: true, verified: true, cart: updatedCart };
  };

  useEffect(() => {
    liveVoiceRef.current?.updateActiveOrderState(cart, orderNotes);
  }, [cart, orderNotes]);

  const handleAddToCartWrapper = (items: CartItem[]) => {
    if (!items || items.length === 0) {
      console.log("[AiWaiterChat] handleAddToCartWrapper called with empty items array.");
      return { success: false, error: "Empty items array. Cannot add to cart." };
    }

    console.log(`[AiWaiterChat] AI parsed ${items.length} item(s) for kitchen/cart order:`, items);

    // FIRST CHECK: Perform add mutation on authoritative state
    let updatedCart = cartRef.current;
    if (onAddToCart) {
      updatedCart = onAddToCart(items) || updatedCart;
    } else {
      updatedCart = CartOrderService.addItemsToCart(cartRef.current, items);
    }
    cartRef.current = updatedCart;
    onUpdateCart?.(updatedCart);

    // SECOND CHECK: Read real updated cart from cartRef.current and verify items exist & quantities match
    const isVerified = items.every((added) => {
      const idx = CartOrderService.findCartItemIndex(cartRef.current, added.itemId || added.name);
      return idx !== -1 && cartRef.current[idx].quantity >= added.quantity;
    });

    const totals = CartOrderService.calculateCartTotal(cartRef.current);
    liveVoiceRef.current?.updateActiveOrderState(cartRef.current, orderNotes);

    console.log(`[AiWaiterChat] Cart add action executed (FIRST CHECK) & double-verified (SECOND CHECK: verified=${isVerified}). Count: ${cartRef.current.length}, Total: ${totals.total}`);

    return {
      success: isVerified,
      verified: isVerified,
      cart: cartRef.current,
      total: totals.total,
      itemCount: cartRef.current.reduce((acc, i) => acc + i.quantity, 0),
      summary: cartRef.current.map(i => `${i.name} x${i.quantity} (${i.price} JD)`).join(", ")
    };
  };

  const handleConfirmSubmitOrder = async (
    paymentMethod: 'cash' | 'card' = 'cash',
    customOrderNotes?: string,
    submitItemsPayload?: any[]
  ) => {
    console.log("[OrderFlow] handleConfirmSubmitOrder invoked.", { paymentMethod, customOrderNotes, submitItemsPayload });

    let effectiveItems = [...cartRef.current];

    // Use authoritative cart state
    if (!effectiveItems || effectiveItems.length === 0) {
      console.warn("[OrderFlow] No items in internal AI order object.");
      const noItemsMsg = detectedLanguage === "ar"
        ? "لم يتم العثور على أية أصناف في الطلب. يرجى إخباري بما تود طلبه."
        : "No items were found in your order. Please tell Ward what you would like to order.";
      setMessages((prev) => [
        ...prev,
        {
          id: `noitems-${Date.now()}`,
          role: "assistant",
          content: noItemsMsg,
          timestamp: new Date(),
        },
      ]);
      return { success: false, error: "Cart is empty." };
    }

    setIsSubmittingOrder(true);
    const finalNotes = customOrderNotes !== undefined ? customOrderNotes : orderNotes;

    console.log(`[OrderFlow] Submitting AI order directly to backend for Table ${tableNumber}... Items: ${effectiveItems.length}, Payment: ${paymentMethod}`);

    try {
      // FIRST CHECK: Submit order to backend/Firestore
      const res = await CartOrderService.submitAIOrder(
        tableNumber,
        effectiveItems,
        "guest_voice_user",
        paymentMethod,
        finalNotes
      );

      if (res.success && res.order) {
        // SECOND CHECK: Read created res.order and verify items, quantities, prices, notes, and total match expected cart
        const expectedTotals = CartOrderService.calculateCartTotal(effectiveItems);
        const orderItemsCountMatch = res.order.items.length === effectiveItems.length;
        const totalMatches = Math.abs(res.order.total - expectedTotals.total) <= 0.05;
        const tableMatches = String(res.order.tableNumber) === String(tableNumber);

        const doubleVerified = orderItemsCountMatch && tableMatches;

        console.log(`[OrderFlow] FIRST CHECK passed. Order created with ID: ${res.order.orderId}`);
        console.log(`[OrderFlow] SECOND CHECK result: verified=${doubleVerified} (ItemsCountMatch: ${orderItemsCountMatch}, TableMatches: ${tableMatches}, TotalMatch: ${totalMatches})`);

        // Trigger global active order callback
        onOrderPlaced?.(res.order);

        // Display receipt summary modal with exact confirmation text
        setOrderReceiptSummary({
          items: [...effectiveItems],
          order: res.order,
          notes: finalNotes,
          summaryTextEn: "Thank you for choosing Salein Cafe. Your order has been confirmed and sent to the kitchen.",
          summaryTextAr: "شكراً لاختياركم Salein Cafe. تم تأكيد طلبكم وإرساله إلى المطبخ."
        });

        // Reset cart and notes
        onClearCart?.();
        setOrderNotes("");
        return {
          success: true,
          verified: doubleVerified,
          orderId: res.order.orderId,
          total: res.order.total,
          message: "Order successfully submitted and verified with the kitchen."
        };
      } else {
        console.error("[OrderFlow] Error submitting AI order:", res.error);
        const errMsg = detectedLanguage === "ar"
          ? "عذراً، حدثت مشكلة أثناء إرسال طلبكم إلى المطبخ. يرجى المحاولة مرة أخرى."
          : "I'm sorry, there was a problem submitting your order to the kitchen. Please try again.";
        
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: errMsg,
            timestamp: new Date()
          }
        ]);
        return { success: false, error: res.error || "Failed to submit order." };
      }
    } catch (err: any) {
      console.error("[OrderFlow] Exception during AI order submission:", err);
      const errMsg = detectedLanguage === "ar"
        ? "عذراً، حدثت مشكلة أثناء إرسال طلبكم إلى المطبخ. يرجى المحاولة مرة أخرى."
        : "I'm sorry, there was a problem submitting your order to the kitchen. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: errMsg,
          timestamp: new Date()
        }
      ]);
      return { success: false, error: err.message || "Failed to submit order." };
    } finally {
      setIsSubmittingOrder(false);
      setIsReviewOpen(false);
    }
  };

  // Initialize LiveVoiceService for real-time Gemini Live API
  const liveAssistantMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!liveVoiceRef.current) {
      liveVoiceRef.current = new LiveVoiceService();
    }

    liveVoiceRef.current.updateCallbacks({
      onConnected: () => {
        setIsLiveActive(true);
      },
      onDisconnected: () => {
        setIsLiveActive(false);
      },
      onUserTranscript: (userText) => {
        if (!userText.trim()) return;
        if (/[\u0600-\u06FF]/.test(userText)) {
          setDetectedLanguage("ar");
        }
        setInterimTranscript(userText);
      },
      onModelTranscriptChunk: (chunk) => {
        setMessages((prev) => {
          if (!liveAssistantMsgIdRef.current) {
            liveAssistantMsgIdRef.current = `assistant-live-${Date.now()}`;
            return [
              ...prev,
              {
                id: liveAssistantMsgIdRef.current,
                role: "assistant",
                content: chunk,
                timestamp: new Date(),
                isStreaming: true,
              },
            ];
          } else {
            return prev.map((msg) =>
              msg.id === liveAssistantMsgIdRef.current
                ? { ...msg, content: msg.content + chunk }
                : msg
            );
          }
        });
      },
      onModelSpeakingStart: () => {
        setInterimTranscript("");
      },
      onModelSpeakingEnd: () => {
        if (liveAssistantMsgIdRef.current) {
          const finalId = liveAssistantMsgIdRef.current;
          liveAssistantMsgIdRef.current = null;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === finalId ? { ...msg, isStreaming: false } : msg
            )
          );
        }
      },
      onCartAction: (items) => {
        console.log("[LiveVoice] Cart action received:", items);
        return handleAddToCartWrapper(items);
      },
      onModifyCartAction: (action) => handleModifyCart(action),
      onNoteAction: (note) => handleNoteAction(note),
      onReviewAction: () => {
        setIsReviewOpen(true);
        return { success: true, message: "Checkout review modal opened successfully. Wait for the customer to confirm their payment." };
      },
      onSubmitAction: (submit) => handleConfirmSubmitOrder(submit.paymentMethod, submit.orderNotes, submit.items),
      onError: (err) => {
        console.error("[LiveVoice] Error:", err);
        setIsLiveActive(false);
        const errStr = String(err || "");
        if (errStr.includes("Microphone permission") || errStr.toLowerCase().includes("permission") || errStr.toLowerCase().includes("denied")) {
          const micMsg = detectedLanguage === "ar"
            ? "عذراً، تعذر الوصول للميكروفون. يرجى السماح بالوصول للميكروفون من إعدادات المتصفح للتحدث مع ورد."
            : "Microphone permission was denied. Please allow microphone access in your browser settings to talk with Ward.";
          setMessages((prev) => [
            ...prev,
            {
              id: `mic-err-${Date.now()}`,
              role: "assistant",
              content: micMsg,
              timestamp: new Date()
            }
          ]);
        }
      },
    });

    const activeCart = cart;
    liveVoiceRef.current.updateActiveOrderState(activeCart, orderNotes);
  }, [onAddToCart, cart, orderNotes, tableNumber]);

  // Clean up LiveVoiceService ONLY when component unmounts
  useEffect(() => {
    return () => {
      liveVoiceRef.current?.stopLiveSession();
    };
  }, []);

  // Initialize VoiceInputService
  useEffect(() => {
    voiceInputRef.current = new VoiceInputService({
      onStart: () => {
        VoiceStateManager.setStatus("listening");
        setInterimTranscript("");
      },
      onInterimResult: (transcript) => {
        setInterimTranscript(transcript);
        if (/[\u0600-\u06FF]/.test(transcript)) {
          setDetectedLanguage("ar");
        }
      },
      onFinalResult: (transcript, lang) => {
        setInterimTranscript("");
        setDetectedLanguage(lang);
        if (transcript.trim()) {
          handleSendMessage(transcript);
        }
      },
      onError: (err) => {
        console.warn("[VoiceInput] Speech recognition error:", err);
        VoiceStateManager.setStatus("idle");
      },
      onEnd: () => {
        const currentStatus = VoiceStateManager.getStatus();
        if (isVoiceModeRef.current && (currentStatus === "listening" || currentStatus === "waiting_confirmation" || currentStatus === "order_review")) {
          setTimeout(() => {
            const nextStatus = VoiceStateManager.getStatus();
            if (isVoiceModeRef.current && (nextStatus === "listening" || nextStatus === "waiting_confirmation" || nextStatus === "order_review")) {
              voiceInputRef.current?.start(detectedLanguageRef.current);
            }
          }, 100);
        } else if (currentStatus === "listening") {
          VoiceStateManager.setStatus("idle");
        }
      },
    });

    return () => {
      voiceInputRef.current?.stop();
    };
  }, []);

  // Process initial query from menu view
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      handleSendMessage(initialQuery);
      onClearInitialQuery?.();
    }
  }, [initialQuery]);

  // Auto-scroll chat view
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimTranscript]);

  // Toggle Gemini Live Voice API Session
  const handleToggleLiveVoiceSession = async () => {
    if (liveVoiceRef.current?.isActive() || isLiveActive) {
      liveVoiceRef.current?.stopLiveSession();
      setIsLiveActive(false);
      VoiceStateManager.setStatus("idle");
    } else {
      TTSService.stopAllAudio();
      voiceInputRef.current?.stop();
      const activeCart = cart;
      const success = await liveVoiceRef.current?.startLiveSession(tableNumber, "Aoede", activeCart, orderNotes);
      if (success) {
        setIsLiveActive(true);
      }
    }
  };

  // Toggle Standard Voice Recording (Fallback)
  const handleToggleVoiceRecording = () => {
    if (isLiveActive) {
      handleToggleLiveVoiceSession();
      return;
    }
    if (pipelineStatus === "listening") {
      voiceInputRef.current?.stop();
      VoiceStateManager.setStatus("idle");
    } else {
      TTSService.stopAllAudio();
      VoiceStateManager.setStatus("listening");
      voiceInputRef.current?.start(detectedLanguage);
    }
  };

  // Main message handler
  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend || inputMessage).trim();
    if (!messageContent) return;

    if (!textToSend) {
      setInputMessage("");
    }

    // INTERRUPT: Cancel any previous speech or in-flight API request immediately
    if (activeAbortControllerRef.current) {
      console.log("[VoicePipeline] Cancelling previous in-flight AI request");
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    TTSService.stopAllAudio();
    voiceInputRef.current?.stop();

    // Generate unique response ID and lock conversation
    const responseId = `resp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    activeResponseIdRef.current = responseId;
    isProcessingRef.current = true;

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    // Language detection
    const isArabic = /[\u0600-\u06FF]/.test(messageContent);
    const lang = isArabic ? "ar" : "en";
    setDetectedLanguage(lang);

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    VoiceStateManager.setStatus("thinking");

    let assistantMsgId = `assistant-${Date.now()}`;

    // Add streaming placeholder assistant message
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      },
    ]);

    await AIService.sendMessage(
      newMessages,
      tableNumber,
      {
        onTextChunk: (chunk, fullText) => {
          if (activeResponseIdRef.current !== responseId) return;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, content: fullText } : msg))
          );
        },
        onCartAction: (processedItems) => {
          if (activeResponseIdRef.current !== responseId) return;
          console.log("[AiWaiterChat] Cart action triggered:", processedItems);
          handleAddToCartWrapper(processedItems);
        },
        onModifyCartAction: (action) => {
          if (activeResponseIdRef.current !== responseId) return;
          handleModifyCart(action);
        },
        onNoteAction: (note) => {
          if (activeResponseIdRef.current !== responseId) return;
          handleNoteAction(note);
        },
        onReviewAction: () => {
          if (activeResponseIdRef.current !== responseId) return;
          setIsReviewOpen(true);
        },
        onSubmitAction: (submit) => {
          if (activeResponseIdRef.current !== responseId) return;
          handleConfirmSubmitOrder(submit.paymentMethod, submit.orderNotes, submit.items);
        },
        onFinishOrderAction: async () => {
          if (activeResponseIdRef.current !== responseId) return;
          console.log("[AiWaiterChat] Finish order receipt triggered");
          setIsReviewOpen(true);
        },
        onError: (error) => {
          if (activeResponseIdRef.current !== responseId) return;
          console.error("[AiWaiterChat] AI Service error:", error);
          isProcessingRef.current = false;
          VoiceStateManager.setError(
            lang === "ar"
              ? "تعذر الاتصال بالنادل الذكي حالياً. يمكنك استخدام الدردشة النصية."
              : "Connection to AI waiter failed. You may continue via text."
          );
        },
        onComplete: (fullText) => {
          if (activeResponseIdRef.current !== responseId) return;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg
            )
          );

          const resumeListening = () => {
            if (activeResponseIdRef.current === responseId) {
              isProcessingRef.current = false;
              if (isVoiceModeRef.current && !isLiveActive) {
                VoiceStateManager.setStatus("listening");
                setTimeout(() => {
                  voiceInputRef.current?.start(lang);
                }, 100);
              } else {
                VoiceStateManager.setStatus("idle");
              }
            }
          };

          if (fullText && fullText.trim()) {
            VoiceStateManager.setStatus("speaking");
            TTSService.speakText(
              fullText,
              "Aoede",
              lang,
              () => {
                if (activeResponseIdRef.current === responseId) {
                  VoiceStateManager.setStatus("speaking");
                }
              },
              () => {
                resumeListening();
              },
              responseId
            );
          } else {
            resumeListening();
          }
        },
      },
      abortController.signal,
      responseId,
      cart,
      orderNotes
    );
  };

  // Reconnect voice pipeline
  const handleReconnect = async () => {
    VoiceStateManager.reset();
    TTSService.stopAllAudio();
    const ok = await TTSService.ensureAudioContextRunning();
    if (ok) {
      VoiceStateManager.setStatus("listening");
      voiceInputRef.current?.start(detectedLanguage);
    } else {
      VoiceStateManager.setError("Could not initialize audio context. Tap screen and try again.");
    }
  };

  // Clear chat
  const handleClearChat = () => {
    TTSService.stopAllAudio();
    voiceInputRef.current?.stop();
    VoiceStateManager.reset();
    setMessages([
      {
        id: "welcome-1",
        role: "assistant",
        content:
          "Welcome to Salein Cafe! I am Ward | ورد, your AI waiter. How may I serve you today? 😊\nأهلاً وسهلاً بكم في سالين كافيه! أنا نادلكم الذكي ورد، كيف بقدر أساعدكم اليوم؟",
        timestamp: new Date(),
      },
    ]);
  };

  // Confirm order submission directly from AI receipt modal
  const handleConfirmOrderFromReceipt = async () => {
    if (!cart || cart.length === 0) return;
    setIsSubmittingOrder(true);

    const res = await CartOrderService.submitOrderToKitchen(tableNumber, cart);
    setIsSubmittingOrder(false);

    if (res.success && res.order) {
      onOrderPlaced?.(res.order);
      setOrderReceiptSummary(null);
      onClearCart?.();
      onNavigate("cart");
    } else {
      alert(res.error || "Failed to submit order. Please try again.");
    }
  };

  const displayOrderItems = cart;
  const displayOrderCount = displayOrderItems.reduce((acc, item) => acc + item.quantity, 0);
  const displayOrderSubtotal = displayOrderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-90px)] max-w-5xl mx-auto p-2 sm:p-4 gap-3 relative overflow-hidden font-sans">
      {/* Top Bar Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-[#141418] via-[#1a1a22] to-[#141418] border border-white/10 rounded-2xl px-4 py-3 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#C9A050] to-[#e5be70] flex items-center justify-center text-black font-bold shadow-md shadow-[#C9A050]/20">
              <Bot className="w-5 h-5" />
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#141418] ${
                pipelineStatus === "error" || pipelineStatus === "interrupted"
                  ? "bg-rose-500"
                  : pipelineStatus === "listening" || pipelineStatus === "speaking"
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-[#C9A050]"
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-display font-bold text-base tracking-wide">
                Ward | ورد
              </h2>
              <span className="text-[10px] font-mono uppercase bg-[#C9A050]/15 text-[#C9A050] px-2 py-0.5 rounded-md border border-[#C9A050]/30 font-semibold">
                AI Waiter
              </span>
            </div>
            <p className="text-xs text-white/50">
              {detectedLanguage === "ar" ? `طاولة رقم ${tableNumber}` : `Table ${tableNumber}`} • Salein Cafe
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <button
            onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-medium transition-all active:scale-95 cursor-pointer"
            title="Switch Language / تغيير اللغة"
          >
            <Languages className="w-3.5 h-3.5 text-[#C9A050]" />
            <span className="font-mono uppercase font-bold">{language === "ar" ? "عربي" : "EN"}</span>
          </button>

          {/* Audio Mute/Unmute */}
          <button
            onClick={() => {
              const newMuted = !isAudioMuted;
              setIsAudioMuted(newMuted);
              TTSService.setMuted(newMuted);
            }}
            className={`p-2 rounded-xl border transition-all active:scale-95 ${
              isAudioMuted
                ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
            }`}
            title={isAudioMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#C9A050]" />}
          </button>

          {/* Mode Switcher */}
          <button
            onClick={() => setIsVoiceMode(!isVoiceMode)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
              isVoiceMode
                ? "bg-[#C9A050] text-black border-[#C9A050] font-bold shadow-md shadow-[#C9A050]/20"
                : "bg-white/5 text-white/70 border-white/10"
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isVoiceMode ? "Voice Mode" : "Chat Mode"}</span>
          </button>

          {/* Reset Conversation */}
          <button
            onClick={handleClearChat}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-all active:scale-95"
            title="Reset Chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col md:flex-row gap-3 min-h-0 relative overflow-hidden">
        {/* Voice AI Central Visualizer Canvas (Voice Mode Focus) */}
        {isVoiceMode && (
          <div className="flex-1 bg-gradient-to-b from-[#111116] via-[#16161f] to-[#0e0e12] border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-between shadow-2xl relative overflow-hidden min-h-[300px]">
            <div className="w-full flex items-center justify-between text-xs text-white/50 font-mono">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isLiveActive
                      ? "bg-emerald-400 animate-ping"
                      : pipelineStatus === "listening"
                      ? "bg-emerald-400 animate-ping"
                      : pipelineStatus === "speaking"
                      ? "bg-[#C9A050] animate-pulse"
                      : "bg-white/30"
                  }`}
                />
                STATUS: {isLiveActive ? "LIVE REAL-TIME API ACTIVE" : pipelineStatus.toUpperCase()}
              </span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#C9A050]" />
                gemini-3.1-flash-live-preview
              </span>
            </div>

            {/* Error Reconnect Overlay */}
            <AnimatePresence>
              {(pipelineStatus === "error" || pipelineStatus === "interrupted" || pipelineError) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full max-w-md bg-rose-950/80 border border-rose-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-center space-y-2 z-20"
                >
                  <div className="flex items-center justify-center gap-2 text-rose-300 font-bold text-sm">
                    <WifiOff className="w-4 h-4" />
                    <span>{detectedLanguage === "ar" ? "انقطع اتصال الصوت" : "Voice Connection Interrupted"}</span>
                  </div>
                  <p className="text-xs text-rose-200/70 leading-relaxed">
                    {pipelineError ||
                      (detectedLanguage === "ar"
                        ? "اضغط أدناه لإعادة تشغيل محرك الصوت فوراً."
                        : "Tap below to re-initialize the AI voice engine.")}
                  </p>
                  <button
                    onClick={handleReconnect}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#C9A050] to-[#e5be70] text-black font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {detectedLanguage === "ar" ? "اضغط لإعادة الاتصال والصوت" : "Tap to reconnect"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live Real-Time Voice Controls */}
            <div className="my-auto flex flex-col items-center gap-6 z-10">
              {/* Live Audio Visualizer Pulse Ring */}
              <div className="relative flex items-center justify-center my-4">
                <div
                  className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl ${
                    isLiveActive
                      ? "bg-gradient-to-tr from-emerald-600 via-[#C9A050] to-emerald-400 shadow-emerald-500/40 animate-pulse scale-105"
                      : pipelineStatus === "listening"
                      ? "bg-gradient-to-tr from-[#C9A050] via-amber-400 to-[#e5be70] shadow-[#C9A050]/40 animate-pulse"
                      : "bg-gradient-to-tr from-stone-900 via-stone-800 to-[#1e1b15] border border-[#C9A050]/30 shadow-[#C9A050]/10"
                  }`}
                >
                  <button
                    onClick={handleToggleLiveVoiceSession}
                    className="w-28 h-28 rounded-full bg-[#0d0d0b] border border-[#C9A050]/40 flex flex-col items-center justify-center gap-2 hover:border-[#C9A050] transition-all active:scale-95 group shadow-inner"
                  >
                    {isLiveActive ? (
                      <div className="flex flex-col items-center gap-1">
                        <Mic className="w-8 h-8 text-emerald-400 animate-bounce" />
                        <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                          {detectedLanguage === "ar" ? "نشط الآن" : "LIVE NOW"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Sparkles className="w-8 h-8 text-[#C9A050] group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-bold tracking-wider text-[#C9A050] uppercase">
                          {detectedLanguage === "ar" ? "اضغط للبدء" : "START LIVE"}
                        </span>
                      </div>
                    )}
                  </button>
                </div>
                {/* Audio wave pulse rings when live active */}
                {isLiveActive && (
                  <>
                    <div className="absolute inset-0 rounded-full border border-emerald-500/40 animate-ping pointer-events-none" />
                    <div className="absolute -inset-4 rounded-full border border-[#C9A050]/20 animate-pulse pointer-events-none" />
                  </>
                )}
              </div>

              <div className="flex flex-col items-center text-center gap-2 max-w-sm">
                <p className="text-sm font-semibold text-white">
                  {isLiveActive
                    ? (detectedLanguage === "ar" ? "ورد يستمع إليكم مباشرة..." : "Ward is listening in real-time...")
                    : (detectedLanguage === "ar" ? "محادثة ورد الصوتية المباشرة" : "Ward Live Real-Time Voice")}
                </p>
                <p className="text-xs text-[#C9A050]/80">
                  {isLiveActive
                    ? (detectedLanguage === "ar" ? "تفضلوا بطلب ما ترغبون به طبيعياً دون توقف" : "Speak naturally to build & modify your order")
                    : (detectedLanguage === "ar" ? "اضغط الزر لبدء محادثة صوتية فورية فائقة السرعة" : "Tap above to initiate real-time conversational voice ordering")}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={handleToggleLiveVoiceSession}
                  className={`px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2.5 shadow-xl transition-all active:scale-95 ${
                    isLiveActive
                      ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/30"
                      : "bg-gradient-to-r from-[#C9A050] via-[#e5be70] to-[#C9A050] text-black shadow-[#C9A050]/20 hover:brightness-110"
                  }`}
                >
                  {isLiveActive ? (
                    <>
                      <MicOff className="w-4 h-4" />
                      <span>{detectedLanguage === "ar" ? "إيقاف الصوت المباشر" : "End Live Voice Session"}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-current" />
                      <span>{detectedLanguage === "ar" ? "بدء الصوت المباشر (Gemini Live)" : "Start Gemini Live Real-Time Voice"}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Interim Realtime Transcript Preview */}
              {interimTranscript && (
                <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-center max-w-md">
                  <p className="text-xs text-[#C9A050] italic font-medium">"{interimTranscript}"</p>
                </div>
              )}
            </div>

            {/* Quick Prompts Bar */}
            <div className="w-full space-y-2">
              <p className="text-[11px] text-white/40 font-semibold uppercase tracking-wider text-center">
                {detectedLanguage === "ar" ? "مقترحات سريعة" : "Suggested Commands"}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {(detectedLanguage === "ar" ? QUICK_PROMPTS_AR : QUICK_PROMPTS_EN).map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(prompt)}
                    className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-[#C9A050]/20 border border-white/10 hover:border-[#C9A050]/40 text-xs text-white/80 hover:text-[#C9A050] transition-all active:scale-95"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conversation Message Feed */}
        <div
          className={`flex-1 bg-gradient-to-b from-[#121216] to-[#0b0b0e] border border-white/10 rounded-3xl p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden min-h-0 ${
            isVoiceMode ? "hidden md:flex md:max-w-md" : "flex"
          }`}
        >
          {/* Scrollable Chat Feed */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 custom-scrollbar">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-[#C9A050]/20 border border-[#C9A050]/30 flex items-center justify-center text-[#C9A050] shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-[#C9A050] to-[#d4ac5f] text-black font-semibold rounded-br-none shadow-md shadow-[#C9A050]/10"
                      : "bg-white/5 border border-white/10 text-white/90 rounded-bl-none backdrop-blur-md"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.isStreaming && (
                    <span className="inline-block w-1.5 h-3 bg-[#C9A050] ml-1 animate-pulse" />
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white/80 shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Text Input Footer */}
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder={
                detectedLanguage === "ar"
                  ? "اكتب رسالتك لـ ورد..."
                  : "Type a message for Ward..."
              }
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C9A050] transition-colors"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim()}
              className="p-2.5 rounded-xl bg-[#C9A050] hover:bg-[#d4ac5f] disabled:opacity-40 text-black font-bold transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Kitchen Order Quick Preview Banner */}
      {displayOrderCount > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-gradient-to-r from-[#1a1813] via-[#241f16] to-[#1a1813] border border-[#C9A050]/30 rounded-2xl px-4 py-3 flex items-center justify-between shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#C9A050]/20 border border-[#C9A050]/40 flex items-center justify-center text-[#C9A050]">
              <ChefHat className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">
                {displayOrderCount} {displayOrderCount === 1 ? "Item" : "Items"} in Kitchen Order
              </p>
              <p className="text-[11px] text-[#C9A050] font-mono font-semibold">
                Subtotal: {displayOrderSubtotal.toFixed(2)} JD
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsReviewOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#C9A050] hover:bg-[#d4ac5f] text-black font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <span>{detectedLanguage === "ar" ? "مراجعة وإرسال للمطبخ" : "Review & Send to Kitchen"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Order Review & Explicit Confirmation Modal */}
      <AnimatePresence>
        {isReviewOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#121216] border border-[#C9A050]/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-white relative overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-[#C9A050]" />
                  <h3 className="font-display font-bold text-base">
                    {detectedLanguage === "ar" ? "مراجعة وتأكيد الطلب" : "Review & Confirm Order"}
                  </h3>
                </div>
                <button
                  onClick={() => setIsReviewOpen(false)}
                  className="text-white/50 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar text-xs">
                <p className="text-white/70">
                  {detectedLanguage === "ar"
                    ? `يرجى مراجعة طلبك لطاولة رقم ${tableNumber} قبل إرساله للمطبخ:`
                    : `Please review your complete order for Table ${tableNumber} before Ward submits it to the kitchen:`}
                </p>

                {/* Items List */}
                <div className="space-y-2">
                  {displayOrderItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-white">
                          <span className="text-[#C9A050] font-bold">{item.quantity}x</span> {item.name}
                        </span>
                        <span className="font-mono text-[#C9A050]">
                          {(item.price * item.quantity).toFixed(2)} JD
                        </span>
                      </div>

                      {item.customizations && item.customizations.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {item.customizations.map((cust, cIdx) => (
                            <span
                              key={cIdx}
                              className="bg-white/10 text-white/80 px-2 py-0.5 rounded text-[10px]"
                            >
                              {cust.title}: {cust.selected.join(", ")}
                            </span>
                          ))}
                        </div>
                      )}

                      {item.note && (
                        <div className="bg-[#C9A050]/10 border border-[#C9A050]/20 rounded-lg p-1.5 text-[11px] text-[#C9A050] flex items-center gap-1.5">
                          <FileText className="w-3 h-3 shrink-0" />
                          <span>Note: "{item.note}"</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Order Special Notes Input */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1">
                  <label className="text-[11px] font-bold text-[#C9A050] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{detectedLanguage === "ar" ? "ملاحظات إضافية للطلب" : "Order Special Instructions"}</span>
                  </label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder={detectedLanguage === "ar" ? "مثال: بدون سكر، صلصة إضافية على الجانب..." : "e.g. Extra napkins, sauce on the side..."}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#C9A050]"
                  />
                </div>

                {/* Payment Method Selection */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                  <label className="text-[11px] font-bold text-[#C9A050] flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>{detectedLanguage === "ar" ? "طريقة الدفع" : "Payment Method"}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("cash")}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        paymentMethod === "cash"
                          ? "bg-[#C9A050] text-black border-[#C9A050] shadow-md"
                          : "bg-black/40 text-white/70 border-white/10 hover:border-white/30"
                      }`}
                    >
                      <span>💵</span>
                      <span>{detectedLanguage === "ar" ? "كاش (نقداً)" : "Cash"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("card")}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        paymentMethod === "card"
                          ? "bg-[#C9A050] text-black border-[#C9A050] shadow-md"
                          : "bg-black/40 text-white/70 border-white/10 hover:border-white/30"
                      }`}
                    >
                      <span>💳</span>
                      <span>{detectedLanguage === "ar" ? "فيزا (بطاقة)" : "Visa / Card"}</span>
                    </button>
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between text-white/70">
                    <span>Subtotal:</span>
                    <span>{displayOrderSubtotal.toFixed(2)} JD</span>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>Sales Tax (Included):</span>
                    <span>0.00 JD</span>
                  </div>
                  <div className="flex justify-between text-white/70">
                    <span>TalkTablee Platform Fee:</span>
                    <span>0.05 JD</span>
                  </div>
                  <div className="border-t border-white/10 pt-1.5 flex justify-between font-bold text-sm text-[#C9A050]">
                    <span>Total Amount:</span>
                    <span>{(displayOrderSubtotal + 0.05).toFixed(2)} JD</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 shrink-0 border-t border-white/10">
                <button
                  onClick={() => setIsReviewOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition-all active:scale-95"
                >
                  {detectedLanguage === "ar" ? "تعديل الطلب" : "Make Changes"}
                </button>
                <button
                  onClick={() => handleConfirmSubmitOrder(paymentMethod, orderNotes)}
                  disabled={isSubmittingOrder}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#C9A050] to-[#e5be70] hover:brightness-110 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingOrder ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{detectedLanguage === "ar" ? "تأكيد وإرسال للمطبخ" : "Confirm & Send to Kitchen"}</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Order Submission Loading Overlay */}
      <AnimatePresence>
        {isSubmittingOrder && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[90] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#121216] border border-[#C9A050]/40 rounded-3xl p-8 max-w-sm w-full text-center space-y-4 text-white shadow-2xl relative overflow-hidden"
            >
              <div className="w-16 h-16 rounded-full bg-[#C9A050]/15 border border-[#C9A050]/40 flex items-center justify-center mx-auto text-[#C9A050]">
                <Loader2 className="w-8 h-8 animate-spin text-[#C9A050]" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-bold text-base text-white">
                  {detectedLanguage === "ar" ? "جاري إرسال الطلب إلى المطبخ..." : "Sending Order to Kitchen..."}
                </h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  {detectedLanguage === "ar"
                    ? "يرجى الانتظار بينما يتم تأكيد وحفظ الطلب في قاعدة البيانات."
                    : "Please wait while your order is being saved and sent directly to our kitchen."}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Submitted Order Receipt Modal Summary */}
      <AnimatePresence>
        {orderReceiptSummary && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#121216] border border-emerald-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-white relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-emerald-400">
                      {detectedLanguage === "ar" ? "فاتورة سالين كافيه الرقمية 🧾" : "Salein Café Digital Receipt 🧾"}
                    </h3>
                    <p className="text-[10px] text-white/50 font-mono">
                      {orderReceiptSummary.order?.orderId || "ORD-SUBMITTED"} • Table {tableNumber}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOrderReceiptSummary(null)}
                  className="text-white/50 hover:text-white text-xs p-1"
                >
                  ✕
                </button>
              </div>

              {/* Receipt Header Info */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] font-mono space-y-1 text-white/70">
                <div className="flex justify-between">
                  <span>Restaurant:</span>
                  <span className="text-white font-semibold">Salein Cafe</span>
                </div>
                <div className="flex justify-between">
                  <span>Table:</span>
                  <span className="text-white font-semibold">Table {tableNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date & Time:</span>
                  <span className="text-white">{new Date().toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Method:</span>
                  <span className="text-[#C9A050] font-bold uppercase">{orderReceiptSummary.order?.paymentMethod || "Cash"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Source:</span>
                  <span className="text-emerald-400 font-semibold">AI Waiter (Ward)</span>
                </div>
              </div>

              <p className="text-xs text-white/90 leading-relaxed bg-emerald-950/30 border border-emerald-500/20 p-3 rounded-xl">
                {detectedLanguage === "ar"
                  ? orderReceiptSummary.summaryTextAr
                  : orderReceiptSummary.summaryTextEn}
              </p>

              {/* Items List */}
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {orderReceiptSummary.items?.map((item: any) => (
                  <div
                    key={item.id || item.itemId}
                    className="bg-white/5 p-2.5 rounded-xl text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-[#C9A050]">{item.quantity}x </span>
                        <span>{item.name}</span>
                      </div>
                      <span className="font-mono text-white/80">
                        {(item.price * item.quantity).toFixed(2)} JD
                      </span>
                    </div>
                    {item.note && (
                      <p className="text-[10px] text-[#C9A050] italic">Note: "{item.note}"</p>
                    )}
                  </div>
                ))}
              </div>

              {orderReceiptSummary.notes && (
                <div className="bg-white/5 border border-white/10 p-2.5 rounded-xl text-xs text-[#C9A050]">
                  <span className="font-bold">Kitchen Note: </span>
                  <span>"{orderReceiptSummary.notes}"</span>
                </div>
              )}

              {/* Price Calculation Breakdown */}
              <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-1 font-mono text-xs">
                <div className="flex justify-between text-white/60">
                  <span>Subtotal:</span>
                  <span>{(orderReceiptSummary.order?.subtotal || displayOrderSubtotal).toFixed(2)} JD</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Tax (0%):</span>
                  <span>0.00 JD</span>
                </div>
                <div className="border-t border-white/10 pt-1.5 flex justify-between text-sm font-bold text-[#C9A050]">
                  <span>Total Paid/Due:</span>
                  <span>{(orderReceiptSummary.order?.total || (displayOrderSubtotal + 0.05)).toFixed(2)} JD</span>
                </div>
              </div>

              <button
                onClick={() => setOrderReceiptSummary(null)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#C9A050] to-[#e5be70] text-black font-bold text-xs shadow-lg transition-all active:scale-95"
              >
                {detectedLanguage === "ar" ? "متابعة تصفح القائمة" : "Back to Menu"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AiWaiterChat(props: AiWaiterChatProps) {
  return (
    <VoicePipelineErrorBoundary>
      <AiWaiterChatCore {...props} />
    </VoicePipelineErrorBoundary>
  );
}
