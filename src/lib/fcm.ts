import { getMessaging, getToken, onMessage, isSupported, MessagePayload } from "firebase/messaging";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { app, db, handleFirestoreError, OperationType } from "./firebase";

let messagingInstancePromise: Promise<any> | null = null;

/**
 * Safely get Firebase Messaging instance asynchronously after checking browser support
 */
export async function getMessagingInstance() {
  if (typeof window === "undefined") return null;
  if (!messagingInstancePromise) {
    messagingInstancePromise = (async () => {
      try {
        const supported = await isSupported().catch(() => false);
        if (!supported) {
          console.warn("[FCM] Firebase Messaging is not supported in this browser environment.");
          return null;
        }
        return getMessaging(app);
      } catch (e) {
        console.warn("[FCM] Firebase Messaging initialization note:", e);
        return null;
      }
    })();
  }
  return messagingInstancePromise;
}

// Backwards compatibility export
export const messaging = null;

export interface FCMTokenRecord {
  token: string;
  userId: string;
  userEmail: string;
  role: "owner" | "admin" | "manager" | "waiter" | "staff" | "kitchen";
  updatedAt: Timestamp | Date;
  platform: string;
  userAgent: string;
}

/**
 * Register FCM Service Worker & Request Notification Permission
 */
export async function registerFcmAndGetToken(
  role: "owner" | "admin" | "manager" | "waiter" | "staff" | "kitchen" = "staff",
  userId?: string,
  userEmail?: string
): Promise<string | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
    console.warn("Push notifications are not supported in this browser environment.");
    return null;
  }

  try {
    const msg = await getMessagingInstance();
    if (!msg) {
      console.warn("[FCM] Messaging instance unavailable or unsupported in this environment.");
      return null;
    }

    // 1. Check Notification permission
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      console.warn("Notification permission was denied or dismissed by user.");
      return null;
    }

    // 2. Register or get existing service worker registration
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/"
    });

    await navigator.serviceWorker.ready;

    // 3. Request FCM token
    const currentToken = await getToken(msg, {
      serviceWorkerRegistration: registration
    });

    if (currentToken) {
      console.log("FCM Token generated successfully:", currentToken.substring(0, 15) + "...");

      // 4. Store token in Firestore under fcmTokens collection
      // Sanitize token string for document key
      const docKey = `token_${currentToken.replace(/[^a-zA-Z0-9]/g, "_").slice(-40)}`;
      const tokenDocRef = doc(db, "fcmTokens", docKey);

      const tokenData: FCMTokenRecord = {
        token: currentToken,
        userId: userId || "staff_device_" + Math.random().toString(36).substring(2, 8),
        userEmail: userEmail || "staff@talktablee.com",
        role: role,
        updatedAt: new Date(),
        platform: navigator.platform || "Web",
        userAgent: navigator.userAgent || "Browser"
      };

      try {
        await setDoc(tokenDocRef, tokenData, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `fcmTokens/${docKey}`);
      }

      return currentToken;
    } else {
      console.warn("No registration token available. Request permission to generate one.");
      return null;
    }
  } catch (err) {
    console.warn("Note when retrieving FCM token:", err);
    return null;
  }
}

/**
 * Listen for foreground FCM messages when website is active/focused
 */
export function setupForegroundMessageListener(callback: (payload: MessagePayload) => void) {
  let unsubscribe: (() => void) | null = null;

  getMessagingInstance().then((msg) => {
    if (!msg) return;
    try {
      unsubscribe = onMessage(msg, (payload) => {
        console.log("Foreground FCM message received:", payload);
        callback(payload);

        // Also display a native browser notification if allowed
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          const title = payload.notification?.title || payload.data?.title || "🔔 TalkTablee Alert";
          const options = {
            body: payload.notification?.body || payload.data?.body || "New event from customer.",
            icon: payload.notification?.icon || "/logo.svg",
            data: payload.data
          };
          new Notification(title, options);
        }
      });
    } catch (e) {
      console.warn("[FCM] Failed to attach onMessage listener:", e);
    }
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}

export interface PushPayload {
  type: "order" | "request";
  tableNumber: string;
  orderId?: string;
  requestId?: string;
  total?: number;
  requestType?: string;
  requestName?: string;
  restaurantName?: string;
}

/**
 * Helper to dispatch push notification via server endpoint
 */
export async function dispatchPushNotification(payload: PushPayload) {
  try {
    const response = await fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn("Failed to dispatch server push notification:", await response.text());
    } else {
      console.log("Push notification dispatched successfully.");
    }
  } catch (err) {
    console.error("Error sending push notification request:", err);
  }
}
