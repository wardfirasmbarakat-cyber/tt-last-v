import express from "express";
import path from "path";
import http from "http";
import fs from "fs";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality, ThinkingLevel, LiveServerMessage, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { MENU_ITEMS } from "./src/data/menu.ts";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, collection, addDoc, getDocs, Timestamp } from "firebase/firestore";

dotenv.config();

// --- SECURITY & RATE LIMITING HELPERS ---

// Timing-safe string comparison to prevent side-channel timing attacks
function safeCompareStrings(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Input sanitizer helper to strip harmful control characters & limit length
function sanitizeString(input: unknown, maxLength: number = 500): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .substring(0, maxLength);
}

// In-memory sliding window rate limiter
interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStores = new Map<string, Map<string, RateLimitRecord>>();

function createRateLimiter(options: { windowMs: number; max: number; keyPrefix: string }) {
  const store = new Map<string, RateLimitRecord>();
  rateLimitStores.set(options.keyPrefix, store);

  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(ip);
      }
    }
  }, 5 * 60 * 1000);

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const rawIp = (req.headers["x-forwarded-for"] as string || req.ip || "127.0.0.1").split(",")[0].trim();
    const now = Date.now();

    let record = store.get(rawIp);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + options.windowMs };
      store.set(rawIp, record);
      return next();
    }

    record.count++;
    if (record.count > options.max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfterSeconds
      });
    }

    next();
  };
}

const generalLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: "general" });
const aiEndpointLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60, keyPrefix: "ai" });
const sensitiveAdminLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: "admin" });

// --- GLOBAL ERROR HANDLING ---
process.on('uncaughtException', (err: any) => {
  if (
    err?.code === 'EPIPE' ||
    err?.code === 'ECONNRESET' ||
    err?.code === 'ECANCELED' ||
    err?.message?.includes('EPIPE') ||
    err?.message?.includes('ECONNRESET')
  ) {
    console.warn('[NETWORK WARNING] Ignored harmless stream disconnect:', err?.message || err);
    return;
  }
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
app.use(express.json({ limit: "10mb" }));

// Comprehensive Security, HTTPS & CSP Middleware for cross-browser & Safari compatibility
app.use((req, res, next) => {
  // Force HTTPS in production / proxy environments
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] === "http") {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }

  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://*.firebaseapp.com https://*.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://*.firebaseapp.com https://images.unsplash.com https://*.googleapis.com https://*.gstatic.com",
    "connect-src 'self' wss: ws: https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://fcm.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://*.google-analytics.com",
    "media-src 'self' blob: data:",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://ai.studio https://*.google.com https://*.googleusercontent.com",
    "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.googleusercontent.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; ");

  res.setHeader("Content-Security-Policy", csp);

  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Table-Number");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Initialize Server-Side Firebase
let serverDb: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const serverApp = initializeApp(firebaseConfig, "server-app");
    const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)" ? firebaseConfig.firestoreDatabaseId : undefined;
    serverDb = dbId ? getFirestore(serverApp, dbId) : getFirestore(serverApp);
    console.log("[SERVER] Firebase initialized successfully on server-side.");
  } else {
    console.warn("[SERVER] firebase-applet-config.json not found. Database functionality will be limited.");
  }
} catch (err) {
  console.error("[SERVER] Error initializing Firebase on server-side:", err);
}


const PORT = 3000;
const server = http.createServer(app);

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// --- SYSTEM INSTRUCTIONS GENERATOR ---

let liveServerMenuItems: any[] = [...MENU_ITEMS];
let lastMenuFetchTime = 0;

async function getLiveServerMenuItems(): Promise<any[]> {
  const now = Date.now();
  if (now - lastMenuFetchTime < 3000 && liveServerMenuItems.length > 0) {
    return liveServerMenuItems;
  }

  if (serverDb) {
    try {
      const snap = await getDocs(collection(serverDb, "menuItems"));
      if (!snap.empty) {
        const items: any[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (!data.isArchived && data.availability !== "hidden") {
            items.push({
              ...data,
              id: d.id || data.id,
            });
          }
        });
        if (items.length > 0) {
          liveServerMenuItems = items;
          lastMenuFetchTime = now;
        }
      }
    } catch (err: any) {
      const errStr = String(err?.message || err || "");
      if (errStr.includes("Quota limit exceeded") || errStr.includes("Quota exceeded") || errStr.includes("free daily read units") || errStr.includes("resource-exhausted")) {
        console.warn("[SERVER] Firestore quota limit reached. Using static fallback menu items.");
      } else {
        console.warn("[SERVER] Error fetching live menu items from Firestore:", errStr);
      }
    }
  }
  return liveServerMenuItems.length > 0 ? liveServerMenuItems : MENU_ITEMS;
}

function formatMenuString(items: any[]): string {
  const menuList = items && items.length > 0 ? items : MENU_ITEMS;
  return menuList.map(i => {
    const priceNum = typeof i.price === 'number' ? i.price : Number(i.price || 0);
    const allergensStr = Array.isArray(i.allergens) ? i.allergens.join(", ") : (i.allergens || "None");
    const tagsStr = Array.isArray(i.tags) ? i.tags.join(", ") : (i.tags || "");
    const ingStr = Array.isArray(i.ingredients) ? i.ingredients.join(", ") : (i.ingredients || "");
    return `- [ID: ${i.id}] **${i.name}** (${i.category || "Uncategorized"}) - ${priceNum.toFixed(2)} JD
Description: ${i.description || ''}
Prep Time: ${i.prepTime || '5 mins'}, Calories: ${i.calories || 'N/A'}
Allergens: ${allergensStr}
Tags: ${tagsStr}
Ingredients: ${ingStr}
Customizations: ${JSON.stringify(i.customizations || [])}`;
  }).join("\n\n");
}

