import { CartItem, Order, OrderItem, RESTAURANT_ID } from "../../types";
import { MENU_ITEMS, getItemImage } from "../../data/menu";
import { MenuService } from "./menuService";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { collection, doc, setDoc, getDoc, getDocs, query, where, Timestamp } from "firebase/firestore";
import { dispatchPushNotification } from "../../lib/fcm";
import { safeLocalStorage } from "../../utils/safeStorage";

export interface ToolCartItem {
  itemId: string;
  quantity: number;
  customizations?: string[] | { title: string; selected: string[] }[];
  note?: string;
}

// In-memory cache for order deduplication within 10 seconds
const recentSubmissions = new Map<string, { order: Order; timestamp: number }>();
let activeSubmissionPromise: Promise<any> | null = null;
const processedToolActionIds = new Set<string>();

// Cart history stack for undo support (Test Case F)
const cartHistoryStack: CartItem[][] = [];

export class CartOrderService {
  /**
   * Save a snapshot of the current cart before applying mutations
   */
  public static saveCartSnapshot(cart: CartItem[]): void {
    if (!cart) return;
    try {
      cartHistoryStack.push(JSON.parse(JSON.stringify(cart)));
      if (cartHistoryStack.length > 15) {
        cartHistoryStack.shift();
      }
    } catch (e) {
      console.warn("[CartOrderService] Failed to save cart snapshot:", e);
    }
  }

  /**
   * Undo the last cart mutation and restore the previous cart state
   */
  public static undoLastCartAction(currentCart: CartItem[]): { restoredCart: CartItem[]; success: boolean; message: string } {
    if (cartHistoryStack.length === 0) {
      return {
        restoredCart: currentCart,
        success: false,
        message: "No previous action to undo."
      };
    }
    const restoredCart = cartHistoryStack.pop() || currentCart;
    return {
      restoredCart: this.normalizeCartItems(restoredCart),
      success: true,
      message: "Successfully undone last cart action."
    };
  }

