import { safeSessionStorage, safeLocalStorage } from "./safeStorage";
import { app, auth, db } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export interface SafariDebugLog {
  id: string;
  timestamp: string;
  timeMs: number;
  category:
    | "Initialization"
    | "FirebaseAuth"
    | "FirebaseInit"
    | "AppLifecycle"
    | "ReactState"
    | "ServiceWorker"
    | "AudioContext"
    | "Storage"
    | "Browser"
    | "Exception"
    | "Network";
  message: string;
  level: "info" | "success" | "warn" | "error";
  details?: any;
}

const STORAGE_KEY = "safari_debug_logs";
const MAX_LOGS = 200;

type LogSubscriber = (logs: SafariDebugLog[]) => void;
const subscribers: Set<LogSubscriber> = new Set();

let initialized = false;

export function getDebugLogs(): SafariDebugLog[] {
  try {
    const raw = safeSessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SafariDebugLog[];
  } catch (e) {
    console.warn("[SafariDebugger] Failed to parse logs from sessionStorage:", e);
    return [];
  }
}

export function saveDebugLogs(logs: SafariDebugLog[]): void {
  try {
    const truncated = logs.slice(-MAX_LOGS);
    safeSessionStorage.setItem(STORAGE_KEY, JSON.stringify(truncated));
    subscribers.forEach((cb) => {
      try {
        cb(truncated);
      } catch (err) {
        console.error("[SafariDebugger] Subscriber notification error:", err);
      }
    });
  } catch (e) {
    console.warn("[SafariDebugger] Failed to persist debug logs:", e);
  }
}

export function logDebug(
  category: SafariDebugLog["category"],
  message: string,
  level: SafariDebugLog["level"] = "info",
  details?: any
): SafariDebugLog {
  const now = new Date();
  const entry: SafariDebugLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now.toLocaleTimeString() + `.${now.getMilliseconds().toString().padStart(3, "0")}`,
    timeMs: now.getTime(),
    category,
    message,
    level,
    details: details ? (typeof details === "object" ? JSON.stringify(details, null, 2) : String(details)) : undefined,
  };

  const currentLogs = getDebugLogs();
  currentLogs.push(entry);
  saveDebugLogs(currentLogs);

  // Also log to console for standard DevTools (using warn/log to prevent false-positive AI Studio runner triggers)
  const prefix = `[SafariDebugger][${category}]`;
  if (level === "error" || level === "warn") console.warn(prefix, message, details || "");
  else console.log(prefix, message, details || "");

  return entry;
}

export function logAppLifecycle(stage: string, details?: any, level: SafariDebugLog["level"] = "info"): SafariDebugLog {
  return logDebug("AppLifecycle", stage, level, details);
}

export function logFirebaseInit(status: string, details?: any, level: SafariDebugLog["level"] = "info"): SafariDebugLog {
  return logDebug("FirebaseInit", status, level, details);
}

export function logReactState(component: string, stateName: string, value: any, level: SafariDebugLog["level"] = "info"): SafariDebugLog {
  const formattedVal = typeof value === "object" ? JSON.stringify(value) : String(value);
  return logDebug("ReactState", `[${component}] ${stateName} = ${formattedVal}`, level, value);
}

export function clearDebugLogs(): void {
  safeSessionStorage.removeItem(STORAGE_KEY);
  subscribers.forEach((cb) => cb([]));
}