export function getSystemInstruction(
  tableNumber: string = "12",
  currentCart: any[] = [],
  orderNotes: string = "",
  menuList: any[] = []
): string {
  const menuStr = formatMenuString(menuList && menuList.length > 0 ? menuList : liveServerMenuItems);
  let computedSubtotal = 0;
  const cartLines = Array.isArray(currentCart) && currentCart.length > 0
    ? currentCart.map((i: any) => {
        const unitPrice = typeof i.price === 'number' ? i.price : (typeof i.basePrice === 'number' ? i.basePrice : 0);
        const qty = typeof i.quantity === 'number' && i.quantity > 0 ? i.quantity : 1;
        const lineTotal = unitPrice * qty;
        computedSubtotal += lineTotal;

        const custStr = Array.isArray(i.customizations) && i.customizations.length > 0
          ? ` [Options: ${i.customizations.map((c: any) => {
              if (typeof c === 'string') return c;
              if (c && Array.isArray(c.selected)) return c.selected.join(', ');
              return JSON.stringify(c);
            }).filter(Boolean).join(', ')}]`
          : '';

        const noteStr = i.note ? ` [Item Note: ${i.note}]` : '';
        return `- ${i.name || i.itemName || "Item"} x${qty} @ ${unitPrice.toFixed(2)} JD each = ${lineTotal.toFixed(2)} JD${custStr}${noteStr}`;
      })
    : [];

  const talkTableFee = cartLines.length > 0 ? 0.05 : 0;
  const grandTotal = cartLines.length > 0 ? Number((computedSubtotal + talkTableFee).toFixed(2)) : 0;

  const cartSummary = cartLines.length > 0
    ? `${cartLines.join("\n")}
Calculated Subtotal: ${computedSubtotal.toFixed(2)} JD
Platform Service Fee: ${talkTableFee.toFixed(2)} JD
Tax: 0.00 JD (Tax Inclusive)
Calculated Grand Total: ${grandTotal.toFixed(2)} JD`
    : "The cart is currently empty.";

  const notesSummary =
    orderNotes && typeof orderNotes === "string" && orderNotes.trim().length > 0
      ? orderNotes
      : "None";

  return `You are Ward | ورد, the AI Waiter for Salein Cafe / Salein Coffee House.
You are currently taking customer orders for Table ${tableNumber}, collecting special notes for the kitchen, and sending confirmed orders directly to the Kitchen Dashboard.

SESSION & LIVE CART MEMORY (SINGLE SOURCE OF TRUTH):
- Active Table: Table ${tableNumber}
- CURRENT ACTIVE CART ITEMS & APPLICATION CALCULATED TOTALS:
${cartSummary}
- CURRENT ORDER SPECIAL INSTRUCTIONS / NOTES: ${notesSummary}

IMPORTANT CONTEXT & PERSISTENT MEMORY RULES:
- You maintain full session context for Table ${tableNumber} throughout the customer's entire visit. Turning voice/microphone off and on DOES NOT reset or clear customer order or context.
- Always check the CURRENT ACTIVE CART ITEMS & APPLICATION CALCULATED TOTALS above before answering questions about what the customer ordered, what is in their cart, or the total price.
- If the customer asks "What did I order?", "What do I have so far?", "What is my total?", or "شو طلبت لحتى الآن؟" / "كم المجموع؟", answer accurately based on the exact calculated totals listed in CURRENT ACTIVE CART ITEMS above.
- NEVER invent, guess, or recalculate prices on your own. Always state the exact calculated subtotal and grand total provided in the CURRENT ACTIVE CART ITEMS context above.
- If the customer asks "What note did I give you?" or "شو الملاحظة اللي كتبتها؟", answer accurately based on the CURRENT ORDER SPECIAL INSTRUCTIONS / NOTES above.
- If the customer asks to modify an existing item (e.g., "make one of the cappuccinos with oat milk"), update the relevant item from the active cart using tools.

ORDERING & CART EXPERIENCE & CONTINUITY (CRITICAL):
- ABSOLUTE DIRECTIVE — NEVER FORGET A REQUESTED ITEM:
  When the customer requests multiple items or multiple edits in a single sentence or turn (e.g., "I want one Fajita Meal, two Turkish coffees, and a Coke" or "Add a Fajita Meal, make the coffees 2, and remove the Zinger"), YOU MUST PROCESS AND INCLUDE EVERY SINGLE REQUESTED ITEM OR ACTION!
  Either include ALL requested items in the items array of "add_items_to_cart", or call function tools for ALL requested actions in the turn. NEVER skip or forget any requested item!
- CRITICAL VOICE SESSION CONTINUITY RULE: Maintain an active ordering conversation until the customer explicitly confirms they are finished.
- NEVER act like a single-turn chatbot! After adding, modifying, or removing items, keep the conversation open: "I've added [items] to your order. Please check your cart! Would you like anything else?" / "تم إضافة [الأصناف] إلى طلبكم. يرجى تفقد سلتك! بتحب تضيف إشي ثاني؟".
- SANDWICH TO MEAL CONVERSION & ITEM REPLACEMENT: If the customer asks to change or replace an item (e.g. "Change Fajita Sandwich to Fajita Meal", "Make that a meal", "Replace the Fajita with a Zinger Meal"), call "replace_cart_item" with oldItemId and newItemId. This automatically replaces the item, updates the exact meal price, and preserves notes. DO NOT just add a new item!
- QUANTITY CHANGES: When the customer asks to change quantity (e.g. "Make the coffees three", "Add one more coffee", "Remove one coffee", "Remove the Coke"), call "update_item_quantity" or "remove_item_from_cart" immediately.
- IF NO MEAL EXISTS on the menu for that item, DO NOT INVENT ONE! Polite response: "I don't see a meal option for that item on our menu. Would you like to keep it as the sandwich?" / "ما في خيار وجبة لهذا الصنف بالقائمة، بتحب تخليها ساندويش؟".
- ALWAYS REMIND THE CUSTOMER TO CHECK THEIR CART whenever items are added, modified, or when reviewing the order details (e.g. "Please check your cart!", "يرجى تفقد سلتك!").

SINGLE SOURCE OF TRUTH & CRITICAL PRICE ACCURACY (CRITICAL):
- WARD HAS NO PRICING AUTHORITY. THE REAL TALKTABLE MENU DATABASE OWNS PRICING.
- Ward MUST NEVER guess, estimate, generate, hardcode, calculate, or remember a price from conversation.
- When stating prices to the user, Ward MUST read the exact price listed in the OFFICIAL MENU below, or read the exact calculated subtotal and total provided in CURRENT ACTIVE CART ITEMS above.
- If a customer changes an item variant (e.g. Fajita Sandwich -> Fajita Meal), Ward MUST state the official Fajita Meal price from the menu. Ward MUST NEVER preserve or guess the old variant's price.
- TalkTable has NO TAX (tax is 0.00 JD / tax inclusive).
- The platform service fee is strictly 0.05 JD.
- The uploaded menu below is your ONLY source of truth.
- You must ONLY know, recommend, list, or sell items that exist on this restaurant menu.
- NEVER invent, assume, or suggest imaginary dishes, desserts, drinks, or pizzas that are not on this list.

MEALS VS SANDWICHES CATEGORY RULES (CRITICAL):
1. CLEAR CATEGORY DISTINCTION:
   - You MUST distinguish between MEALS (Category: "Meals" or items with a "Meal" option) and SANDWICHES (Category: "Sandwiches" or items with "Sandwich" option).
   - A MEAL is a full platter/combo (e.g. "Chicken Escalope Meal", "Crispy Chicken Meal", "Super Zinger Meal", "Fajita Meal").
   - A SANDWICH is a single sandwich (e.g. "Chicken Sandwich", "Chicken Fajita Sandwich", "Zinger Sandwich", "Francisco Sandwich").

2. EXACT INTENT PRIORITY & BILINGUAL MAPPING:
   - "meal", "combo", "combo meal", "وجبة", "كومبو", "وجبة كاملة" -> MUST map strictly to a MEAL item.
   - "sandwich", "sandwhich", "ساندويش", "ساندوتش", "سندويشة" -> MUST map strictly to a SANDWICH item.
   - If customer says "Fajeta" / "فاهيتا" without specifying sandwich or meal, ask: "Would you like the Fajita sandwich or the Fajita meal?" / "بتحب الفاهيتا ساندويش ولا وجبة؟".

3. IF NO MEAL OPTION EXISTS FOR A DISH:
   - If customer asks for a meal for a dish that ONLY exists as a sandwich, politely ask: "We don't have a meal option for that item, would you like the sandwich instead?".

ORDER CONFIRMATION & SUBMISSION FLOW (EXACTLY ONE CONFIRMATION - CRITICAL):
1. While the customer is adding, editing, or removing items, confirm each action ONLY AFTER tool success and ask: "Would you like anything else?" or "بتحب تضيف إشي ثاني؟". Remind them to check their cart.
2. WARD MUST NEVER CLAIM SUCCESS BEFORE TOOL SUCCESS (MANDATORY RULE):
   - WARD MUST NOT SAY: "I removed it", "I changed it", "I updated your order", "Done", or claim success BEFORE calling the appropriate function tool AND verifying tool execution.
   - If a tool execution fails or returns success: false, Ward MUST NOT pretend it succeeded. Say: "I couldn't update that yet. Let me try again." / "ما قدرت أعدل الطلب حالياً، خليني أحاول مرة ثانية."
   - For undo requests ("undo that", "put it back", "تراجع"), call "undo_last_cart_action" tool immediately.
3. ONLY when the customer explicitly indicates they are finished ordering (e.g., "That's everything", "I'm done", "Send my order", "That's all", "خلصنا طلب", "بدنا الحساب", "أرسل الطلب"):
   - Read the exact items and grand total from the CURRENT ACTIVE CART ITEMS context above.
   - Ask for final confirmation EXACTLY ONCE:
     English: "Your order is [exact cart items]. Your total is [exact total] JD. Would you like me to send this order to the kitchen now?"
     Arabic: "طلبكم هو: [ملخص الأصناف بالسلة]. المجموع الكلي [المجموع] دينار. هل ترغبون بإرسال الطلب إلى المطبخ الآن؟"
3. WHEN THE CUSTOMER SAYS YES (e.g. "Yes", "Confirm", "Send it", "Go ahead", "Place order", "نعم", "تأكيد", "أرسل الطلب", "موافق", "تمام أرسل"):
   - Call tool "confirm_and_submit_order" IMMEDIATELY.
   - DO NOT ask "Are you sure?". DO NOT ask for a second confirmation. DO NOT ask any follow-up questions.
   - Once submitted, announce ONLY:
     English: "Thank you for choosing Salein Cafe. Your order has been confirmed and sent to the kitchen."
     Arabic: "شكراً لاختياركم Salein Cafe. تم تأكيد طلبكم وإرساله إلى المطبخ."
4. IF THE CUSTOMER EDITS THEIR ORDER DURING CONFIRMATION (e.g. "Actually remove 1 coffee"):
   - Immediately EXIT confirmation mode and call the appropriate cart tool ("remove_item_from_cart", "update_item_quantity", "replace_cart_item").
   - Confirm the cart change in ordering mode and ask if they need anything else.
   - Do NOT submit the order until they indicate they are finished again and confirm the new total ONCE.
5. IF THE CUSTOMER SAYS NO OR "WAIT":
   - Do NOT submit. Return to taking orders naturally.

OFFICIAL EXTRACTED MENU KNOWLEDGE:
${menuStr}

RULES SUMMARY:
- NEVER FORGET requested items or actions in multi-item requests.
- ALWAYS remind the customer to check their cart when adding or modifying items.
- Never invent menu items or prices.
- Ask for final confirmation EXACTLY ONCE before submission.
- Never ask for a second confirmation after a clear YES.
- DO NOT READ SYMBOLS OR EMOJIS ALOUD.`;
}

