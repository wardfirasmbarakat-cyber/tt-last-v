// Firebase Cloud Messaging & PWA Background Service Worker
/* eslint-disable no-undef */

// Give the service worker access to Firebase Messaging.
// Note: Using Firebase compat scripts inside service worker environment with try/catch fallback for Safari
try {
  importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

  // Firebase App Configuration from firebase-applet-config.json
  const firebaseConfig = {
    apiKey: "AIzaSyCuE2SfKbLts8YvbgpuyQyf7nv7CLZMeoc",
    authDomain: "starlit-producer-9nn32.firebaseapp.com",
    projectId: "starlit-producer-9nn32",
    storageBucket: "starlit-producer-9nn32.firebasestorage.app",
    messagingSenderId: "186751380976",
    appId: "1:186751380976:web:e5a672ecb973a27fd90135"
  };

  // Initialize the Firebase app in service worker safely if messaging is supported
  if (typeof firebase !== "undefined" && firebase.messaging && typeof firebase.messaging.isSupported === "function" && firebase.messaging.isSupported()) {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    // Handle background FCM push messages when app tab is CLOSED, MINIMIZED, or in BACKGROUND
    messaging.onBackgroundMessage((payload) => {
      console.log("[firebase-messaging-sw.js] Received background message:", payload);

      const notificationTitle = payload.notification?.title || payload.data?.title || "🔔 TalkTablee Staff Alert";
      const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || "New notification from customer.",
        icon: payload.notification?.icon || payload.data?.icon || "/logo.svg",
        badge: "/logo.svg",
        vibrate: [200, 100, 200, 100, 200],
        tag: payload.data?.tag || payload.data?.notificationId || `notif_${Date.now()}`,
        renotify: true,
        requireInteraction: true,
        data: {
          url: payload.data?.url || "/?tab=staff",
          orderId: payload.data?.orderId || null,
          requestId: payload.data?.requestId || null,
          type: payload.data?.type || "general"
        }
      };

      return self.registration.showNotification(notificationTitle, notificationOptions);
    });
  }
} catch (swErr) {
  console.warn("[firebase-messaging-sw.js] Compat scripts or messaging init note (Safari/Offline):", swErr);
}

// Generic Web Push event listener fallback
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const pushData = event.data.json();
    console.log("[firebase-messaging-sw.js] Received Web Push event:", pushData);

    const title = pushData.notification?.title || pushData.title || "🔔 TalkTablee Alert";
    const options = {
      body: pushData.notification?.body || pushData.body || "A new update is available.",
      icon: pushData.notification?.icon || pushData.icon || "/logo.svg",
      badge: "/logo.svg",
      vibrate: [200, 100, 200],
      tag: pushData.tag || `push_${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      data: pushData.data || { url: "/?tab=staff" }
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.warn("[firebase-messaging-sw.js] Raw text push fallback:", err);
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("🔔 TalkTablee Alert", {
        body: text,
        icon: "/logo.svg",
        data: { url: "/?tab=staff" }
      })
    );
  }
});

// Handle user clicking on a background notification
self.addEventListener("notificationclick", (event) => {
  console.log("[firebase-messaging-sw.js] Notification clicked:", event.notification);
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/?tab=staff";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // 1. If a tab is already open on our site, focus it and navigate
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          if (typeof client.navigate === "function") {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // 2. If no tab is open (website was closed), open a new tab/window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Service Worker Install & Activate
self.addEventListener("install", (event) => {
  console.log("[firebase-messaging-sw.js] Service Worker installed.");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[firebase-messaging-sw.js] Service Worker activated.");
  event.waitUntil(clients.claim());
});
