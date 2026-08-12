import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import { RootErrorBoundary } from './components/RootErrorBoundary.tsx';
import { initSafariDebugger, logDebug } from './utils/safariDebugger.ts';

// Initialize Safari and boot diagnostics
initSafariDebugger();

// Register PWA Background & Messaging Service Worker cross-browser deferred to avoid blocking initial paint frame
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const registerSW = () => {
      navigator.serviceWorker
        .register("/firebase-messaging-sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[PWA] Service Worker registered successfully with scope:", reg.scope);
          logDebug("ServiceWorker", `Registered successfully with scope: ${reg.scope}`, "success");
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
          logDebug("ServiceWorker", `Registration failed: ${err.message || String(err)}`, "warn", err);
        });
    };

    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(registerSW, { timeout: 3000 });
    } else {
      setTimeout(registerSW, 1500);
    }
  });
}

createRoot(document.getElementById('root')!).render(
    <RootErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </RootErrorBoundary>
);