// --- API ROUTES ---

app.get("/api/health", generalLimiter, (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// AI Waiter Chat Endpoint
app.post("/api/gemini/waiter", aiEndpointLimiter, async (req, res) => {
  try {
    const { messages, advanced, tableNumber, cart, orderNotes } = req.body;

    const dbMenuItems = await getLiveServerMenuItems();
    const systemInstruction = getSystemInstruction(tableNumber || "12", cart || [], orderNotes || "", dbMenuItems);
    const modelName = advanced ? "gemini-3.1-pro-preview" : "gemini-3.1-flash-lite";

    // Format messages for the @google/genai SDK
    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: [{ text: m.content }]
    }));

    // Define custom waiter tools for full ordering, checkout, and notes management
    const waiterTools = [
      {
        functionDeclarations: [
          {
            name: "add_items_to_cart",
            description: "Add one or more items to the customer's cart. Call this when the customer specifies what they want to order, customize, or confirms an addition.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                items: {
                  type: Type.ARRAY,
                  description: "The list of items to add to the cart.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      itemId: { type: Type.STRING, description: "The ID or name of the menu item (e.g., 'co-1')." },
                      itemName: { type: Type.STRING, description: "The exact name of the menu item (e.g. 'Chicken Meal', 'Chicken Sandwich')." },
                      category: { type: Type.STRING, description: "The category of the menu item from database ('Meals', 'Sandwiches', etc.)." },
                      quantity: { type: Type.INTEGER, description: "The quantity of this item to add." },
                      customizations: {
                        type: Type.ARRAY,
                        description: "Selected customizations for this item (e.g. ['Oat Milk', 'Grande']).",
                        items: { type: Type.STRING }
                      },
                      note: { type: Type.STRING, description: "Special instruction for this specific item (e.g. 'Oat milk', 'No onions')." }
                    },
                    required: ["itemId", "quantity"]
                  }
                }
              },
              required: ["items"]
            }
          },
          {
            name: "remove_item_from_cart",
            description: "Remove an item from the customer's cart by item ID or item name, or reduce its quantity.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                itemId: { type: Type.STRING, description: "The item ID or name to remove from the cart." },
                quantity: { type: Type.INTEGER, description: "Optional quantity to remove (e.g., 1). Omit to remove entire line item." }
              },
              required: ["itemId"]
            }
          },
          {
            name: "update_item_quantity",
            description: "Update the quantity of a specific item in the customer's cart. Supports exact quantity or relative increase/decrease.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                itemId: { type: Type.STRING, description: "The item ID or name in the cart (e.g. 'co-1' or 'Turkish Coffee')." },
                quantity: { type: Type.INTEGER, description: "Target quantity, or amount to add/subtract." },
                mode: { type: Type.STRING, description: "'set' to set exact target quantity, 'increase' to add to quantity, 'decrease' to subtract. Defaults to 'set'." }
              },
              required: ["itemId", "quantity"]
            }
          },
          {
            name: "replace_cart_item",
            description: "Replace an existing cart item with a new menu item (e.g. Sandwich to Meal conversion, or swapping Fajita for Zinger). Re-fetches price and updates item ID while preserving quantity and notes.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                oldItemId: { type: Type.STRING, description: "The item ID or name currently in the cart to replace (e.g. 'Fajita Sandwich', 'sw-2')." },
                newItemId: { type: Type.STRING, description: "The new menu item ID or name to put in its place (e.g. 'Fajita Meal', 'sn-1-meal')." },
                quantity: { type: Type.INTEGER, description: "Optional quantity for new item. Preserves existing quantity if omitted." },
                customizations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Optional customizations for new item."
                },
                note: { type: Type.STRING, description: "Optional note for new item. Preserves existing note if omitted." }
              },
              required: ["oldItemId", "newItemId"]
            }
          },
          {
            name: "add_item_note",
            description: "Attach a special instruction or note to a specific item in the cart (e.g. 'Oat milk', 'Extra hot', 'No sauce').",
            parameters: {
              type: Type.OBJECT,
              properties: {
                itemId: { type: Type.STRING, description: "The item ID or name in the cart." },
                note: { type: Type.STRING, description: "The special instruction for this item." }
              },
              required: ["itemId", "note"]
            }
          },
          {
            name: "add_order_note",
            description: "Attach an overall special instruction or note for the entire order (e.g. 'Please bring everything together', 'Cut in half', 'Dressing on side').",
            parameters: {
              type: Type.OBJECT,
              properties: {
                note: { type: Type.STRING, description: "The order-wide note or special instruction." }
              },
              required: ["note"]
            }
          },
          {
            name: "undo_last_cart_action",
            description: "Undo the previous cart mutation and restore the previous cart state (e.g. when customer says 'undo that', 'actually put it back', 'تراجع', 'رجع السلة')."
          },
          {
            name: "review_order_checkout",
            description: "Call this when the customer wants to check out, view their complete order summary, or review their cart."
          },
          {
            name: "confirm_and_submit_order",
            description: "Call ONLY when the customer gives EXPLICIT confirmation (e.g. 'Yes', 'Confirm', 'Send it', 'Place the order') to submit the order to the kitchen.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                paymentMethod: { type: Type.STRING, description: "Payment method selected ('cash' or 'card'). Defaults to 'cash'." },
                orderNotes: { type: Type.STRING, description: "Final order-wide special instructions for the kitchen." },
                items: {
                  type: Type.ARRAY,
                  description: "Optional list of items to submit if confirming directly.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      itemId: { type: Type.STRING, description: "Item ID or name (e.g., 'co-1' or 'Spanish Latte')" },
                      quantity: { type: Type.INTEGER, description: "Item quantity" },
                      customizations: { type: Type.ARRAY, items: { type: Type.STRING } },
                      note: { type: Type.STRING }
                    },
                    required: ["itemId", "quantity"]
                  }
                }
              }
            }
          },
          {
            name: "finish_order_receipt",
            description: "Call this when the customer asks for the receipt or bill."
          }
        ]
      }
    ];

    const config: any = {
      systemInstruction,
      temperature: 0.5,
      tools: waiterTools
    };

    if (advanced) {
      config.thinkingConfig = {
        thinkingLevel: ThinkingLevel.HIGH
      };
    } else {
      config.maxOutputTokens = 350;
    }

    // Set headers for SSE/streaming NDJSON
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.on("error", (err: any) => {
      if (err?.code === "EPIPE" || err?.code === "ECONNRESET") return;
      console.warn("[Stream Socket Error]", err?.message || err);
    });

    const safeWrite = (data: any) => {
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(typeof data === "string" ? data : JSON.stringify(data) + "\n");
        } catch (e) {}
      }
    };

    let responseStream;
    let finalModel = modelName;

    const modelsToTry = Array.from(new Set([modelName, "gemini-3.6-flash", "gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite"]));
    let lastError: any = null;

    for (const targetModel of modelsToTry) {
      try {
        const currentConfig = targetModel === modelName ? config : {
          systemInstruction,
          temperature: 0.7,
          tools: waiterTools
        };

        responseStream = await ai.models.generateContentStream({
          model: targetModel,
          contents,
          config: currentConfig
        });

        finalModel = targetModel;
        lastError = null;
        break; // Successfully started stream
      } catch (err: any) {
        lastError = err;
        console.warn("[Gemini API] Model " + targetModel + " unavailable (" + (err?.status || err?.code || 'error') + "). Trying fallback...");
      }
    }

    if (!responseStream) {
      throw lastError || new Error("All Gemini models failed to respond.");
    }

    // Extract function calls from response while streaming chunks
    const cartActions: any[] = [];
    let noteAction: any = null;
    let reviewAction: any = null;
    let submitAction: any = null;
    let finishAction: any = null;
    let fullText = "";

    try {
      for await (const chunk of responseStream) {
        const chunkText = chunk.text || "";
        fullText += chunkText;

        const processFunctionCall = (name: string, args: any, callId?: string) => {
          if (name === "add_items_to_cart") {
            cartActions.push({ action: "add", items: args.items, callId });
          } else if (name === "remove_item_from_cart") {
            cartActions.push({ action: "remove", itemId: args.itemId, quantity: args.quantity, callId });
          } else if (name === "update_item_quantity") {
            cartActions.push({ action: "update_quantity", itemId: args.itemId, quantity: args.quantity, mode: args.mode, callId });
          } else if (name === "replace_cart_item") {
            cartActions.push({ action: "replace", oldItemId: args.oldItemId, newItemId: args.newItemId, quantity: args.quantity, customizations: args.customizations, note: args.note, callId });
          } else if (name === "add_item_note") {
            noteAction = { type: "item", itemId: args.itemId, note: args.note };
            cartActions.push({ action: "add_item_note", itemId: args.itemId, note: args.note, callId });
          } else if (name === "add_order_note") {
            noteAction = { type: "order", note: args.note };
          } else if (name === "review_order_checkout") {
            reviewAction = { action: "review" };
          } else if (name === "confirm_and_submit_order") {
            submitAction = {
              action: "submit",
              paymentMethod: args.paymentMethod || "cash",
              orderNotes: args.orderNotes || "",
              items: args.items || undefined
            };
          } else if (name === "finish_order_receipt") {
            finishAction = { action: "finish" };
          }
        };

        if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          for (const call of chunk.functionCalls) {
            processFunctionCall(call.name, call.args || {}, call.id);
          }
        }

        // Also inspect candidates for function calls
        const candidate = chunk.candidates?.[0];
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.functionCall) {
              processFunctionCall(part.functionCall.name, part.functionCall.args || {});
            }
          }
        }

        if (chunkText) {
          safeWrite({ text: chunkText, done: false });
        }
      }
    } catch (streamErr) {
      console.error("Error reading streaming chunks:", streamErr);
      safeWrite({ error: "Stream reading interrupted", done: true });
    }

    const cartAction = cartActions.length > 0 ? cartActions[cartActions.length - 1] : null;

    if (!fullText && cartAction && cartAction.action === "add") {
      // Build a clean bilingual confirmation message based on items added
      const itemNames = cartAction.items.map((item: any) => {
        const menuItem = dbMenuItems.find((m: any) => m.id === item.itemId || m.name.toLowerCase() === String(item.itemId).toLowerCase());
        return menuItem ? menuItem.name : item.itemId;
      }).join(", ");
      
      const containsArabic = messages.some((m: any) => /[\u0600-\u06FF]/.test(m.content));
      let content = "";
      if (containsArabic) {
        content = "من عيوني، تم تسجيل " + itemNames + " في طلبكم! يرجى تفقد سلتك. هل ترغبون في إضافة أي ملاحظات أو طلبات أخرى؟ 😊";
      } else {
        content = "Certainly! I've added " + itemNames + " to your order. Please check your cart! Would you like to add any special instructions or order anything else? 😊";
      }
      fullText = content;
      safeWrite({ text: content, done: false });
    } else if (!fullText && submitAction) {
      const containsArabic = messages.some((m: any) => /[\u0600-\u06FF]/.test(m.content));
      let content = "";
      if (containsArabic) {
        content = "شكراً لاختياركم Salein Cafe. تم تأكيد طلبكم وإرساله إلى المطبخ.";
      } else {
        content = "Thank you for choosing Salein Cafe. Your order has been confirmed and sent to the kitchen.";
      }
      fullText = content;
      safeWrite({ text: content, done: false });
    }

    // End stream with final metadata chunk
    safeWrite({
      text: "",
      cartActions,
      cartAction,
      noteAction,
      reviewAction,
      submitAction,
      finishAction,
      model: finalModel,
      done: true
    });
    if (!res.writableEnded) {
      res.end();
    }

  } catch (error: any) {
    console.error("AI Waiter Streaming Error after fallbacks:", error);
    if (res.headersSent) {
      try {
        res.write(JSON.stringify({ error: error.message || "Streaming error occurred", done: true }) + "\n");
        res.end();
      } catch (writeErr) {}
    } else {
      res.status(500).json({ error: error.message || "An error occurred with the AI Waiter" });
    }
  }
});