  /**
   * Deduplication check for voice/tool action IDs to prevent duplicate additions on retry
   */
  public static isDuplicateAction(actionId?: string): boolean {
    if (!actionId) return false;
    if (processedToolActionIds.has(actionId)) {
      console.log(`[CartOrderService] Duplicate action '${actionId}' detected and skipped.`);
      return true;
    }
    processedToolActionIds.add(actionId);
    if (processedToolActionIds.size > 200) {
      const first = processedToolActionIds.values().next().value;
      if (first) processedToolActionIds.delete(first);
    }
    return false;
  }
  /**
   * Helper to match an item in cart by cart item ID, menu item ID, or English/Arabic name
   */
  public static findCartItemIndex(cart: CartItem[], targetIdentifier: string, customizationsFilter?: string[]): number {
    if (!cart || cart.length === 0 || !targetIdentifier) return -1;
    const cleanId = targetIdentifier.trim().toLowerCase();

    // Natural pronouns & ordinals
    if (cleanId === "it" || cleanId === "that" || cleanId === "this" || cleanId === "هاد" || cleanId === "هذا" || cleanId === "هذان" || cleanId === "the item" || cleanId === "item") {
      return cart.length - 1;
    }
    if (cleanId === "first" || cleanId === "first item" || cleanId === "1st" || cleanId === "الأول" || cleanId === "الاول") {
      return 0;
    }
    if (cleanId === "second" || cleanId === "second item" || cleanId === "2nd" || cleanId === "الثاني") {
      return cart.length > 1 ? 1 : 0;
    }
    if (cleanId === "third" || cleanId === "third item" || cleanId === "3rd" || cleanId === "الثالث") {
      return cart.length > 2 ? 2 : 0;
    }
    if (cleanId === "last" || cleanId === "last item" || cleanId === "الأخير" || cleanId === "الاخير") {
      return cart.length - 1;
    }

    // 1. Check exact cart ID match
    let exactCartIdx = cart.findIndex((i) => i.id.toLowerCase() === cleanId);
    if (exactCartIdx !== -1) return exactCartIdx;

    // 2. Check exact menuItemId match
    let exactItemIdx = cart.findIndex((i) => i.itemId.toLowerCase() === cleanId);
    if (exactItemIdx !== -1) return exactItemIdx;

    // 3. Resolve target against MenuService
    const resolvedRes = MenuService.resolveMenuItem(targetIdentifier);
    const menuItem = resolvedRes.item || MenuService.getItemByName(targetIdentifier) || MenuService.getItemById(targetIdentifier);
    const targetMenuItemId = menuItem?.id;

    // Precalculate opposite variant & normalized dish query for target item
    const oppSandwich = menuItem ? MenuService.findOppositeVariant(menuItem, 'sandwich') : null;
    const oppMeal = menuItem ? MenuService.findOppositeVariant(menuItem, 'meal') : null;
    const oppItem = oppSandwich?.foundItem || oppMeal?.foundItem;
    const targetDishName = menuItem ? MenuService.normalizeDishQuery(menuItem.name) : MenuService.normalizeDishQuery(targetIdentifier);

    // 4. Calculate score for each cart item
    const scored = cart.map((item, index) => {
      let score = 0;
      const itemNameLower = item.name.toLowerCase();
      const itemIdLower = item.itemId.toLowerCase();

      if (targetMenuItemId && item.itemId === targetMenuItemId) {
        score += 500;
      }
      if (oppItem && item.itemId === oppItem.id) {
        score += 350;
      }
      if (itemIdLower === cleanId) {
        score += 400;
      }
      if (itemNameLower === cleanId) {
        score += 300;
      } else if (itemNameLower.includes(cleanId) || cleanId.includes(itemNameLower)) {
        score += 100;
      }

      const itemDishName = MenuService.normalizeDishQuery(item.name);
      if (targetDishName && itemDishName && (targetDishName.includes(itemDishName) || itemDishName.includes(targetDishName))) {
        score += 200;
      }

      // Token overlap matching (e.g. "coffee" matching "Turkish Coffee", "zinger" matching "Zinger Sandwich")
      const cleanTokens = cleanId.split(/\s+/).filter(t => t.length > 2);
      for (const token of cleanTokens) {
        if (itemNameLower.includes(token)) score += 20;
        if (itemIdLower.includes(token)) score += 15;
      }

      // Meal vs Sandwich intent bonus
      const isCleanMeal = cleanId.includes("meal") || cleanId.includes("وجبة");
      const isCleanSandwich = cleanId.includes("sandwich") || cleanId.includes("ساندويش") || cleanId.includes("سندويشة");
      const isItemMeal = item.category.toLowerCase() === "meals" || item.itemId.endsWith("-meal") || itemNameLower.includes("meal");
      const isItemSandwich = item.category.toLowerCase() === "sandwiches" || item.itemId.endsWith("-sandwich") || itemNameLower.includes("sandwich");

      if (isCleanMeal && isItemMeal) score += 60;
      if (isCleanSandwich && isItemSandwich) score += 60;

      // Customizations filter bonus
      if (customizationsFilter && customizationsFilter.length > 0) {
        const filterStr = customizationsFilter.join(" ").toLowerCase();
        const itemCustsStr = item.customizations?.map(c => c.selected.join(" ")).join(" ").toLowerCase() || "";
        if (itemCustsStr.includes(filterStr) || filterStr.split(" ").some(s => itemCustsStr.includes(s))) {
          score += 40;
        }
      }

      return { index, item, score };
    }).filter(s => s.score > 0);

    if (scored.length === 0) {
      if (cart.length === 1) return 0;
      return -1;
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored[0].index;
  }

  /**
   * Unified cart utility that strictly fetches prices from the menu/database based on item IDs.
   * Ensures that switching between Sandwich and Meal types replaces the item ID and forces a price re-fetch.
   */
  public static normalizeCartItem(item: CartItem): CartItem {
    if (!item) return item;

    // Check if requested name/category specifies Meal or Sandwich
    const itemName = (item.name || "").toLowerCase();
    const itemCat = (item.category || "").toLowerCase();
    const isMealReq = itemName.includes("meal") || itemCat === "meals";
    const isSwReq = itemName.includes("sandwich") || itemCat === "sandwiches";

    // Direct exact item ID lookup first to preserve explicit variant assignments
    let exactItem = item.itemId ? MenuService.getItemById(item.itemId) : undefined;
    if (exactItem) {
      const isExactSandwich = exactItem.category.toLowerCase() === "sandwiches" || exactItem.id.endsWith("-sandwich");
      const isExactMeal = exactItem.category.toLowerCase() === "meals" || exactItem.id.endsWith("-meal");

      if (isMealReq && isExactSandwich) {
        const oppMeal = MenuService.findOppositeVariant(exactItem, 'meal');
        if (oppMeal.foundItem) {
          exactItem = oppMeal.foundItem;
        }
      } else if (isSwReq && isExactMeal) {
        const oppSw = MenuService.findOppositeVariant(exactItem, 'sandwich');
        if (oppSw.foundItem) {
          exactItem = oppSw.foundItem;
        }
      }

      const formattedCustomizations = item.customizations || [];
      const calculatedPrice = MenuService.calculateItemPrice(exactItem, formattedCustomizations);
      return {
        ...item,
        itemId: exactItem.id,
        name: exactItem.name,
        category: exactItem.category,
        image: item.image || getItemImage(exactItem),
        basePrice: exactItem.price,
        customizations: formattedCustomizations,
        price: Number(calculatedPrice.toFixed(2)),
        quantity: Math.max(1, item.quantity || 1),
        note: item.note ? item.note.trim() : undefined,
      };
    }

    // Resolve item using MenuService based on itemId (or name) and customizations
    const resolved = MenuService.resolveMenuItem(item.itemId || item.name, item.customizations || []);
    const menuItem = resolved.item || MenuService.getItemById(item.itemId) || MenuService.getItemByName(item.name);

    if (!menuItem) {
      return {
        ...item,
        price: Number((item.price || 0).toFixed(2)),
        basePrice: Number((item.basePrice || item.price || 0).toFixed(2)),
      };
    }

    const newItemId = menuItem.id;
    const formattedCustomizations = resolved.customizations || item.customizations || [];
    const calculatedPrice = resolved.price !== undefined
      ? resolved.price
      : MenuService.calculateItemPrice(menuItem, formattedCustomizations);
    const resolvedName = resolved.resolvedName || menuItem.name;

    return {
      ...item,
      itemId: newItemId,
      name: resolvedName,
      category: menuItem.category,
      image: item.image || getItemImage(menuItem),
      basePrice: menuItem.price,
      customizations: formattedCustomizations,
      price: Number(calculatedPrice.toFixed(2)),
      quantity: Math.max(1, item.quantity || 1),
      note: item.note ? item.note.trim() : undefined,
    };
  }

  public static normalizeCartItems(items: CartItem[]): CartItem[] {
    if (!Array.isArray(items)) return [];
    return items.map((i) => this.normalizeCartItem(i));
  }

  /**
   * Add items to existing cart immutably
   */
  public static addItemsToCart(currentCart: CartItem[], itemsToAdd: CartItem[]): CartItem[] {
    this.saveCartSnapshot(currentCart);
    const normalizedToAdd = this.normalizeCartItems(itemsToAdd);
    const updated = [...currentCart];
    for (const item of normalizedToAdd) {
      const existingIdx = updated.findIndex(
        (ci) =>
          ci.itemId === item.itemId &&
          JSON.stringify(ci.customizations) === JSON.stringify(item.customizations) &&
          ci.note === item.note
      );

      if (existingIdx > -1) {
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + item.quantity,
        };
      } else {
        updated.push(item);
      }
    }
    return this.normalizeCartItems(updated);
  }

  /**
   * Remove item or reduce item quantity in cart immutably
   */
  public static removeItemFromCart(currentCart: CartItem[], targetIdentifier: string, quantityToRemove?: number): CartItem[] {
    const idx = this.findCartItemIndex(currentCart, targetIdentifier);
    if (idx === -1) return currentCart;

    this.saveCartSnapshot(currentCart);
    const targetItem = currentCart[idx];
    if (quantityToRemove && quantityToRemove > 0 && quantityToRemove < targetItem.quantity) {
      const updated = [...currentCart];
      updated[idx] = {
        ...targetItem,
        quantity: targetItem.quantity - quantityToRemove,
      };
      return this.normalizeCartItems(updated);
    }

    return currentCart.filter((_, i) => i !== idx);
  }

