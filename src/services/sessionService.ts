import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { CartItem, RESTAURANT_ID } from "../types";
import { Message } from "./voice/aiService";

export interface CustomerSession {
  sessionId: string;
  tableId: string;
  restaurantId: string;
  status: "ACTIVE" | "FINISHED";
  messages: Message[];
  cart: CartItem[];
  orderNotes: string;
  createdAt: string;
  lastUpdated: string;
}

const DEFAULT_WELCOME_MESSAGE: Message = {
  id: "welcome-1",
  role: "assistant",
  content:
    "Welcome to Salein Cafe! I am Ward | ورد, your AI waiter. How may I serve you today? 😊\nأهلاً وسهلاً بكم في سالين كافيه! أنا نادلكم الذكي ورد، كيف بقدر أساعدكم اليوم؟",
  timestamp: new Date(),
};

export class SessionService {
  private static getStorageKey(tableId: string): string {
    return `talktable_session_${tableId}`;
  }

  /**
   * Get or initialize an active customer session for a table.
   * Restores session state from sessionStorage or Firestore if active.
   */
  public static async getOrInitSession(tableId: string): Promise<CustomerSession> {
    const tid = tableId || "12";

    // 1. Check local session storage first
    const storageKey = this.getStorageKey(tid);
    const localRaw = sessionStorage.getItem(storageKey);
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw) as CustomerSession;
        if (parsed && parsed.status === "ACTIVE" && parsed.sessionId) {
          return parsed;
        }
      } catch (e) {
        console.warn("[SessionService] Failed to parse local session:", e);
      }
    }

    // 2. Check Firestore for active table session
    try {
      const docRef = doc(db, "tableSessions", tid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === "ACTIVE" && data.sessionId) {
          const session: CustomerSession = {
            sessionId: data.sessionId,
            tableId: tid,
            restaurantId: data.restaurantId || RESTAURANT_ID,
            status: "ACTIVE",
            messages:
              Array.isArray(data.messages) && data.messages.length > 0
                ? data.messages
                : [DEFAULT_WELCOME_MESSAGE],
            cart: Array.isArray(data.cart) ? data.cart : [],
            orderNotes: typeof data.orderNotes === "string" ? data.orderNotes : "",
            createdAt: data.createdAt || new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          };
          sessionStorage.setItem(storageKey, JSON.stringify(session));
          return session;
        }
      }
    } catch (err) {
      console.warn("[SessionService] Could not fetch session from Firestore:", err);
    }

    // 3. Create fresh active session
    const newSessionId = `sess_${tid}_${Date.now()}`;
    const newSession: CustomerSession = {
      sessionId: newSessionId,
      tableId: tid,
      restaurantId: RESTAURANT_ID,
      status: "ACTIVE",
      messages: [DEFAULT_WELCOME_MESSAGE],
      cart: [],
      orderNotes: "",
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    await this.saveSession(newSession);
    return newSession;
  }

  /**
   * Persist active session updates to sessionStorage and Firestore
   */
  public static async saveSession(session: CustomerSession): Promise<void> {
    if (!session || !session.tableId) return;

    const storageKey = this.getStorageKey(session.tableId);
    const updated: CustomerSession = {
      ...session,
      lastUpdated: new Date().toISOString(),
    };

    // Save to sessionStorage instantly
    sessionStorage.setItem(storageKey, JSON.stringify(updated));

    // Async sync to Firestore
    try {
      const docRef = doc(db, "tableSessions", session.tableId);
      await setDoc(docRef, {
        sessionId: updated.sessionId,
        tableId: updated.tableId,
        restaurantId: updated.restaurantId,
        status: updated.status,
        messages: (updated.messages || []).slice(-25).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp:
            typeof m.timestamp === "string"
              ? m.timestamp
              : m.timestamp
              ? new Date(m.timestamp).toISOString()
              : new Date().toISOString(),
        })),
        cart: updated.cart || [],
        orderNotes: updated.orderNotes || "",
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.warn("[SessionService] Failed to sync session to Firestore:", err);
    }
  }

  /**
   * Close and finish active session (called on FINISH ORDER or staff release table)
   */
  public static async finishSession(tableId: string): Promise<void> {
    if (!tableId) return;

    const storageKey = this.getStorageKey(tableId);
    sessionStorage.removeItem(storageKey);

    try {
      const docRef = doc(db, "tableSessions", tableId);
      await setDoc(
        docRef,
        {
          status: "FINISHED",
          finishedAt: Timestamp.now(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("[SessionService] Error finishing session in Firestore:", err);
    }
  }
}