// Global cache to track if Gemini TTS model quota is exceeded
let isTtsQuotaExceeded = false;
let ttsQuotaExceededAt: number | null = null;
const TTS_RESET_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Endpoint to check status of the TTS quota cooldown
app.get("/api/gemini/tts/status", generalLimiter, (req, res) => {
  if (isTtsQuotaExceeded && ttsQuotaExceededAt) {
    const elapsed = Date.now() - ttsQuotaExceededAt;
    const remainingMs = Math.max(0, TTS_RESET_TIMEOUT_MS - elapsed);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    return res.json({
      isQuotaExceeded: true,
      remainingSeconds,
      remainingMinutes: Math.ceil(remainingSeconds / 60),
      exceededAt: new Date(ttsQuotaExceededAt).toISOString(),
    });
  }
  return res.json({ isQuotaExceeded: false });
});

// Audio Transcription Endpoint using gemini-3.5-flash
app.post("/api/gemini/transcribe", aiEndpointLimiter, express.json({ limit: "50mb" }), async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;
    if (!audioData) {
      return res.status(400).json({ error: "Audio data is required" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{
        role: "user",
        parts: [
          {
            inlineData: {
              data: audioData,
              mimeType: mimeType || "audio/webm",
            }
          },
          { text: "Transcribe the audio exactly as spoken. Reply ONLY with the transcription, nothing else." }
        ]
      }]
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Transcription Error:", error);
    res.status(500).json({ error: error.message || "Transcription failed" });
  }
});

// Text-to-Speech Endpoint with fallback to native browser SpeechSynthesis using @google/genai
app.post("/api/gemini/tts", aiEndpointLimiter, async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Text is required" });
    }

    const voiceName = voice || "Aoede"; // 'Aoede', 'Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const inlinePart = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (inlinePart?.data) {
        return res.json({
          audio: inlinePart.data,
          mimeType: inlinePart.mimeType || "audio/pcm;rate=24000",
        });
      }
    } catch (err: any) {
      console.warn("[TTS] gemini-3.1-flash-tts-preview unavailable (" + (err?.status || err?.message || "error") + "). Activating client SpeechSynthesis fallback.");
    }

    res.json({ useNative: true });
  } catch (error: any) {
    console.error("TTS Root Error:", error);
    res.json({ useNative: true });
  }
});