  /**
   * Update quantity of a cart item immutably. Supports 'set', 'increase', and 'decrease' modes.
   */
  public static updateItemQuantity(
    currentCart: CartItem[],
    targetIdentifier: string,
    newQuantity: number,
    mode: "set" | "increase" | "decrease" = "set"
  ): CartItem[] {
    const idx = this.findCartItemIndex(currentCart, targetIdentifier);
    if (idx === -1) return currentCart;

    this.saveCartSnapshot(currentCart);
    const targetItem = currentCart[idx];
    let targetQty = newQuantity;

    if (mode === "increase") {
      targetQty = targetItem.quantity + newQuantity;
    } else if (mode === "decrease") {
      targetQty = targetItem.quantity - newQuantity;
    }

    if (targetQty <= 0) {
      return this.removeItemFromCart(currentCart, targetIdentifier);
    }

    const updated = [...currentCart];
    updated[idx] = {
      ...targetItem,
      quantity: targetQty,
    };
    return this.normalizeCartItems(updated);
  }

  /**
   * Replace one cart item with another (e.g., Sandwich -> Meal, or Fajita -> Zinger).
   * Explicitly checks for item type transitions (e.g., Sandwich to Meal or Meal to Sandwich).
   * Performs an atomic update that replaces item ID, refreshes authoritative price,
   * updates category & image, and retains notes & quantities.
   */
  public static replaceCartItem(
    currentCart: CartItem[],
    oldTargetIdentifier: string,
    newTargetIdentifier: string,
    quantity?: number,
    customizations?: string[] | { title: string; selected: string[] }[],
    note?: string
  ): CartItem[] {
    if (!currentCart || currentCart.length === 0) return currentCart;

    // Check for ambiguity when target identifier is generic like "sandwich"
    const cleanOld = oldTargetIdentifier.trim().toLowerCase();
    if (cleanOld === "sandwich" || cleanOld === "the sandwich" || cleanOld === "ساندويش") {
      const sandwichCount = currentCart.filter(i =>
        i.category.toLowerCase() === "sandwiches" ||
        i.itemId.includes("sandwich") ||
        i.name.toLowerCase().includes("sandwich")
      ).length;

      if (sandwichCount > 1) {
        console.warn(`[CartOrderService] Ambiguous replacement request: ${sandwichCount} sandwiches in cart. Asking for clarification.`);
        return currentCart;
      }
    }

    let idx = this.findCartItemIndex(currentCart, oldTargetIdentifier);

    // Fallback if old item was not found directly by name or ID
    if (idx === -1 && currentCart.length > 0) {
      // 1. Try finding by opposite variant if oldTargetIdentifier is a valid menu item
      const oldMenuItem = MenuService.getItemById(oldTargetIdentifier) || MenuService.getItemByName(oldTargetIdentifier);
      if (oldMenuItem) {
        const oppositeMeal = MenuService.findOppositeVariant(oldMenuItem, 'meal');
        if (oppositeMeal.foundItem) {
          idx = this.findCartItemIndex(currentCart, oppositeMeal.foundItem.id);
        }
        if (idx === -1) {
          const oppositeSandwich = MenuService.findOppositeVariant(oldMenuItem, 'sandwich');
          if (oppositeSandwich.foundItem) {
            idx = this.findCartItemIndex(currentCart, oppositeSandwich.foundItem.id);
          }
        }
        if (idx === -1) {
          const dishName = MenuService.normalizeDishQuery(oldMenuItem.name);
          if (dishName) {
            idx = currentCart.findIndex(i => {
              const itemDish = MenuService.normalizeDishQuery(i.name);
              return itemDish.includes(dishName) || dishName.includes(itemDish);
            });
          }
        }
      }

      // 2. Category/Type search fallback
      if (idx === -1) {
        if (cleanOld.includes("meal") || cleanOld.includes("وجبة")) {
          idx = currentCart.findIndex(i => i.category.toLowerCase() === "meals" || i.itemId.endsWith("-meal") || i.name.toLowerCase().includes("meal"));
        } else if (cleanOld.includes("sandwich") || cleanOld.includes("ساندويش")) {
          idx = currentCart.findIndex(i => i.category.toLowerCase() === "sandwiches" || i.itemId.endsWith("-sandwich") || i.name.toLowerCase().includes("sandwich"));
        }
      }

      // 3. Single-item fallback
      if (idx === -1 && currentCart.length === 1) {
        idx = 0;
      }
    }

    if (idx === -1) {
      console.warn(`[CartOrderService] Cannot replace item: '${oldTargetIdentifier}' not found in cart.`);
      return currentCart;
    }

    this.saveCartSnapshot(currentCart);
    const targetItem = currentCart[idx];
    const cleanNewTarget = newTargetIdentifier.trim().toLowerCase();

    // Explicit item type transition checks
    const isTransitionToMeal =
      cleanNewTarget === "meal" ||
      cleanNewTarget === "وجبة" ||
      cleanNewTarget === "وجبه" ||
      cleanNewTarget.includes("to meal") ||
      cleanNewTarget.includes("make it a meal") ||
      cleanNewTarget.includes("change to meal") ||
      cleanNewTarget.endsWith("-meal") ||
      (cleanNewTarget.includes("meal") && (targetItem.itemId.includes("sandwich") || targetItem.category.toLowerCase() === "sandwiches"));

    const isTransitionToSandwich =
      cleanNewTarget === "sandwich" ||
      cleanNewTarget === "ساندويش" ||
      cleanNewTarget.includes("to sandwich") ||
      cleanNewTarget.includes("make it a sandwich") ||
      cleanNewTarget.includes("change to sandwich") ||
      cleanNewTarget.endsWith("-sandwich") ||
      (cleanNewTarget.includes("sandwich") && (targetItem.itemId.includes("meal") || targetItem.category.toLowerCase() === "meals"));

    let menuItem: any = null;
    let resolvedName: string | undefined = undefined;
    let calculatedPrice: number | undefined = undefined;

    // Direct exact item ID lookup check first (e.g., 'sn-1-sandwich' or 'sn-1-meal')
    const directExactItem = MenuService.getItemById(newTargetIdentifier);
    if (directExactItem) {
      menuItem = directExactItem;
      resolvedName = directExactItem.name;
      calculatedPrice = directExactItem.price;
    }

    if (!menuItem && isTransitionToMeal) {
      const opposite = MenuService.findOppositeVariant(targetItem, 'meal');
      if (!opposite.noVariantAvailable && opposite.foundItem) {
        menuItem = opposite.foundItem;
        resolvedName = opposite.resolvedName;
        calculatedPrice = opposite.price;
      }
    } else if (!menuItem && isTransitionToSandwich) {
      const opposite = MenuService.findOppositeVariant(targetItem, 'sandwich');
      if (!opposite.noVariantAvailable && opposite.foundItem) {
        menuItem = opposite.foundItem;
        resolvedName = opposite.resolvedName;
        calculatedPrice = opposite.price;
      }
    }

    // Fallback if not a direct meal/sandwich transition or if opposite wasn't found
    if (!menuItem) {
      let resolved = MenuService.resolveMenuItem(newTargetIdentifier, customizations || []);
      menuItem = resolved.item || MenuService.getItemById(newTargetIdentifier) || MenuService.getItemByName(newTargetIdentifier);
      resolvedName = resolved.resolvedName || menuItem?.name;
      calculatedPrice = resolved.price;
    }

    if (!menuItem) {
      console.warn(`[CartOrderService] Cannot replace item: New target '${newTargetIdentifier}' not found on menu.`);
      return currentCart;
    }

    // Determine customizations (preserve existing option if applicable, or adopt new)
    let newCustomizations: { title: string; selected: string[] }[] = [];
    if (customizations && Array.isArray(customizations) && customizations.length > 0) {
      if (typeof customizations[0] === "string") {
        newCustomizations = [{ title: "Options", selected: customizations as string[] }];
      } else {
        newCustomizations = customizations as { title: string; selected: string[] }[];
      }
    } else if (targetItem.customizations && targetItem.customizations.length > 0) {
      newCustomizations = targetItem.customizations;
    }

    // Sanitize customizations when transitioning between sandwich and meal
    if (isTransitionToSandwich || menuItem.id.endsWith("-sandwich") || menuItem.category.toLowerCase() === "sandwiches") {
      newCustomizations = newCustomizations
        .map(c => ({
          ...c,
          selected: c.selected.filter(s => s.toLowerCase() !== "meal")
        }))
        .filter(c => c.selected.length > 0);
    } else if (isTransitionToMeal || menuItem.id.endsWith("-meal") || menuItem.category.toLowerCase() === "meals") {
      newCustomizations = newCustomizations
        .map(c => ({
          ...c,
          selected: c.selected.filter(s => s.toLowerCase() !== "sandwich")
        }))
        .filter(c => c.selected.length > 0);
    }

    if (calculatedPrice === undefined) {
      calculatedPrice = MenuService.calculateItemPrice(menuItem, newCustomizations);
    }

    // Perform atomic update: replace item ID, update price & metadata, retain notes & quantity
    const updated = [...currentCart];
    const newItem: CartItem = {
      id: targetItem.id, // Preserve stable cart item instance ID
      itemId: menuItem.id, // Atomic replacement of item ID
      name: resolvedName || menuItem.name,
      category: menuItem.category,
      image: getItemImage(menuItem),
      basePrice: menuItem.price,
      customizations: newCustomizations,
      price: Number(calculatedPrice.toFixed(2)), // Authoritative updated price from menu data
      quantity: (quantity !== undefined && quantity > 0) ? quantity : targetItem.quantity, // Retain original quantity unless overridden
      note: (note !== undefined && note !== "") ? note : targetItem.note, // Retain original notes unless overridden
    };

    updated[idx] = newItem;
    return this.normalizeCartItems(updated);
  }