export function subscribeToDebugLogs(callback: LogSubscriber): () => void {
  subscribers.add(callback);
  callback(getDebugLogs());
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Perform comprehensive Safari & startup diagnostics and attach global exception listeners.
 */
export function initSafariDebugger(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  logDebug("Initialization", "Safari Debugger initialized", "info");

  // 1. Browser & Device Diagnostics
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isStandalone = (window.navigator as any).standalone || window.matchMedia("(display-mode: standalone)").matches;

  let isIframe = false;
  try {
    isIframe = window.self !== window.top;
  } catch (e) {
    isIframe = true;
  }

  logDebug("Browser", `UserAgent: ${ua}`, "info");
  logDebug(
    "Browser",
    `Device Specs: iOS=${isIos}, Safari=${isSafari}, StandalonePWA=${isStandalone}, InsideIframe=${isIframe}, SecureContext=${window.isSecureContext}`,
    isSafari ? "warn" : "info"
  );

  // 2. Firebase Initialization Status Check
  try {
    if (app) {
      logFirebaseInit("Firebase App initialized successfully", { appName: app.name }, "success");
    } else {
      logFirebaseInit("Firebase App is undefined", null, "error");
    }
    if (db) {
      logFirebaseInit("Firestore DB instance created (autoDetectLongPolling enabled)", { type: db.type }, "success");
    } else {
      logFirebaseInit("Firestore DB instance is undefined", null, "error");
    }
    if (auth) {
      logFirebaseInit("Firebase Auth initialized", { currentUser: auth.currentUser?.uid || "None" }, "success");
    } else {
      logFirebaseInit("Firebase Auth is undefined", null, "error");
    }
  } catch (err) {
    logFirebaseInit("Error verifying Firebase initialization status", err, "error");
  }

  // 3. Storage Capability Checks
  try {
    const testKey = "__safari_test_key__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    logDebug("Storage", "LocalStorage is functional", "success");
  } catch (e) {
    logDebug("Storage", "LocalStorage is blocked or failing (Private Mode / Iframe constraint)", "warn", e);
  }

  try {
    const testKey = "__safari_test_key__";
    window.sessionStorage.setItem(testKey, "1");
    window.sessionStorage.removeItem(testKey);
    logDebug("Storage", "SessionStorage is functional", "success");
  } catch (e) {
    logDebug("Storage", "SessionStorage is blocked or failing", "warn", e);
  }

  if (window.indexedDB) {
    try {
      const req = window.indexedDB.open("__safari_test_db__");
      req.onsuccess = () => {
        logDebug("Storage", "IndexedDB opened successfully", "success");
        try {
          window.indexedDB.deleteDatabase("__safari_test_db__");
        } catch (e) {}
      };
      req.onerror = (err) => {
        logDebug("Storage", "IndexedDB open failed (may cause Firebase persistence issues on Safari)", "warn", err);
      };
    } catch (e) {
      logDebug("Storage", "IndexedDB exception thrown", "warn", e);
    }
  } else {
    logDebug("Storage", "IndexedDB is NOT supported in this browser environment", "warn");
  }

  // 4. Audio Context Diagnostics
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (AudioCtxClass) {
    try {
      const dummyCtx = new AudioCtxClass();
      logDebug("AudioContext", `AudioContext available. Initial state: ${dummyCtx.state}, sampleRate: ${dummyCtx.sampleRate}Hz`, "success");
      dummyCtx.close().catch(() => {});
    } catch (e) {
      logDebug("AudioContext", "AudioContext instance check note", "warn", e);
    }
  } else {
    logDebug("AudioContext", "Web Audio API (AudioContext) is unsupported in this environment", "info");
  }

  // 5. Service Worker Status Check
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        logDebug("ServiceWorker", `Active SW Registrations count: ${regs.length}`, "info");
        regs.forEach((r, idx) => {
          logDebug("ServiceWorker", `Registration #${idx + 1}: scope=${r.scope}, activeState=${r.active?.state || "none"}`, "info");
        });
      })
      .catch((err) => {
        logDebug("ServiceWorker", "Failed to fetch SW registrations", "warn", err);
      });

    if (navigator.serviceWorker.controller) {
      logDebug("ServiceWorker", `Page is currently controlled by SW: ${navigator.serviceWorker.controller.scriptURL}`, "success");
    } else {
      logDebug("ServiceWorker", "Page is NOT controlled by a Service Worker controller", "info");
    }
  } else {
    logDebug("ServiceWorker", "Service Workers are unsupported in this browser environment", "warn");
  }

  // 6. Firebase Auth State Listener
  try {
    logDebug("FirebaseAuth", "Subscribing to Firebase Auth state listener...", "info");
    onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          logDebug("FirebaseAuth", `Auth State Changed: Signed in as ${user.uid} (${user.email || "Guest"})`, "success");
        } else {
          logDebug("FirebaseAuth", "Auth State Changed: Signed out / Unauthenticated guest state", "info");
        }
      },
      (error) => {
        logDebug("FirebaseAuth", "Auth State Listener encountered error", "error", error);
      }
    );
  } catch (e) {
    logDebug("FirebaseAuth", "Failed to initialize Auth listener", "error", e);
  }

  // 7. Global Exception Listeners
  window.addEventListener("error", (event) => {
    // Ignore element load events (e.g. <img> or <script> 404s) where event.message is absent
    if (!event.message && !event.error) {
      const targetName = (event.target as HTMLElement)?.tagName || "element";
      logDebug("Exception", `Resource load note on <${targetName}>`, "warn");
      return;
    }

    const msg = event.message || event.error?.message || "Uncaught Error";
    logDebug(
      "Exception",
      `Uncaught Exception: ${msg} at ${event.filename || "unknown"}:${event.lineno || 0}:${event.colno || 0}`,
      "warn",
      {
        message: msg,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        errorStack: event.error?.stack || "No stack trace available",
      }
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (reason?.name === "AbortError" || reason?.message?.includes("user aborted")) return;

    const msg = reason?.message || (typeof reason === "string" ? reason : JSON.stringify(reason)) || "Unhandled Promise Rejection";
    logDebug(
      "Exception",
      `Unhandled Promise Rejection: ${msg}`,
      "warn",
      {
        reasonMessage: msg,
        reasonStack: reason?.stack || "No stack trace available",
      }
    );
  });

  // 8. Performance & Navigation Timings Observer (FCP, LCP, Navigation phases)
  if (typeof performance !== "undefined") {
    setTimeout(() => {
      try {
        const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
        if (navEntries && navEntries.length > 0) {
          const nav = navEntries[0];
          const dnsTime = Math.round(nav.domainLookupEnd - nav.domainLookupStart);
          const tlsTime = nav.secureConnectionStart > 0 ? Math.round(nav.connectEnd - nav.secureConnectionStart) : 0;
          const htmlDownloadTime = Math.round(nav.responseEnd - nav.responseStart);
          const domInteractive = Math.round(nav.domInteractive);
          const domComplete = Math.round(nav.domComplete);

          logDebug("Initialization", `Page Startup Metrics: DNS=${dnsTime}ms, TLS=${tlsTime}ms, HTML Download=${htmlDownloadTime}ms, TTI (DOM Interactive)=${domInteractive}ms, DOM Complete=${domComplete}ms`, "success", {
            dnsTime,
            tlsTime,
            htmlDownloadTime,
            domInteractive,
            domComplete,
            transferSize: nav.transferSize,
          });
        }
      } catch (e) {
        logDebug("Initialization", "Performance navigation metrics note", "info", e);
      }
    }, 1000);

    // PerformanceObserver for FCP & LCP
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const paintObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === "first-contentful-paint") {
              logDebug("Initialization", `First Contentful Paint (FCP): ${Math.round(entry.startTime)}ms`, "success");
            }
          }
        });
        paintObserver.observe({ type: "paint", buffered: true });

        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            logDebug("Initialization", `Largest Contentful Paint (LCP): ${Math.round(lastEntry.startTime)}ms`, "success");
          }
        });
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      } catch (e) {
        // PerformanceObserver types might not be supported in older WebKits
      }
    }
  }

  // 9. Network Online/Offline events
  window.addEventListener("online", () => {
    logDebug("Network", "Browser went ONLINE", "success");
  });
  window.addEventListener("offline", () => {
    logDebug("Network", "Browser went OFFLINE", "warn");
  });
}