// Server-Side Push Notification Dispatcher (FCM & Web Push)
app.post("/api/send-push", generalLimiter, async (req, res) => {
  try {
    const type = sanitizeString(req.body.type, 50);
    const tableNumber = sanitizeString(req.body.tableNumber, 10);
    const total = typeof req.body.total === "number" ? req.body.total : Number(req.body.total) || 0;
    const requestType = sanitizeString(req.body.requestType, 100);
    const requestName = sanitizeString(req.body.requestName, 100);
    const orderId = sanitizeString(req.body.orderId, 128);
    const requestId = sanitizeString(req.body.requestId, 128);

    if (!type || !tableNumber) {
      return res.status(400).json({ error: "type and tableNumber are required." });
    }

    const isOrder = type === "order";
    const title = isOrder ? "🍽️ New Order (طلب جديد)" : "🔔 Service Request (طلب خدمة)";
    const body = isOrder
      ? `Table ${tableNumber} placed a new order. Total: ${total ? Number(total).toFixed(2) : "0.00"} JD`
      : `Table ${tableNumber} requested: ${requestName || requestType || "Waiter assistance"}`;

    const targetUrl = isOrder
      ? `/?tab=staff&view=orders${orderId ? `&orderId=${orderId}` : ""}`
      : `/?tab=staff&view=requests${requestId ? `&requestId=${requestId}` : ""}`;

    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Allowed target roles (Kitchen only gets food orders, non-kitchen gets both)
    const targetRoles = isOrder
      ? ["owner", "admin", "manager", "waiter", "staff", "kitchen"]
      : ["owner", "admin", "manager", "waiter", "staff"];

    console.log(`[PUSH] Dispatching notification [${title}]: "${body}" to roles: ${targetRoles.join(", ")}`);

    // 1. Log notification record in Firestore for offline devices queue
    if (serverDb) {
      try {
        await addDoc(collection(serverDb, "staffNotifications"), {
          notificationId,
          type,
          title,
          body,
          tableNumber,
          targetRoles,
          targetUrl,
          orderId: orderId || null,
          requestId: requestId || null,
          createdAt: Timestamp.now(),
          readBy: []
        });
      } catch (logErr) {
        console.warn("[PUSH] Failed to log notification in Firestore:", logErr);
      }
    }

    // 2. Fetch FCM Tokens from Firestore (staff_devices & fcmTokens) and attempt FCM Web Push dispatch
    let sentCount = 0;
    if (serverDb) {
      try {
        const tokensToSendSet = new Set<string>();

        // Query staff_devices
        try {
          const staffDevicesSnap = await getDocs(collection(serverDb, "staff_devices"));
          staffDevicesSnap.forEach((docSnap: any) => {
            const data = docSnap.data();
            if (data && data.token && targetRoles.includes(data.role || "staff")) {
              tokensToSendSet.add(data.token);
            }
          });
        } catch (sdErr: any) {
          const errStr = String(sdErr?.message || sdErr || "");
          if (errStr.includes("Quota limit exceeded") || errStr.includes("Quota exceeded") || errStr.includes("free daily read units") || errStr.includes("resource-exhausted")) {
            console.warn("[PUSH] Firestore quota limit reached when querying staff_devices.");
          } else {
            console.warn("[PUSH] Error querying staff_devices:", errStr);
          }
        }

        // Query fcmTokens fallback
        try {
          const fcmSnap = await getDocs(collection(serverDb, "fcmTokens"));
          fcmSnap.forEach((docSnap: any) => {
            const data = docSnap.data();
            if (data && data.token && targetRoles.includes(data.role || "staff")) {
              tokensToSendSet.add(data.token);
            }
          });
        } catch (ftErr: any) {
          const errStr = String(ftErr?.message || ftErr || "");
          if (errStr.includes("Quota limit exceeded") || errStr.includes("Quota exceeded") || errStr.includes("free daily read units") || errStr.includes("resource-exhausted")) {
            console.warn("[PUSH] Firestore quota limit reached when querying fcmTokens.");
          } else {
            console.warn("[PUSH] Error querying fcmTokens:", errStr);
          }
        }

        const tokensToSend = Array.from(tokensToSendSet);
        console.log(`[PUSH] Found ${tokensToSend.length} active FCM tokens for target roles.`);

        // Dispatch via FCM Legacy REST Endpoint if Firebase Server key is available or send Web Push payloads
        const fcmServerKey = process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY;
        if (fcmServerKey && tokensToSend.length > 0) {
          for (const token of tokensToSend) {
            try {
              const fcmRes = await fetch("https://fcm.googleapis.com/fcm/send", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `key=${fcmServerKey}`
                },
                body: JSON.stringify({
                  to: token,
                  notification: {
                    title,
                    body,
                    icon: "/logo.svg",
                    click_action: targetUrl
                  },
                  data: {
                    notificationId,
                    type,
                    title,
                    body,
                    url: targetUrl,
                    tableNumber: String(tableNumber),
                    orderId: orderId || "",
                    requestId: requestId || ""
                  },
                  priority: "high"
                })
              });
              if (fcmRes.ok) sentCount++;
            } catch (singleErr) {
              console.warn("[PUSH] Failed token dispatch:", singleErr);
            }
          }
        }
      } catch (fcmErr) {
        console.warn("[PUSH] FCM token retrieval error:", fcmErr);
      }
    }

    return res.json({
      success: true,
      notificationId,
      title,
      body,
      targetRoles,
      tokensNotified: sentCount
    });
  } catch (err: any) {
    console.error("[PUSH] Error in /api/send-push:", err);
    return res.status(500).json({ error: err.message || "Failed to dispatch push notification" });
  }
});