  /**
   * Modify options/customizations of an item in cart.
   * Supports modifying a partial count (e.g., 1 out of 2 cappuccinos changed to oat milk)
   */
  public static updateItemOptions(
    currentCart: CartItem[],
    targetIdentifier: string,
    newCustomizations: string[] | { title: string; selected: string[] }[],
    countToModify: number = 0
  ): CartItem[] {
    const idx = this.findCartItemIndex(currentCart, targetIdentifier);
    if (idx === -1) return currentCart;

    const targetItem = currentCart[idx];

    // Format new customizations
    const formattedCustomizations: { title: string; selected: string[] }[] = [];
    if (Array.isArray(newCustomizations)) {
      if (newCustomizations.length > 0 && typeof newCustomizations[0] === "string") {
        formattedCustomizations.push({
          title: "Selected Options",
          selected: newCustomizations as string[],
        });
      } else {
        formattedCustomizations.push(...(newCustomizations as { title: string; selected: string[] }[]));
      }
    }

    // Resolve item using MenuService based on item ID/name and formatted customizations
    const resolved = MenuService.resolveMenuItem(targetItem.itemId || targetItem.name, formattedCustomizations);
    const menuItem = resolved.item || MenuService.getItemById(targetItem.itemId) || MenuService.getItemByName(targetItem.name);

    const newItemId = menuItem ? menuItem.id : targetItem.itemId;
    const resolvedName = resolved.resolvedName || (menuItem ? menuItem.name : targetItem.name);
    const updatedCustomizations = resolved.customizations || formattedCustomizations;
    const newPrice = menuItem
      ? (resolved.price !== undefined ? resolved.price : MenuService.calculateItemPrice(menuItem, updatedCustomizations))
      : targetItem.price;

    const updated = [...currentCart];

    // If modifying 1 out of multiple (e.g. countToModify = 1 when targetItem.quantity = 2)
    if (countToModify > 0 && countToModify < targetItem.quantity) {
      // Reduce original quantity
      updated[idx] = {
        ...targetItem,
        quantity: targetItem.quantity - countToModify,
      };

      // Add split item with new options
      const newItem: CartItem = {
        id: `cart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        itemId: newItemId,
        name: resolvedName,
        category: menuItem ? menuItem.category : targetItem.category,
        image: menuItem ? getItemImage(menuItem) : targetItem.image,
        basePrice: menuItem ? menuItem.price : targetItem.basePrice,
        customizations: updatedCustomizations,
        price: Number(newPrice.toFixed(2)),
        quantity: countToModify,
        note: targetItem.note,
      };

      updated.push(newItem);
    } else {
      // Modify entire item quantity options
      updated[idx] = {
        ...targetItem,
        itemId: newItemId,
        name: resolvedName,
        category: menuItem ? menuItem.category : targetItem.category,
        image: menuItem ? getItemImage(menuItem) : targetItem.image,
        basePrice: menuItem ? menuItem.price : targetItem.basePrice,
        customizations: updatedCustomizations,
        price: Number(newPrice.toFixed(2)),
      };
    }

    return this.normalizeCartItems(updated);
  }

  /**
   * Add special instruction note to item in cart
   */
  public static addItemNote(currentCart: CartItem[], targetIdentifier: string, note: string): CartItem[] {
    const idx = this.findCartItemIndex(currentCart, targetIdentifier);
    if (idx === -1) return currentCart;

    const cleanNote = (note || "").trim();
    const isClearRequest = !cleanNote ||
      cleanNote.toLowerCase() === "none" ||
      cleanNote.toLowerCase() === "remove" ||
      cleanNote.toLowerCase() === "clear" ||
      cleanNote.toLowerCase() === "لا يوجد" ||
      cleanNote.toLowerCase() === "إلغاء";

    const updated = [...currentCart];
    if (isClearRequest) {
      const item = { ...updated[idx] };
      delete item.note;
      updated[idx] = item;
    } else {
      updated[idx] = {
        ...updated[idx],
        note: cleanNote,
      };
    }
    return this.normalizeCartItems(updated);
  }

  /**
   * Remove note from item in cart
   */
  public static removeItemNote(currentCart: CartItem[], targetIdentifier: string): CartItem[] {
    const idx = this.findCartItemIndex(currentCart, targetIdentifier);
    if (idx === -1) return currentCart;

    const updated = [...currentCart];
    const newItem = { ...updated[idx] };
    delete newItem.note;
    updated[idx] = newItem;
    return updated;
  }

  /**
   * Calculate trusted cart totals from active cart items, re-verifying against current database prices
   */
  public static calculateCartTotal(cart: CartItem[]): {
    subtotal: number;
    talkTableFee: number;
    tax: number;
    total: number;
  } {
    const subtotal = cart.reduce((sum, item) => {
      const liveMenuItem = MenuService.getItemById(item.itemId) || MenuService.getItemByName(item.name);
      const unitPrice = liveMenuItem ? MenuService.calculateItemPrice(liveMenuItem, item.customizations || []) : item.price;
      return sum + unitPrice * item.quantity;
    }, 0);
    const tax = 0; // Tax inclusive
    const talkTableFee = 0.05; // 0.05 JD platform fee
    const total = cart.length > 0 ? Number((subtotal + talkTableFee).toFixed(2)) : 0;
    return {
      subtotal: Number(subtotal.toFixed(2)),
      talkTableFee,
      tax,
      total,
    };
  }

  /**
   * Convert tool function call arguments into valid CartItem objects
   */
  public static processToolCartItems(items: ToolCartItem[]): CartItem[] {
    const processedCartItems: CartItem[] = [];

    if (!Array.isArray(items)) return processedCartItems;

    for (const item of items) {
      if (!item) continue;
      const itemTarget = typeof item.itemId === 'string' && item.itemId 
        ? item.itemId 
        : ((item as any).name || (item as any).id || (item as any).item || "");
      
      const resolved = MenuService.resolveMenuItem(itemTarget, item.customizations);
      const menuItem = resolved.item || MenuService.getItemById(itemTarget) || MenuService.getItemByName(itemTarget);

      if (!menuItem) {
        console.warn(`[CartOrderService] Menu item not found for ID/Name: ${itemTarget}`);
        continue;
      }

      // Merge resolved customizations (e.g. Option / Size: Meal) with incoming tool customizations
      const formattedCustomizations: { title: string; selected: string[] }[] = [];

      if (resolved.customizations && Array.isArray(resolved.customizations)) {
        formattedCustomizations.push(...resolved.customizations);
      }

      if (Array.isArray(item.customizations)) {
        if (item.customizations.length > 0 && typeof item.customizations[0] === "string") {
          const options = item.customizations as string[];
          const newOpts = options.filter(
            (opt) => !formattedCustomizations.some((fc) => fc.selected.includes(opt))
          );
          if (newOpts.length > 0) {
            formattedCustomizations.push({
              title: "Selected Options",
              selected: newOpts,
            });
          }
        } else {
          formattedCustomizations.push(...(item.customizations as { title: string; selected: string[] }[]));
        }
      }

      const calculatedPrice = resolved.price !== undefined
        ? resolved.price
        : MenuService.calculateItemPrice(menuItem, formattedCustomizations);

      const cartItemName = resolved.resolvedName || menuItem.name;

      const cartItem: CartItem = {
        id: `cart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        itemId: menuItem.id,
        name: cartItemName,
        category: menuItem.category,
        image: getItemImage(menuItem),
        basePrice: menuItem.price,
        customizations: formattedCustomizations,
        price: calculatedPrice,
        quantity: Math.max(1, item.quantity || 1),
        note: item.note || undefined,
      };

      processedCartItems.push(cartItem);
    }

    return processedCartItems;
  }

