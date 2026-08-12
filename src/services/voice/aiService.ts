import { CartOrderService, ToolCartItem } from "./cartOrderService";
import { CartItem } from "../../types";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  isStreaming?: boolean;
}

export interface AIServiceCallbacks {
  onTextChunk?: (chunk: string, fullText: string) => void;
  onCartAction?: (items: CartItem[]) => void;
  onModifyCartAction?: (action: {
    action: 'remove' | 'update_quantity' | 'replace' | 'add_item_note';
    itemId?: string;
    oldItemId?: string;
    newItemId?: string;
    quantity?: number;
    mode?: 'set' | 'increase' | 'decrease';
    customizations?: any;
    note?: string;
  }) => void;
  onNoteAction?: (note: { type: 'item' | 'order'; itemId?: string; note: string }) => void;
  onReviewAction?: () => void;
  onSubmitAction?: (submit: { paymentMethod?: 'cash' | 'card'; orderNotes?: string; items?: any[] }) => void;
  onFinishOrderAction?: () => void;
  onError?: (error: string) => void;
  onComplete?: (fullText: string) => void;
}

export class AIService {
  /**
   * Send text prompt to server AI waiter endpoint and receive streamed response with function calling support.
   * Supports AbortSignal for immediate stream cancellation.
   */
  public static async sendMessage(
    messages: Message[],
    tableNumber: string,
    callbacks: AIServiceCallbacks,
    signal?: AbortSignal,
    responseId?: string,
    cart?: CartItem[],
    orderNotes?: string
  ): Promise<string> {
    const currentResponseId = responseId || `req_${Date.now()}`;
    console.log(`[VoicePipeline] API request started (ID: ${currentResponseId})`);

    try {
      let res: Response | null = null;
      let attempt = 0;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        try {
          attempt++;
          res = await fetch("/api/gemini/waiter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: messages.map((m) => ({ role: m.role, content: m.content })),
              tableNumber,
              cart: cart || [],
              orderNotes: orderNotes || "",
            }),
            signal,
          });

          if (res.ok) break;

          if (attempt < maxAttempts && res.status >= 500) {
            console.warn(`[AIService] Server returned ${res.status}. Retrying attempt ${attempt + 1}...`);
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }

          throw new Error(`AI waiter server error (${res.status})`);
        } catch (err: any) {
          if (signal?.aborted || err.name === "AbortError") throw err;
          if (attempt < maxAttempts) {
            console.warn(`[AIService] Network request failed on attempt ${attempt}. Retrying...`, err);
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }
          throw err;
        }
      }

      if (!res || !res.ok) {
        throw new Error(`AI waiter server error (${res?.status || 500})`);
      }

      if (!res.body) {
        throw new Error("No response body received from AI waiter endpoint");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (signal?.aborted) {
          console.log(`[VoicePipeline] API request aborted mid-stream (ID: ${currentResponseId})`);
          return fullText;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            if (data.error) {
              callbacks.onError?.(data.error);
              return fullText;
            }

            if (data.text) {
              fullText += data.text;
              callbacks.onTextChunk?.(data.text, fullText);
            }

            const actions = data.cartActions && Array.isArray(data.cartActions) ? data.cartActions : (data.cartAction ? [data.cartAction] : []);
            for (const action of actions) {
              const actionId = data.actionId || action.id || action.callId;
              if (!actionId || !CartOrderService.isDuplicateAction(actionId)) {
                if (action.action === "add" && action.items) {
                  const processedItems = CartOrderService.processToolCartItems(action.items);
                  if (processedItems.length > 0) {
                    callbacks.onCartAction?.(processedItems);
                  }
                } else if (
                  action.action === "remove" ||
                  action.action === "update_quantity" ||
                  action.action === "replace" ||
                  action.action === "add_item_note"
                ) {
                  callbacks.onModifyCartAction?.(action);
                }
              }
            }

            if (data.noteAction) {
              callbacks.onNoteAction?.(data.noteAction);
            }

            if (data.reviewAction) {
              callbacks.onReviewAction?.();
            }

            if (data.submitAction) {
              callbacks.onSubmitAction?.(data.submitAction);
            }

            if (data.finishAction) {
              callbacks.onFinishOrderAction?.();
            }
          } catch (e) {
            console.warn("[AIService] Non-JSON stream chunk received:", line);
          }
        }
      }

      console.log(`[VoicePipeline] API request finished (ID: ${currentResponseId})`);
      if (!signal?.aborted) {
        callbacks.onComplete?.(fullText);
      }
      return fullText;
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) {
        console.log(`[VoicePipeline] API request cancelled via AbortSignal (ID: ${currentResponseId})`);
        return "";
      }
      console.error("[AIService] Error communicating with AI waiter:", err);
      callbacks.onError?.(err.message || "Failed to reach AI waiter");
      return "";
    }
  }

  /**
   * Summarize conversation and extract receipt/order items
   */
  public static async summarizeOrder(messages: Message[]): Promise<{
    items: any[];
    summaryTextEn: string;
    summaryTextAr: string;
  }> {
    try {
      const res = await fetch("/api/gemini/summarize-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error("[AIService] Error summarizing order receipt:", err);
    }

    return {
      items: [],
      summaryTextEn: "Thank you for dining with us at Salein Cafe!",
      summaryTextAr: "شكراً لزيارتكم سالين كافيه! صحتين وعافية مقدمًا.",
    };
  }
}