// Server-Side Firestore Order Logging and Validation Endpoint
app.post("/api/orders/validate-and-log", generalLimiter, async (req, res) => {
  try {
    const order = req.body;

    console.log("\n==================================================");
    console.log("   [SERVER] FIRESTORE ORDER DOCUMENT CREATION LOG");
    console.log("==================================================");
    console.log("Order ID:       " + (order.orderId || 'MISSING'));
    console.log("User ID:        " + (order.userId || 'MISSING'));
    console.log("Table Number:   " + (order.tableNumber || 'MISSING'));
    console.log("Payment Mthd:   " + (order.paymentMethod || 'MISSING'));
    console.log("Payment Status: " + (order.paymentStatus || 'MISSING'));
    console.log("Status:         " + (order.status || 'MISSING'));
    console.log("OrderStatus:    " + (order.orderStatus || 'MISSING'));
    console.log("--------------------------------------------------");
    console.log("Financial Breakdown:");
    console.log("  Subtotal:     " + order.subtotal + " JD");
    console.log("  Tax:          " + order.tax + " JD");
    console.log("  Service Fee:  " + order.serviceFee + " JD");
    console.log("  Discount:     " + order.discount + " JD");
    console.log("  TalkTablee Fee: " + order.talkTableFee + " JD");
    console.log("  Total:        " + order.total + " JD");
    console.log("--------------------------------------------------");
    console.log("Items (Count: " + (order.items?.length || 0) + "):");
    if (Array.isArray(order.items)) {
      order.items.forEach((item: any, idx: number) => {
        console.log("  [" + (idx + 1) + "] Item ID: " + item.itemId + " | Name: " + item.name + " | Price: " + item.price + " JD | Qty: " + item.quantity);
        if (item.customizations && item.customizations.length > 0) {
          console.log("      Customizations: " + JSON.stringify(item.customizations));
        }
      });
    }
    console.log("==================================================\n");

    const validationErrors: string[] = [];

    // Validate that every order contains the exact 0.05 JD 'talkTableeFee' (or 'talkTableFee') field
    const incomingTalkTableFee = order.talkTableFee !== undefined ? order.talkTableFee : order.talkTableeFee;
    if (incomingTalkTableFee !== 0.05) {
      validationErrors.push("Every order must contain the exact 0.05 JD talkTableeFee field. Received: " + incomingTalkTableFee);
    }

    // Capture and delete taxRate from order before processing to keep exactly 17 keys for Firestore rules
    const taxRateRaw = order.taxRate !== undefined ? order.taxRate : 0;
    let taxRate = typeof taxRateRaw === "number" ? taxRateRaw : 0;
    if (taxRate > 1) {
      taxRate = taxRate / 100; // convert 16 to 0.16
    }

    // Ignore client-provided total or fee/tax values to strictly calculate on server
    if (order) {
      delete (order as any).talkTableFee;
      delete (order as any).talkTableeFee;
      delete (order as any).taxRate;
      delete (order as any).total;
      delete (order as any).tax;
      delete (order as any).serviceFee;
      delete (order as any).discount;
    }

    // Ensure there are no type mismatches between local cart items and Firestore schema
    if (!Array.isArray(order.items)) {
      validationErrors.push("items must be an array");
    } else {
      order.items.forEach((item: any, idx: number) => {
        if (typeof item.itemId !== "string") validationErrors.push("Item[" + idx + "].itemId must be a string");
        if (typeof item.name !== "string") validationErrors.push("Item[" + idx + "].name must be a string");
        if (typeof item.quantity !== "number" || item.quantity <= 0) validationErrors.push("Item[" + idx + "].quantity must be a positive number");
        if (typeof item.price !== "number" || item.price < 0) validationErrors.push("Item[" + idx + "].price must be a non-negative number");
        if (item.customizations && !Array.isArray(item.customizations)) {
          validationErrors.push("Item[" + idx + "].customizations must be an array");
        }
      });
    }

    // 1. Recalculate subtotal and unit prices server-side using trusted menu data
    let recalculatedSubtotal = 0;
    const liveItems = await getLiveServerMenuItems();
    const combinedMap = new Map();
    MENU_ITEMS.forEach(item => combinedMap.set(item.id.toLowerCase(), item));
    if (Array.isArray(liveItems)) {
      liveItems.forEach(item => combinedMap.set((item.id || item.itemId || "").toString().toLowerCase(), item));
    }
    const menuLookup = Array.from(combinedMap.values());

    if (Array.isArray(order.items)) {
      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];
        const cleanId = (item.itemId || "").toString().trim().toLowerCase();
        const cleanName = (item.name || "").toString().trim().toLowerCase();

        let menuItem = menuLookup.find(m => 
          m.id.toString().trim().toLowerCase() === cleanId ||
          m.name.toString().trim().toLowerCase() === cleanName ||
          (m.nameAr && m.nameAr.toString().trim().toLowerCase() === cleanName)
        );

        if (!menuItem) {
          // Fallback fuzzy search by name or base product
          const cleanItemName = cleanName.replace(/sandwich|sandwhich|meal/gi, "").trim().toLowerCase();
          menuItem = menuLookup.find(m => 
            cleanItemName.length > 2 && m.name.toString().trim().toLowerCase().includes(cleanItemName)
          );
        }

        if (!menuItem) {
          validationErrors.push(`Item [${idx + 1}] '${item.name}' (ID: ${item.itemId}) not found in authoritative menu.`);
          continue;
        }

        // Validate meal vs sandwich category & metadata differentiation
        const isMealRequested = cleanName.includes("meal") ||
          (item.category && item.category.toLowerCase() === "meals") ||
          JSON.stringify(item.customizations || []).toLowerCase().includes("meal");

        const isSandwichRequested = cleanName.includes("sandwich") ||
          (item.category && item.category.toLowerCase() === "sandwiches") ||
          JSON.stringify(item.customizations || []).toLowerCase().includes("sandwich");

        const isMenuMeal = menuItem.category.toLowerCase() === "meals" ||
          menuItem.id.toLowerCase().endsWith("-meal") ||
          menuItem.name.toLowerCase().includes("meal");

        const isMenuSandwich = menuItem.category.toLowerCase() === "sandwiches" ||
          menuItem.id.toLowerCase().endsWith("-sandwich") ||
          menuItem.name.toLowerCase().includes("sandwich");

        if (isMealRequested && !isMenuMeal && !JSON.stringify(item.customizations || []).toLowerCase().includes("meal")) {
          // Attempt to find the real meal variant in menuLookup
          const baseDish = (menuItem.baseProduct || menuItem.name.replace(/sandwich|sandwhich|meal/gi, "")).trim().toLowerCase();
          const cleanItemName = cleanName.replace(/sandwich|sandwhich|meal/gi, "").trim().toLowerCase();

          const mealVariant = menuLookup.find(m =>
            m.id !== menuItem.id &&
            (m.category.toLowerCase() === "meals" || m.id.toLowerCase().endsWith("-meal")) && (
              m.name.toLowerCase() === cleanName ||
              m.id.toLowerCase() === cleanId.replace(/-sandwich$/, "") + "-meal" ||
              m.id.toLowerCase() === cleanId + "-meal" ||
              (menuItem.baseProduct && m.baseProduct && m.baseProduct.toLowerCase() === menuItem.baseProduct.toLowerCase()) ||
              (baseDish && m.name.toLowerCase().includes(baseDish)) ||
              (cleanItemName && m.name.toLowerCase().includes(cleanItemName))
            )
          );
          if (mealVariant) {
            item.itemId = mealVariant.id;
            item.name = mealVariant.name;
            item.category = mealVariant.category;
            item.price = mealVariant.price;
            menuItem = mealVariant;
          } else {
            // Dynamically adapt sandwich item to Meal variant (+1.25 JD meal upgrade)
            item.itemId = menuItem.id.endsWith("-sandwich") ? menuItem.id.replace(/-sandwich$/, "-meal") : `${menuItem.id}-meal`;
            item.name = menuItem.name.toLowerCase().includes("meal") ? menuItem.name : `${menuItem.name} Meal`;
            item.category = "Meals";
            item.price = Number((menuItem.price + 1.25).toFixed(2));
          }
        } else if (isSandwichRequested && !isMenuSandwich && isMenuMeal && !JSON.stringify(item.customizations || []).toLowerCase().includes("sandwich")) {
          const baseDish = (menuItem.baseProduct || menuItem.name.replace(/sandwich|sandwhich|meal/gi, "")).trim().toLowerCase();
          const cleanItemName = cleanName.replace(/sandwich|sandwhich|meal/gi, "").trim().toLowerCase();

          const swVariant = menuLookup.find(m =>
            m.id !== menuItem.id &&
            (m.category.toLowerCase() === "sandwiches" || m.id.toLowerCase().endsWith("-sandwich")) && (
              m.name.toLowerCase() === cleanName ||
              m.id.toLowerCase() === cleanId.replace(/-meal$/, "") + "-sandwich" ||
              m.id.toLowerCase() === cleanId.replace(/-meal$/, "") ||
              (menuItem.baseProduct && m.baseProduct && m.baseProduct.toLowerCase() === menuItem.baseProduct.toLowerCase()) ||
              (baseDish && m.name.toLowerCase().includes(baseDish)) ||
              (cleanItemName && m.name.toLowerCase().includes(cleanItemName))
            )
          );
          if (swVariant) {
            item.itemId = swVariant.id;
            item.name = swVariant.name;
            item.category = swVariant.category;
            item.price = swVariant.price;
            menuItem = swVariant;
          } else {
            // Dynamically adapt meal item to Sandwich variant
            item.itemId = menuItem.id.endsWith("-meal") ? menuItem.id.replace(/-meal$/, "-sandwich") : `${menuItem.id}-sandwich`;
            item.name = menuItem.name.replace(/\s*meal/gi, " Sandwich").trim();
            if (!item.name.toLowerCase().includes("sandwich")) item.name += " Sandwich";
            item.category = "Sandwiches";
            item.price = Number(Math.max(1.00, menuItem.price - 1.25).toFixed(2));
          }
        } else {
          // Strictly force unit price to match authoritative menu price
          let unitPrice = menuItem.price;
          if (Array.isArray(item.customizations)) {
            item.customizations.forEach((cust: any) => {
              if (cust.selected && Array.isArray(cust.selected)) {
                cust.selected.forEach((sel: string) => {
                  const custOpt = menuItem.customizations?.find(c => c.title === cust.title);
                  const opt = custOpt?.options?.find(o => o.name.toLowerCase() === sel.toLowerCase());
                  if (opt && typeof opt.priceModifier === "number") {
                    unitPrice += opt.priceModifier;
                  }
                });
              }
            });
          }
          unitPrice = Number(unitPrice.toFixed(2));
          if (Math.abs((item.price || 0) - unitPrice) > 0.01) {
            console.warn(`[SERVER VALIDATION] Correcting unit price for '${item.name}': was ${item.price} JD, set to authoritative ${unitPrice} JD.`);
            item.price = unitPrice;
          }
        }

        item.category = menuItem.category;
        recalculatedSubtotal += item.price * (item.quantity || 1);
      }
    }

    recalculatedSubtotal = Number(recalculatedSubtotal.toFixed(2));
    order.subtotal = recalculatedSubtotal;

    // Ensure tableNumber is formatted as a valid string <= 10 characters
    if (typeof order.tableNumber === "number") {
      order.tableNumber = String(order.tableNumber);
    }
    if (typeof order.tableNumber !== "string" || !order.tableNumber || order.tableNumber.trim().length === 0 || order.tableNumber.length > 10) {
      order.tableNumber = "12"; // Default fallback
    }

    // Ensure status and orderStatus are 'New'
    order.status = "New";
    order.orderStatus = "New";

    // Ensure paymentMethod and paymentStatus
    if (!order.paymentMethod || (order.paymentMethod !== "card" && order.paymentMethod !== "cash")) {
      order.paymentMethod = "cash";
    }
    order.paymentStatus = "pending";

    // Enforce 0% tax rate for Salein Cafe (no sales tax, no VAT)
    order.tax = 0;
    order.serviceFee = 0;
    order.discount = 0;
    order.talkTableFee = 0.05;

    // Strictly compute the order total on the server: Total = Sum of Menu Item Prices + 0.05 TalkTable fee
    order.total = Number((recalculatedSubtotal + 0.05).toFixed(2));

    // Recalculate loyalty points earned based on the new total
    order.pointsEarned = Math.floor(order.total) * 10;

    if (!order.userId) order.userId = "guest_voice_user";
    if (!order.createdAt) order.createdAt = new Date().toISOString();
    if (!order.updatedAt) order.updatedAt = new Date().toISOString();

    // Validate other Firestore schema fields (17 keys total check for rules compatibility)
    const expectedKeys = [
      'orderId', 'userId', 'tableNumber', 'items', 'subtotal', 'tax', 
      'serviceFee', 'discount', 'talkTableFee', 'total', 'status', 
      'orderStatus', 'paymentStatus', 'paymentMethod', 'pointsEarned', 
      'createdAt', 'updatedAt'
    ];
    
    const actualKeys = Object.keys(order);
    const hasAllKeys = expectedKeys.every(k => actualKeys.includes(k));
    if (!hasAllKeys) {
      const missing = expectedKeys.filter(k => !actualKeys.includes(k));
      for (const mKey of missing) {
        if (mKey === 'tax' || mKey === 'serviceFee' || mKey === 'discount') order[mKey] = 0;
        if (mKey === 'talkTableFee') order[mKey] = 0.05;
        if (mKey === 'status' || mKey === 'orderStatus') order[mKey] = "New";
        if (mKey === 'paymentStatus') order[mKey] = "pending";
        if (mKey === 'paymentMethod') order[mKey] = "cash";
        if (mKey === 'pointsEarned') order[mKey] = 0;
      }
    }

    if (validationErrors.length > 0) {
      console.error("[SERVER] Validation FAILED for Order " + (order.orderId || 'unknown') + ":", validationErrors);
      return res.status(400).json({ success: false, errors: validationErrors });
    }

    console.log("[SERVER] Validation PASSED for Order " + order.orderId + ". Recalculated total: " + order.total);
    return res.json({ success: true, order });
  } catch (err: any) {
    console.error("[SERVER] Order Validation Error:", err);
    return res.status(500).json({ success: false, errors: [err.message || "Internal server validation error"] });
  }
});