  public static validateCartBeforeSubmission(cartItems: CartItem[]): {
    valid: boolean;
    errors: string[];
    validatedCart: CartItem[];
  } {
    if (!cartItems || cartItems.length === 0) {
      return { valid: false, errors: ["Cart is empty."], validatedCart: [] };
    }

    const errors: string[] = [];
    const validatedCart: CartItem[] = [];

    for (let idx = 0; idx < cartItems.length; idx++) {
      const ci = cartItems[idx];
      let resolved = MenuService.resolveMenuItem(ci.itemId || ci.name, ci.customizations || []);
      let menuItem = resolved.item || MenuService.getItemById(ci.itemId) || MenuService.getItemByName(ci.name);

      if (!menuItem) {
        errors.push(`Item #${idx + 1} ('${ci.name}', ID '${ci.itemId}') does not exist in authoritative menu.`);
        continue;
      }

      const isMealCartItem = ci.name.toLowerCase().includes("meal") ||
        (ci.category && ci.category.toLowerCase() === "meals") ||
        JSON.stringify(ci.customizations || []).toLowerCase().includes("meal");

      const isSandwichCartItem = ci.name.toLowerCase().includes("sandwich") ||
        (ci.category && ci.category.toLowerCase() === "sandwiches") ||
        JSON.stringify(ci.customizations || []).toLowerCase().includes("sandwich");

      let isMenuItemMealCategory = menuItem.category.toLowerCase() === "meals" ||
        menuItem.id.toLowerCase().endsWith("-meal") ||
        menuItem.name.toLowerCase().includes("meal");

      let isMenuItemSandwichCategory = menuItem.category.toLowerCase() === "sandwiches" ||
        menuItem.id.toLowerCase().endsWith("-sandwich") ||
        menuItem.name.toLowerCase().includes("sandwich");

      if (isMealCartItem && !isMenuItemMealCategory && !JSON.stringify(resolved.customizations || []).toLowerCase().includes("meal")) {
        const mealVariant = MenuService.findOppositeVariant(menuItem, 'meal');
        if (mealVariant && mealVariant.foundItem && !mealVariant.noVariantAvailable) {
          menuItem = mealVariant.foundItem;
          resolved = {
            item: mealVariant.foundItem,
            resolvedName: mealVariant.resolvedName || mealVariant.foundItem.name,
            price: mealVariant.price !== undefined ? mealVariant.price : mealVariant.foundItem.price,
            customizations: ci.customizations || [],
          };
          isMenuItemMealCategory = true;
          isMenuItemSandwichCategory = false;
        }
      } else if (isSandwichCartItem && !isMenuItemSandwichCategory && menuItem.category.toLowerCase() === "meals" && !JSON.stringify(resolved.customizations || []).toLowerCase().includes("sandwich")) {
        const sandwichVariant = MenuService.findOppositeVariant(menuItem, 'sandwich');
        if (sandwichVariant && sandwichVariant.foundItem && !sandwichVariant.noVariantAvailable) {
          menuItem = sandwichVariant.foundItem;
          resolved = {
            item: sandwichVariant.foundItem,
            resolvedName: sandwichVariant.resolvedName || sandwichVariant.foundItem.name,
            price: sandwichVariant.price !== undefined ? sandwichVariant.price : sandwichVariant.foundItem.price,
            customizations: ci.customizations || [],
          };
          isMenuItemSandwichCategory = true;
          isMenuItemMealCategory = false;
        }
      }

      const expectedUnitPrice = resolved.price !== undefined
        ? resolved.price
        : MenuService.calculateItemPrice(menuItem, resolved.customizations || ci.customizations || []);

      if (isMealCartItem && !isMenuItemMealCategory && !JSON.stringify(resolved.customizations || []).toLowerCase().includes("meal")) {
        errors.push(`Item #${idx + 1} '${ci.name}' is specified as a Meal, but matched menu item '${menuItem.name}' (ID: ${menuItem.id}) is a Sandwich without a valid Meal option.`);
      }

      if (isSandwichCartItem && !isMenuItemSandwichCategory && menuItem.category.toLowerCase() === "meals" && !JSON.stringify(resolved.customizations || []).toLowerCase().includes("sandwich")) {
        errors.push(`Item #${idx + 1} '${ci.name}' is specified as a Sandwich, but matched menu item '${menuItem.name}' (ID: ${menuItem.id}) is a Meal.`);
      }

      const normalized = this.normalizeCartItem({
        ...ci,
        itemId: menuItem.id,
        name: resolved.resolvedName || menuItem.name,
        category: menuItem.category,
        basePrice: menuItem.price,
        customizations: resolved.customizations || ci.customizations || [],
        price: Number(expectedUnitPrice.toFixed(2)),
      });

      validatedCart.push(normalized);
    }

    return {
      valid: errors.length === 0,
      errors,
      validatedCart: errors.length === 0 ? validatedCart : cartItems,
    };
  }

