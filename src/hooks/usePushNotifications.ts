import { useState, useEffect, useCallback } from "react";
import { getToken, onMessage, MessagePayload } from "firebase/messaging";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { getMessagingInstance } from "../lib/fcm";

export interface DeviceTokenRecord {
  token: string;
  userId: string;
  userEmail?: string;
  role: string;
  updatedAt: Timestamp | Date;
  platform: string;
  userAgent: string;
}

export interface UsePushNotificationsOptions {
  isAuthenticated: boolean;
  role?: "owner" | "admin" | "manager" | "waiter" | "staff" | "kitchen";
  userId?: string;
  userEmail?: string;
  autoRequest?: boolean;
}

export function usePushNotifications({
  isAuthenticated,
  role = "staff",
  userId = "staff_user",
  userEmail = "staff@talktablee.com",
  autoRequest = true
}: UsePushNotificationsOptions) {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default"
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  let isIframe = false;
  if (typeof window !== "undefined") {
    try {
      isIframe = window.self !== window.top;
    } catch (e) {
      isIframe = true;
    }
  }

  /**
   * Save token to Firestore staff_devices and fcmTokens collections
   */
  const saveTokenToFirestore = useCallback(
    async (token: string) => {
      try {
        const sanitizedKey = `dev_${token.replace(/[^a-zA-Z0-9]/g, "_").slice(-40)}`;
        
        const deviceData: DeviceTokenRecord = {
          token,
          userId: userId || `staff_${role}`,
          userEmail: userEmail || "staff@talktablee.com",
          role: role || "staff",
          updatedAt: new Date(),
          platform: typeof navigator !== "undefined" ? navigator.platform || "Web" : "Web",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent || "Browser" : "Browser"
        };

        // Save under staff_devices as requested
        const staffDeviceRef = doc(db, "staff_devices", sanitizedKey);
        await setDoc(staffDeviceRef, deviceData, { merge: true });

        // Also save under fcmTokens for server FCM dispatcher fallback
        const fcmTokenRef = doc(db, "fcmTokens", sanitizedKey);
        await setDoc(fcmTokenRef, deviceData, { merge: true });

        console.log("[usePushNotifications] Saved FCM token to staff_devices & fcmTokens:", sanitizedKey);
      } catch (err: any) {
        console.error("[usePushNotifications] Error saving token to Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, "staff_devices");
      }
    },
    [userId, userEmail, role]
  );

  /**
   * Request push permission and fetch/store FCM device token
   */
  const requestPermission = useCallback(async (): Promise<string | null> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
      const msg = "Push notifications are not supported by this browser.";
      setError(msg);
      console.warn(msg);
      return null;
    }

    if (isIframe) {
      const msg = "Browser preview frames (iframes) block push notification permission. Please open the app in a new tab.";
      setError(msg);
      console.warn(msg);
    }

    setIsLoading(true);
    setError(null);

    try {
      let currentPerm = Notification.permission;
      if (currentPerm === "default") {
        try {
          currentPerm = await Notification.requestPermission();
        } catch (permErr: any) {
          console.warn("[usePushNotifications] Notification.requestPermission failed:", permErr);
          const msg = isIframe
            ? "Notifications cannot be prompted inside preview frame. Please open in a new tab."
            : "Notification permission request failed or was blocked by browser.";
          setError(msg);
          setIsLoading(false);
          return null;
        }
      }
      setPermission(currentPerm);

      if (currentPerm !== "granted") {
        const permErr = currentPerm === "denied"
          ? "Notification permission is blocked in your browser settings. Please click the lock icon in the URL bar to allow notifications."
          : "Notification permission was dismissed.";
        setError(permErr);
        setIsLoading(false);
        return null;
      }

      // Register FCM service worker
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
        scope: "/"
      });
      await navigator.serviceWorker.ready;

      const messaging = await getMessagingInstance();
      if (!messaging) {
        setError("Firebase Messaging is not supported or restricted in this browser environment.");
        setIsLoading(false);
        return null;
      }

      const token = await getToken(messaging, {
        serviceWorkerRegistration: registration
      });

      if (token) {
        setFcmToken(token);
        await saveTokenToFirestore(token);
        setIsLoading(false);
        return token;
      } else {
        setError("Failed to retrieve registration token.");
        setIsLoading(false);
        return null;
      }
    } catch (err: any) {
      console.error("[usePushNotifications] Error requesting push permission:", err);
      setError(err.message || "Failed to enable push notifications.");
      setIsLoading(false);
      return null;
    }
  }, [saveTokenToFirestore, isIframe]);

  // Handle automatic request upon staff authentication
  useEffect(() => {
    if (isAuthenticated && autoRequest) {
      requestPermission();
    }
  }, [isAuthenticated, autoRequest, requestPermission]);

  // Setup foreground messaging listener
  useEffect(() => {
    if (!isAuthenticated) return;

    let unsubscribe: (() => void) | null = null;
    getMessagingInstance().then((msg) => {
      if (!msg) return;
      try {
        unsubscribe = onMessage(msg, (payload: MessagePayload) => {
          console.log("[usePushNotifications] Received foreground push notification:", payload);
        });
      } catch (e) {
        console.warn("[usePushNotifications] Failed to register onMessage listener:", e);
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [isAuthenticated]);

  return {
    fcmToken,
    permission,
    requestPermission,
    isLoading,
    error,
    isIframe
  };
}