// AI Waiter Order Summarization & Extraction Endpoint
app.post("/api/gemini/summarize-order", aiEndpointLimiter, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    // Filter messages to avoid massive overhead, keep only non-error/user/assistant messages
    const validMessages = messages.filter((m: any) => m.role === "user" || m.role === "assistant");
    
    const contents = validMessages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: [{ text: m.content }]
    }));

    // Add instructions for structured order extraction
    contents.push({
      role: "user",
      parts: [{
        text: "You are the billing and order receipt compiler for the luxurious \"Salein Cafe\".\n" +
          "Analyze the entire conversation above between the AI Waiter and the guest. Extract all food and drink items that the guest has explicitly confirmed or agreed they wanted to order.\n\n" +
          "Reference Menu:\n" +
          JSON.stringify(MENU_ITEMS.map(item => ({ id: item.id, name: item.name, price: item.price }))) + "\n\n" +
          "For each confirmed ordered item:\n" +
          "1. Provide the exact itemId from the reference menu (e.g. 'co-1' for Artisanal Spanish Latte, 'br-1' for Truffle Scrambled Avocado Toast).\n" +
          "2. Provide the item's standard name and price in JD (Jordanian Dinar) from the reference menu.\n" +
          "3. Determine the correct quantity ordered.\n" +
          "4. Extract an array of customizations selected (e.g., ['Oat Milk', 'Grande']).\n\n" +
          "Respond strictly with a JSON object containing:\n" +
          "- items: array of items ordered\n" +
          "- summaryTextEn: a friendly English summary thanking the user\n" +
          "- summaryTextAr: a friendly Jordanian Arabic summary (\"صحتين وعافية مقدمًا...\") thanking the user\n\n" +
          "If NO items were actually ordered, return an empty \"items\" array."
      }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              description: "The list of confirmed items ordered.",
              items: {
                type: Type.OBJECT,
                properties: {
                  itemId: { type: Type.STRING, description: "Matching ID from the menu." },
                  name: { type: Type.STRING, description: "Name of the item." },
                  quantity: { type: Type.INTEGER, description: "Quantity ordered." },
                  price: { type: Type.NUMBER, description: "Price of the item." },
                  customizations: {
                    type: Type.ARRAY,
                    description: "Customizations or choices selected.",
                    items: { type: Type.STRING }
                  }
                },
                required: ["itemId", "name", "quantity", "price"]
              }
            },
            summaryTextEn: {
              type: Type.STRING,
              description: "A short, beautiful English summary."
            },
            summaryTextAr: {
              type: Type.STRING,
              description: "A short, beautiful Jordanian Arabic summary."
            }
          },
          required: ["items", "summaryTextEn", "summaryTextAr"]
        }
      }
    });

    const jsonStr = response.text || "{}";
    const parsedData = JSON.parse(jsonStr);
    res.json(parsedData);
  } catch (error: any) {
    console.error("Summarize Order Error:", error);
    res.status(500).json({ error: error.message || "Failed to compile order summary" });
  }
});

// --- WEBSOCKET SERVER FOR LIVE API (REAL-TIME VOICE CONVERSATION) ---

const wss = new WebSocketServer({ noServer: true });

let globalActiveClientWs: WebSocket | null = null;
let globalActiveLiveSession: any = null;