  public static pendingCartOperations = 0;

  /**
   * Main Atomic Order Submission Engine.
   * Handles validation, idempotency via submissionId, retries, post-write document verification,
   * status enforcement ("New"), and structured logging.
   */
  public static async submitConfirmedOrder(params: {
    tableNumber: string;
    cartItems: CartItem[];
    userId?: string;
    paymentMethod?: "cash" | "card";
    orderNotes?: string;
    submissionId?: string;
    sessionId?: string;
  }): Promise<{ success: boolean; order?: Order; error?: string }> {
    const {
      tableNumber,
      cartItems: rawCartItems,
      userId = "guest_voice_user",
      paymentMethod = "cash",
      orderNotes = "",
      submissionId: incomingSubmissionId,
      sessionId
    } = params;

    console.log(`[ORDER] confirmation received for Table ${tableNumber}`);

    // Wait for any pending async cart operations to drain before taking snapshot
    let waitCount = 0;
    while (this.pendingCartOperations > 0 && waitCount < 40) {
      console.log(`[ORDER] Waiting for ${this.pendingCartOperations} pending cart operation(s) to finish...`);
      await new Promise(r => setTimeout(r, 50));
      waitCount++;
    }

    const cartItemsInput = rawCartItems || [];
    console.log(`[ORDER] cart loaded: ${cartItemsInput.length} items`);

    if (!cartItemsInput || cartItemsInput.length === 0) {
      console.error("[ORDER ERROR] stage: cart_check errorCode: EMPTY_CART tableNumber:", tableNumber);
      return { success: false, error: "No items were found in the order." };
    }

    // Explicit validation check comparing menuItem metadata & meal/sandwich category/pricing
    const validation = this.validateCartBeforeSubmission(cartItemsInput);
    if (!validation.valid) {
      console.error("[ORDER ERROR] stage: validation errorCode: INVALID_CART errors:", validation.errors);
      return { success: false, error: `Order validation failed: ${validation.errors.join("; ")}` };
    }

    const cartItems = validation.validatedCart;
    console.log(`[ORDER] cart validation success (${cartItems.length} items validated)`);

    // Compute cart fingerprint
    const cartFingerprint = `${tableNumber}_${cartItems.map(i => `${i.itemId}:${i.quantity}`).sort().join(",")}`;
    const submissionId = incomingSubmissionId || `sub_${tableNumber}_${sessionId || 'default'}_${cartFingerprint}`;
    console.log(`[ORDER] submissionId generated/reused: ${submissionId}`);

    // Deduplication check from in-memory cache
    const cached = recentSubmissions.get(submissionId);
    if (cached && (Date.now() - cached.timestamp < 10000)) {
      console.log(`[ORDER] Duplicate submission prevented via in-memory cache. Returning cached order ID: ${cached.order.orderId}`);
      return { success: true, order: cached.order };
    }

    if (activeSubmissionPromise) {
      console.log("[ORDER] Submission already in progress. Awaiting result...");
      return activeSubmissionPromise;
    }

    const submissionWork = (async () => {
      let orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      let verifiedOrderData: any = null;

      try {
        // Idempotency check in Firestore: check if an order with this submissionId already exists
        try {
          const subQuery = query(collection(db, "orders"), where("submissionId", "==", submissionId));
          const subSnap = await getDocs(subQuery);
          if (!subSnap.empty) {
            const existingDoc = subSnap.docs[0];
            const existingOrder = { orderId: existingDoc.id, id: existingDoc.id, ...existingDoc.data() } as unknown as Order;
            console.log(`[ORDER] Existing order found in Firestore for submissionId "${submissionId}". Returning existing Order ID: ${existingOrder.orderId}`);
            recentSubmissions.set(submissionId, { order: existingOrder, timestamp: Date.now() });
            return { success: true, order: existingOrder };
          }
        } catch (idemErr) {
          console.warn("[ORDER] Warning checking submissionId idempotency in Firestore:", idemErr);
        }

        // Check active shift status in Firestore before creating order
        let activeShiftId = "";
        try {
          const shiftQ = query(
            collection(db, "shifts"),
            where("status", "in", ["open", "OPEN"])
          );
          const shiftSnap = await getDocs(shiftQ);
          if (shiftSnap.empty) {
            console.error("[ORDER REJECTED] No active shift found in Firebase. Restaurant is closed.");
            return {
              success: false,
              error: "The restaurant has just closed. Please ask a staff member for assistance."
            };
          }
          const activeShiftDoc = shiftSnap.docs[0];
          activeShiftId = activeShiftDoc.id || activeShiftDoc.data().shiftId || "";
        } catch (shiftErr) {
          console.warn("[ORDER WARNING] Error querying active shift status:", shiftErr);
          return {
            success: false,
            error: "The restaurant has just closed. Please ask a staff member for assistance."
          };
        }

        console.log(`[ORDER] Generated Order ID: ${orderId} for Shift: ${activeShiftId}`);

        const orderItems: OrderItem[] = cartItems.map((ci) => ({
          itemId: ci.itemId,
          name: ci.name,
          category: ci.category || (MenuService.getItemById(ci.itemId)?.category) || "Uncategorized",
          quantity: ci.quantity,
          price: ci.price,
          customizations: ci.customizations,
          notes: ci.note || "",
          note: ci.note || "",
        }));

        const totals = this.calculateCartTotal(cartItems);
        const subtotal = totals.subtotal;
        const tax = 0; // Strictly no tax
        const talkTableFee = totals.talkTableFee;
        const total = totals.total;
        const pointsEarned = Math.floor(total) * 10;

        const orderData = {
          orderId,
          submissionId,
          shiftId: activeShiftId,
          sessionId: sessionId || `sess_${tableNumber}`,
          restaurantId: RESTAURANT_ID,
          restaurantName: "Salein Cafe",
          userId,
          customerName: userId === "guest_voice_user" ? "AI Voice Customer" : userId,
          tableNumber: String(tableNumber),
          tableId: String(tableNumber),
          items: orderItems,
          orderedItems: orderItems,
          subtotal,
          tax: 0,
          serviceFee: 0,
          discount: 0,
          talkTableFee,
          total,
          status: "New",
          orderStatus: "New",
          paymentStatus: "pending",
          paymentMethod,
          orderSource: "AI Waiter",
          notes: orderNotes || "",
          pointsEarned,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        // Server validation endpoint
        console.log(`[ORDER] Backend validation function called (/api/orders/validate-and-log) for Order ${orderId}...`);
        verifiedOrderData = { ...orderData };

        try {
          const validationRes = await fetch("/api/orders/validate-and-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderData),
          });

          if (validationRes.ok) {
            const validationData = await validationRes.json();
            if (validationData.success && validationData.order) {
              console.log(`[ORDER] Backend validation PASSED for Order ${orderId}. Recalculated total: ${validationData.order.total}`);
              verifiedOrderData = {
                ...orderData,
                ...validationData.order,
                orderId, // Preserve generated orderId
                submissionId,
                status: "New",
                orderStatus: "New",
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              };
            }
          } else {
            console.warn(`[ORDER] Backend validation endpoint returned non-OK status (${validationRes.status}). Proceeding with verified orderData.`);
          }
        } catch (valErr) {
          console.warn(`[ORDER] Backend validation call warning:`, valErr, `Proceeding with verified orderData.`);
        }

        // Ensure Timestamps for Firestore document
        verifiedOrderData.createdAt = Timestamp.now();
        verifiedOrderData.updatedAt = Timestamp.now();
        verifiedOrderData.status = "New";
        verifiedOrderData.orderStatus = "New";

        // Write order directly to Firestore with retry strategy
        let writeSuccess = false;
        let attempts = 0;
        const maxAttempts = 3;
        const delayMs = [500, 1500, 3000];

        while (attempts < maxAttempts && !writeSuccess) {
          attempts++;
          try {
            console.log(`[ORDER] database write started (attempt ${attempts}/${maxAttempts}) to collection "orders/${orderId}"...`);
            await setDoc(doc(db, "orders", orderId), verifiedOrderData);
            writeSuccess = true;
            console.log(`[ORDER] database write success for Order ID ${orderId}`);
          } catch (writeErr: any) {
            console.warn(`[ORDER WARNING] Database write attempt ${attempts} issue:`, writeErr?.message || writeErr);
            const errStr = String(writeErr?.message || writeErr || "");
            if (
              errStr.includes("Quota limit exceeded") ||
              errStr.includes("Quota exceeded") ||
              errStr.includes("free daily read units") ||
              errStr.includes("resource-exhausted")
            ) {
              // Firestore quota exhausted - exit retry loop early and fall back to local order placement
              break;
            }
            if (attempts >= maxAttempts) throw writeErr;
            await new Promise((r) => setTimeout(r, delayMs[attempts - 1] || 1000));
          }
        }

        const newOrder: Order = {
          ...verifiedOrderData,
          orderId,
        };

        if (writeSuccess) {
          // Post-write verification: Read document from Firestore to verify existence
          try {
            console.log(`[ORDER] Verifying document existence in Firestore for Order ID ${orderId}...`);
            const checkDoc = await getDoc(doc(db, "orders", orderId));
            if (checkDoc.exists()) {
              console.log(`[ORDER] database verification success for Order ID ${orderId}`);
            }
          } catch (vErr) {
            console.warn(`[ORDER] Post-write verification skipped/warning (quota or connection):`, vErr);
          }
        } else {
          console.warn(`[ORDER] Firestore write unavailable/quota-exceeded for Order ID ${orderId}. Saving order to local storage fallback.`);
          safeLocalStorage.setItem("salein_active_order", JSON.stringify(newOrder));
          try {
            const existingOffline = JSON.parse(safeLocalStorage.getItem("salein_offline_orders") || "[]");
            existingOffline.push(newOrder);
            safeLocalStorage.setItem("salein_offline_orders", JSON.stringify(existingOffline));
          } catch (e) { /* ignore */ }
        }

        // Store in deduplication cache
        recentSubmissions.set(submissionId, { order: newOrder, timestamp: Date.now() });

        // Dispatch background push notifications if available
        try {
          dispatchPushNotification({
            type: "order",
            tableNumber,
            orderId,
            total: newOrder.total,
            restaurantName: "Salein Cafe"
          });
        } catch (notifErr) {
          console.warn(`[ORDER] Push notification warning:`, notifErr);
        }

        console.log(`[ORDER] submission completed successfully for Order ID ${orderId}`);
        return { success: true, order: newOrder };
      } catch (err: any) {
        const errStr = String(err?.message || err || "");
        const isQuota =
          errStr.includes("Quota limit exceeded") ||
          errStr.includes("Quota exceeded") ||
          errStr.includes("free daily read units") ||
          errStr.includes("resource-exhausted") ||
          errStr.includes("Could not reach Cloud Firestore") ||
          errStr.includes("offline");

        if (isQuota) {
          console.warn(`[ORDER FALLBACK] Firestore quota/connectivity limit hit during submission. Generating local order confirmation for Order ID ${orderId}.`);
          const totals = this.calculateCartTotal(cartItems);
          const fallbackOrder: Order = {
            orderId,
            submissionId,
            sessionId: sessionId || `sess_${tableNumber}`,
            restaurantId: RESTAURANT_ID,
            restaurantName: "Salein Cafe",
            userId,
            customerName: userId === "guest_voice_user" ? "AI Voice Customer" : userId,
            tableNumber: String(tableNumber),
            tableId: String(tableNumber),
            items: cartItems.map((ci) => ({
              itemId: ci.itemId,
              name: ci.name,
              category: ci.category || "Uncategorized",
              quantity: ci.quantity,
              price: ci.price,
              customizations: ci.customizations,
              notes: ci.note || "",
              note: ci.note || "",
            })),
            orderedItems: [],
            subtotal: totals.subtotal,
            tax: 0,
            serviceFee: 0,
            discount: 0,
            talkTableFee: totals.talkTableFee,
            total: totals.total,
            status: "New",
            orderStatus: "New",
            paymentStatus: "pending",
            paymentMethod,
            orderSource: "AI Waiter",
            notes: orderNotes || "",
            pointsEarned: Math.floor(totals.total) * 10,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            ...(verifiedOrderData || {}),
          };
          safeLocalStorage.setItem("salein_active_order", JSON.stringify(fallbackOrder));
          recentSubmissions.set(submissionId, { order: fallbackOrder, timestamp: Date.now() });
          return { success: true, order: fallbackOrder };
        }

        console.error(`[ORDER ERROR] stage: submission_failed errorCode: ${err.name || 'UNKNOWN'} message: ${err.message}`);
        try {
          handleFirestoreError(err, OperationType.WRITE, "orders");
        } catch (logErr) {
          // Suppress secondary throw
        }
        return { success: false, error: err.message || "Failed to submit order to kitchen" };
      } finally {
        activeSubmissionPromise = null;
      }
    })();

    activeSubmissionPromise = submissionWork;
    return submissionWork;
  }

  public static async submitAIOrder(
    tableNumber: string,
    cartItemsInput: CartItem[],
    userId: string = "guest_voice_user",
    paymentMethod: "cash" | "card" = "cash",
    orderNotes: string = ""
  ): Promise<{ success: boolean; order?: Order; error?: string }> {
    return this.submitConfirmedOrder({
      tableNumber,
      cartItems: cartItemsInput,
      userId,
      paymentMethod,
      orderNotes
    });
  }

  public static async submitOrderToKitchen(
    tableNumber: string,
    cartItemsInput: CartItem[],
    userId: string = "guest_voice_user",
    paymentMethod: "cash" | "card" = "cash",
    orderNotes: string = ""
  ): Promise<{ success: boolean; order?: Order; error?: string }> {
    return this.submitConfirmedOrder({
      tableNumber,
      cartItems: cartItemsInput,
      userId,
      paymentMethod,
      orderNotes
    });
  }
}