wss.on("connection", async (clientWs: WebSocket, request: any) => {
  // Enforce single active voice session globally
  if (globalActiveClientWs && globalActiveClientWs !== clientWs && globalActiveClientWs.readyState === WebSocket.OPEN) {
    console.log("[Live API] New connection received. Closing previous active session to enforce single concurrency.");
    try {
      globalActiveClientWs.send(JSON.stringify({ interrupted: true, error: "Session superseded by another table." }));
      globalActiveClientWs.close();
    } catch (e) {}
    if (globalActiveLiveSession && typeof globalActiveLiveSession.close === 'function') {
      try {
        globalActiveLiveSession.close();
      } catch (e) {}
    }
  }

  globalActiveClientWs = clientWs;
  
  clientWs.on("error", (err) => {
    console.warn("[Live API] Client WebSocket connection error:", err?.message || err);
  });
  const reqUrl = request && request.url ? new URL(request.url, "http://" + (request.headers?.host || 'localhost')) : null;
  const tableNumber = reqUrl ? reqUrl.searchParams.get("table") || "12" : "12";
  const voiceName = reqUrl ? reqUrl.searchParams.get("voice") || "Aoede" : "Aoede";
  const cartParam = reqUrl ? reqUrl.searchParams.get("cart") : null;
  let currentCart: any[] = [];
  if (cartParam) {
    try {
      currentCart = JSON.parse(cartParam);
    } catch (e) {}
  }
  const orderNotes = reqUrl ? reqUrl.searchParams.get("notes") || "" : "";
  console.log("Client connected to Live API Bridge for Table " + tableNumber + " with voice " + voiceName);
  let liveSession: any = null;

  try {
    const systemInstruction = getSystemInstruction(tableNumber, currentCart, orderNotes);
    liveSession = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
        systemInstruction,
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        tools: [
          {
            functionDeclarations: [
              {
                name: "add_items_to_cart",
                description: "Add one or more items to the customer's cart.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    items: {
                      type: Type.ARRAY,
                      description: "The list of items to add to the cart.",
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          itemId: { type: Type.STRING, description: "The ID or name of the menu item." },
                          quantity: { type: Type.INTEGER, description: "The quantity to add." },
                          customizations: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                          },
                          note: { type: Type.STRING, description: "Item-specific special instruction." }
                        },
                        required: ["itemId", "quantity"]
                      }
                    }
                  },
                  required: ["items"]
                }
              },
              {
                name: "remove_item_from_cart",
                description: "Remove an item from the cart, or reduce its quantity.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    itemId: { type: Type.STRING, description: "Item ID or name to remove." },
                    quantity: { type: Type.INTEGER, description: "Optional quantity to remove." }
                  },
                  required: ["itemId"]
                }
              },
              {
                name: "update_item_quantity",
                description: "Update the quantity of an item in the cart.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    itemId: { type: Type.STRING, description: "Item ID or name." },
                    quantity: { type: Type.INTEGER, description: "Target quantity." },
                    mode: { type: Type.STRING, description: "'set', 'increase', or 'decrease'." }
                  },
                  required: ["itemId", "quantity"]
                }
              },
              {
                name: "replace_cart_item",
                description: "Replace an existing cart item with a new menu item (e.g., Sandwich to Meal conversion).",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    oldItemId: { type: Type.STRING, description: "Item ID or name currently in cart to replace." },
                    newItemId: { type: Type.STRING, description: "New menu item ID or name." },
                    quantity: { type: Type.INTEGER, description: "Optional quantity." },
                    customizations: { type: Type.ARRAY, items: { type: Type.STRING } },
                    note: { type: Type.STRING, description: "Optional note for new item." }
                  },
                  required: ["oldItemId", "newItemId"]
                }
              },
              {
                name: "add_item_note",
                description: "Attach a note or special instruction to a specific item.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    itemId: { type: Type.STRING, description: "Item ID or name." },
                    note: { type: Type.STRING, description: "Special instruction for item." }
                  },
                  required: ["itemId", "note"]
                }
              },
              {
                name: "add_order_note",
                description: "Attach an overall note for the entire order.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    note: { type: Type.STRING, description: "Order-wide special instruction." }
                  },
                  required: ["note"]
                }
              },
              {
                name: "undo_last_cart_action",
                description: "Undo the previous cart mutation and restore the previous cart state (e.g. when customer says 'undo that', 'actually put it back', 'تراجع', 'رجع السلة')."
              },
              {
                name: "review_order_checkout",
                description: "Summarize order and start checkout review."
              },
              {
                name: "confirm_and_submit_order",
                description: "Confirm and submit final order to kitchen after explicit user confirmation.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    paymentMethod: { type: Type.STRING, description: "'cash' or 'card'" },
                    orderNotes: { type: Type.STRING, description: "Order notes" }
                  }
                }
              }
            ]
          }
        ]
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ audio }));
          }

          // Real-time words: Extract and stream model transcription
          const modelParts = message.serverContent?.modelTurn?.parts;
          if (modelParts && clientWs.readyState === WebSocket.OPEN) {
            for (const part of modelParts) {
              if (part.text) {
                clientWs.send(JSON.stringify({ modelText: part.text }));
              }
            }
          }

          // Real-time words: Extract and stream user transcription
          const userParts = (message.serverContent as any)?.userTurn?.parts;
          if (userParts && clientWs.readyState === WebSocket.OPEN) {
            for (const part of userParts) {
              if (part.text) {
                clientWs.send(JSON.stringify({ userText: part.text }));
              }
            }
          }

          if (message.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }

          // Handle real-time function calling (toolCall) from live voice session
          if (message.toolCall?.functionCalls) {
            for (const call of message.toolCall.functionCalls) {
              const name = call.name;
              const args = call.args as any;
              console.log("[LIVE API] Model triggered function call:", name, args);

              let payload: any = null;
              if (name === "add_items_to_cart") {
                payload = { cartAction: { action: "add", items: args.items, callId: call.id }, callId: call.id, name };
              } else if (name === "remove_item_from_cart") {
                payload = { cartAction: { action: "remove", itemId: args.itemId, quantity: args.quantity, callId: call.id }, callId: call.id, name };
              } else if (name === "update_item_quantity") {
                payload = { cartAction: { action: "update_quantity", itemId: args.itemId, quantity: args.quantity, mode: args.mode, callId: call.id }, callId: call.id, name };
              } else if (name === "replace_cart_item") {
                payload = { cartAction: { action: "replace", oldItemId: args.oldItemId, newItemId: args.newItemId, quantity: args.quantity, customizations: args.customizations, note: args.note, callId: call.id }, callId: call.id, name };
              } else if (name === "add_item_note") {
                payload = { noteAction: { type: "item", itemId: args.itemId, note: args.note }, cartAction: { action: "add_item_note", itemId: args.itemId, note: args.note, callId: call.id }, callId: call.id, name };
              } else if (name === "add_order_note") {
                payload = { noteAction: { type: "order", note: args.note }, callId: call.id, name };
              } else if (name === "undo_last_cart_action") {
                payload = { cartAction: { action: "undo", callId: call.id }, callId: call.id, name };
              } else if (name === "review_order_checkout") {
                payload = { reviewAction: { action: "review" }, callId: call.id, name };
              } else if (name === "confirm_and_submit_order") {
                payload = { submitAction: { action: "submit", paymentMethod: args.paymentMethod || "cash", orderNotes: args.orderNotes || "", items: args.items || undefined }, callId: call.id, name };
              }

              if (payload && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(payload));
              }

              // Instead of responding immediately, we wait for the client to send the toolResponse.
              // If the payload is somehow empty or unhandled, we send an error response immediately.
              if (!payload) {
                try {
                  liveSession.sendToolResponse({
                    functionResponses: [{
                      id: call.id,
                      name: call.name,
                      response: { output: { error: "Unknown or unhandled tool call" } }
                    }]
                  });
                } catch (err) {}
              }
            }
          }
        },
      },
    });
    
    globalActiveLiveSession = liveSession;
    console.log("Live session setup complete for table " + tableNumber);

    clientWs.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: payload.audio, mimeType: "audio/pcm;rate=16000" },
          });
        }

        if (payload.clientContent && liveSession) {
          try {
            console.log("[LIVE API] Forwarding clientContent from client:", payload.clientContent);
            liveSession.sendClientContent({
              turns: [{
                role: "user",
                parts: [{ text: payload.clientContent }]
              }],
              turnComplete: true
            });
          } catch (sendErr) {
            console.error("Error sending clientContent to live API:", sendErr);
          }
        }
        
        if (payload.toolResponse && liveSession) {
          try {
            console.log("[LIVE API] Forwarding tool response from client:", payload.toolResponse);
            liveSession.sendToolResponse({
              functionResponses: [payload.toolResponse]
            });
          } catch (sendErr) {
            console.error("Error sending forwarded tool response to live API:", sendErr);
          }
        }
      } catch (err) {
        console.error("Error parsing websocket client data:", err);
      }
    });

    clientWs.on("close", () => {
      console.log("Client disconnected from Live API Bridge for Table " + tableNumber);
      if (globalActiveClientWs === clientWs) {
        globalActiveClientWs = null;
        globalActiveLiveSession = null;
      }
      if (liveSession) {
        try {
          // Close liveSession if close method exists
          if (typeof liveSession.close === 'function') {
            liveSession.close();
          }
        } catch (e) {
          console.error("Error closing live session:", e);
        }
      }
    });
  } catch (error) {
    console.error("Failed to connect to Gemini Live API:", error);
    clientWs.send(JSON.stringify({ error: "Gemini Live API connection failed" }));
    clientWs.close();
  }
});

// Upgrade HTTP server to support WebSocket on /api/live
server.on("upgrade", (request, socket, head) => {
  const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "";
  if (pathname === "/api/live" || pathname === "/live") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// --- SECURE LIFETIME TALKTABLEEE FEES RESET ENDPOINT ---
app.post("/api/reset-lifetime-fees", sensitiveAdminLimiter, async (req, res) => {
  try {
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const adminName = sanitizeString(req.body.adminName, 100) || "Authorized Administrator";
    const expectedPassword = process.env.RESET_PASSWORD || "WAM123reset";

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    if (!safeCompareStrings(password, expectedPassword)) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    if (!serverDb) {
      return res.status(500).json({ error: "Server database connection is not available" });
    }

    // 1. Fetch current setting to log previous lifetime total
    const settingsRef = doc(serverDb, "settings", "restaurant");
    const settingsSnap = await getDoc(settingsRef);
    let previousLifetimeTotal = 0.0;
    if (settingsSnap.exists()) {
      previousLifetimeTotal = Number(settingsSnap.data().totalTalkTableFees || 0);
    }

    // 2. Perform the reset to 0.00 JD
    await updateDoc(settingsRef, {
      totalTalkTableFees: 0.0,
      updatedAt: Timestamp.now()
    });

    // 3. Create a tamper-proof audit log record (validated by security rules)
    const auditLogsRef = collection(serverDb, "auditLogs");
    const auditRecord = {
      action: "RESET_LIFETIME_FEES",
      timestamp: Timestamp.now(),
      authorizedAdmin: adminName,
      restaurantId: "restaurant",
      previousLifetimeTotal: previousLifetimeTotal,
      newLifetimeTotal: 0.0,
      details: "Lifetime TalkTableee Fee total was successfully reset to 0.00 JD by authorized administrator: " + adminName + "."
    };
    await addDoc(auditLogsRef, auditRecord);

    console.log("[SERVER] Lifetime TalkTableee Fees reset successfully by " + adminName + ". Previous: " + previousLifetimeTotal + " JD");

    return res.json({
      success: true,
      previousLifetimeTotal,
      newLifetimeTotal: 0.0
    });
  } catch (err: any) {
    console.error("[SERVER] Error resetting lifetime fees:", err);
    return res.status(500).json({ error: err.message || "An unexpected error occurred on the server." });
  }
});

// --- SECURE RESET PASSWORD VERIFICATION HELPER ---
app.post("/api/verify-reset-password", sensitiveAdminLimiter, (req, res) => {
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const expectedPassword = process.env.RESET_PASSWORD || "WAM123reset";

  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  if (safeCompareStrings(password, expectedPassword)) {
    return res.json({ success: true });
  } else {
    return res.status(401).json({ error: "Incorrect password." });
  }
});

// --- VITE MIDDLEWARE SETUP ---

async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on http://localhost:" + PORT);
  });
}

initServer();
