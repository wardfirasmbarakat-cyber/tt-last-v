import { MENU_ITEMS, MenuItem } from "../../data/menu";
import { db } from "../../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";

export interface CustomizationOption {
  title: string;
  selected: string[];
}

export interface ResolvedMenuItemResult {
  item?: MenuItem;
  resolvedName?: string;
  customizations?: { title: string; selected: string[] }[];
  price?: number;
  ambiguous?: boolean;
  mealUnavailable?: boolean;
  baseName?: string;
  error?: string;
}

const MEAL_INDICATORS = ["meal", "combo", "meal deal", "وجبة", "كومبو", "وجبة كاملة", "كومبو وجبة"];
const SANDWICH_INDICATORS = ["sandwich", "sandwhich", "ساندويش", "ساندوتش", "سندويشة", "سندويش"];

export class MenuService {
  private static liveMenuItems: MenuItem[] = [...MENU_ITEMS];
  private static isSubscribed = false;

  /**
   * Subscribe to real-time updates from Firestore menuItems collection
   */
  public static initLiveSubscription() {
    if (this.isSubscribed || typeof window === "undefined") return;
    this.isSubscribed = true;

    try {
      onSnapshot(
        collection(db, "menuItems"),
        (snap) => {
          if (!snap.empty) {
            const items: MenuItem[] = [];
            snap.forEach((docSnap) => {
              const data = docSnap.data() as MenuItem;
              if (!data.isArchived && data.availability !== "hidden") {
                items.push({
                  ...data,
                  id: docSnap.id || data.id,
                });
              }
            });
            if (items.length > 0) {
              this.liveMenuItems = items;
              console.log(`[MenuService] Synced ${items.length} live menu items from Firestore.`);
            }
          }
        },
        (err) => {
          console.warn("[MenuService] Firestore menuItems listener warning:", err);
        }
      );
    } catch (e) {
      console.warn("[MenuService] Failed to initialize Firestore listener:", e);
    }
  }

  public static getAllItems(): MenuItem[] {
    this.initLiveSubscription();
    return this.liveMenuItems.length > 0 ? this.liveMenuItems : MENU_ITEMS;
  }

  public static getItemById(id: string): MenuItem | undefined {
    if (!id) return undefined;
    const items = this.getAllItems();
    const cleanId = id.trim().toLowerCase();
    const directMatch = items.find((item) => item.id.toLowerCase() === cleanId);
    if (directMatch) return directMatch;

    if (!cleanId.endsWith("-sandwich") && !cleanId.endsWith("-meal")) {
      const swMatch = items.find((item) => item.id.toLowerCase() === `${cleanId}-sandwich`);
      if (swMatch) return swMatch;
      const mealMatch = items.find((item) => item.id.toLowerCase() === `${cleanId}-meal`);
      if (mealMatch) return mealMatch;
    }
    return undefined;
  }

  /**
   * Helper to normalize dish search query (e.g. fajeta -> fajita, stripping prefixes)
   */
  public static normalizeDishQuery(q: string): string {
    let clean = q.toLowerCase().trim();

    // Synonym normalization for common typos / Arabic transcriptions
    clean = clean.replace(/fajeta|fajetta|فاجيتا|فاهيتا/g, "fajita");
    clean = clean.replace(/زينجر|زنجر/g, "zinger");
    clean = clean.replace(/إسكالوب|اسكالوب/g, "escalope");
    clean = clean.replace(/فرانسيسكو/g, "francisco");
    clean = clean.replace(/فيلادلفيا/g, "philadelphia");
    clean = clean.replace(/كريسبي/g, "crispy");

    // Remove meal/sandwich indicators and common request words to extract base name
    for (const ind of [...MEAL_INDICATORS, ...SANDWICH_INDICATORS, "baddi", "بدي", "اعطيني", "i want", "give me", "can i get", "a", "an", "the"]) {
      const regex = new RegExp(`\\b${ind}\\b`, "gi");
      clean = clean.replace(regex, "");
    }

    return clean.trim();
  }

  /**
   * Primary intelligent resolver enforcing exact menu item + meal vs sandwich matching
   */
  public static resolveMenuItem(
    identifier: string,
    initialCustomizations: any[] = []
  ): ResolvedMenuItemResult {
    if (!identifier || !identifier.trim()) {
      return { error: "No menu item identifier provided" };
    }

    const items = this.getAllItems();
    const rawQuery = identifier.trim().toLowerCase();

    // Check if meal or sandwich is explicitly requested
    const customStr = JSON.stringify(initialCustomizations || []).toLowerCase();
    const combinedInput = `${rawQuery} ${customStr}`;

    const isMealRequestedInQuery = MEAL_INDICATORS.some((k) => rawQuery.includes(k));
    const isSandwichRequestedInQuery = SANDWICH_INDICATORS.some((k) => rawQuery.includes(k));

    const isMealRequested = MEAL_INDICATORS.some((k) => combinedInput.includes(k));
    const isSandwichRequested = SANDWICH_INDICATORS.some((k) => combinedInput.includes(k));

    // 1. First check if identifier is an exact ID (e.g. "sn-1", "sw-2", "ml-1")
    const itemById = items.find((i) => i.id.toLowerCase() === rawQuery) || this.getItemById(rawQuery);
    if (itemById) {
      const isExplicitSandwich = rawQuery.endsWith("-sandwich");
      const isExplicitMeal = rawQuery.endsWith("-meal");

      if (isMealRequested && !isExplicitSandwich) {
        const mealVariant = this.findOppositeVariant(itemById, 'meal');
        if (mealVariant && mealVariant.foundItem && !mealVariant.noVariantAvailable) {
          return {
            item: mealVariant.foundItem,
            resolvedName: mealVariant.resolvedName || mealVariant.foundItem.name,
            price: mealVariant.price !== undefined ? mealVariant.price : mealVariant.foundItem.price,
            customizations: initialCustomizations,
          };
        }

        // If exact ID points to a pure Sandwich item (e.g., sw-2 "Chicken Fajita Sandwich")
        const isPureSandwich =
          itemById.category.toLowerCase() === "sandwiches" &&
          !itemById.customizations?.some((c) =>
            c.options?.some((o) => o.name.toLowerCase().includes("meal"))
          );

        if (isPureSandwich) {
          // Redirect to a meal alternative for the same dish if available (e.g., sn-1 Fajita with Meal option)
          const normName = this.normalizeDishQuery(itemById.name);
          const mealAlt = items.find(
            (item) =>
              item.id !== itemById.id &&
              (this.normalizeDishQuery(item.name).includes(normName) || normName.includes(this.normalizeDishQuery(item.name))) &&
              (item.category.toLowerCase() === "meals" ||
                item.customizations?.some((c) =>
                  c.options?.some((o) => o.name.toLowerCase().includes("meal"))
                ))
          );

          if (mealAlt) {
            return this.resolveMenuItem(mealAlt.id, [{ title: "Option / Size", selected: ["Meal"] }]);
          } else {
            return {
              mealUnavailable: true,
              baseName: itemById.name,
              item: itemById,
            };
          }
        } else if (
          itemById.customizations?.some((c) =>
            c.options?.some((o) => o.name.toLowerCase().includes("meal"))
          )
        ) {
          // Attach Meal customization option
          const hasMealCust = (initialCustomizations || []).some((c: any) =>
            JSON.stringify(c).toLowerCase().includes("meal")
          );

          const updatedCustomizations = hasMealCust
            ? initialCustomizations
            : [
                ...initialCustomizations,
                { title: "Option / Size", selected: ["Meal"] },
              ];

          const computedPrice = this.calculateItemPrice(itemById, updatedCustomizations);
          const resolvedName = itemById.name.toLowerCase().includes("meal")
            ? itemById.name
            : `${itemById.name} Meal`;

          return {
            item: itemById,
            resolvedName,
            customizations: updatedCustomizations,
            price: computedPrice,
          };
        }

        return {
          item: itemById,
          resolvedName: itemById.name,
          price: this.calculateItemPrice(itemById, initialCustomizations),
        };
      }

      if (isSandwichRequested && !isExplicitMeal) {
        if (
          itemById.customizations?.some((c) =>
            c.options?.some((o) => o.name.toLowerCase().includes("sandwich"))
          )
        ) {
          const hasSandwichCust = (initialCustomizations || []).some((c: any) =>
            JSON.stringify(c).toLowerCase().includes("sandwich")
          );

          const updatedCustomizations = hasSandwichCust
            ? initialCustomizations
            : [
                ...initialCustomizations,
                { title: "Option / Size", selected: ["Sandwich"] },
              ];

          const computedPrice = this.calculateItemPrice(itemById, updatedCustomizations);
          const resolvedName = itemById.name.toLowerCase().includes("sandwich")
            ? itemById.name
            : `${itemById.name} Sandwich`;

          return {
            item: itemById,
            resolvedName,
            customizations: updatedCustomizations,
            price: computedPrice,
          };
        }

        return {
          item: itemById,
          resolvedName: itemById.name,
          price: this.calculateItemPrice(itemById, initialCustomizations),
        };
      }

      // If neither specified, return item by ID
      return {
        item: itemById,
        resolvedName: itemById.name,
        price: this.calculateItemPrice(itemById, initialCustomizations),
      };
    }

    // 2. Exact Match by Name (English or Arabic)
    const exactNameMatch = items.find((item) => {
      const nameEn = item.name.trim().toLowerCase();
      const nameAr = item.nameAr ? item.nameAr.trim().toLowerCase() : "";
      return nameEn === rawQuery || (nameAr && nameAr === rawQuery);
    });

    if (exactNameMatch) {
      let nextCusts = initialCustomizations;
      if (isMealRequested) {
        const hasMealCust = (initialCustomizations || []).some((c: any) =>
          JSON.stringify(c).toLowerCase().includes("meal")
        );
        if (!hasMealCust) nextCusts = [...initialCustomizations, { title: "Option / Size", selected: ["Meal"] }];
      } else if (isSandwichRequested) {
        const hasSandwichCust = (initialCustomizations || []).some((c: any) =>
          JSON.stringify(c).toLowerCase().includes("sandwich")
        );
        if (!hasSandwichCust) nextCusts = [...initialCustomizations, { title: "Option / Size", selected: ["Sandwich"] }];
      }
      return this.resolveMenuItem(exactNameMatch.id, nextCusts);
    }

    // 3. Search and Categorize Candidates
    const cleanBase = this.normalizeDishQuery(rawQuery);

    if (!cleanBase) {
      return { error: `Menu item '${identifier}' not found` };
    }

    const candidates = items.filter((item) => {
      const nameEn = item.name.toLowerCase();
      const nameAr = (item.nameAr || "").toLowerCase();
      const normEn = this.normalizeDishQuery(nameEn);
      const normAr = this.normalizeDishQuery(nameAr);

      return (
        normEn.includes(cleanBase) ||
        cleanBase.includes(normEn) ||
        (normAr && (normAr.includes(cleanBase) || cleanBase.includes(normAr)))
      );
    });

    if (candidates.length === 0) {
      return { error: `Menu item '${identifier}' not found` };
    }

    // Classify candidates into meals vs sandwiches
    const mealCandidates = candidates.filter(
      (c) =>
        c.category.toLowerCase() === "meals" ||
        c.category.toLowerCase().includes("meal") ||
        c.name.toLowerCase().includes("meal") ||
        (c.nameAr && c.nameAr.includes("وجبة")) ||
        c.customizations?.some((cust) =>
          cust.options?.some((opt) => opt.name.toLowerCase().includes("meal"))
        )
    );

    const sandwichCandidates = candidates.filter(
      (c) =>
        c.category.toLowerCase() === "sandwiches" ||
        c.name.toLowerCase().includes("sandwich") ||
        (c.nameAr && (c.nameAr.includes("ساندويش") || c.nameAr.includes("سندويش"))) ||
        c.customizations?.some((cust) =>
          cust.options?.some((opt) => opt.name.toLowerCase().includes("sandwich"))
        )
    );

    // Intent Handling
    if (isMealRequested) {
      if (mealCandidates.length > 0) {
        const selectedMeal = mealCandidates[0];
        const hasMealCust = (initialCustomizations || []).some((c: any) =>
          JSON.stringify(c).toLowerCase().includes("meal")
        );
        const nextCusts = hasMealCust ? initialCustomizations : [...initialCustomizations, { title: "Option / Size", selected: ["Meal"] }];
        return this.resolveMenuItem(selectedMeal.id, nextCusts);
      } else {
        // Customer requested a MEAL, but only a SANDWICH exists on the menu!
        const sandwichMatch = sandwichCandidates.length > 0 ? sandwichCandidates[0] : candidates[0];
        return {
          mealUnavailable: true,
          baseName: sandwichMatch.name,
          item: sandwichMatch,
        };
      }
    }

    if (isSandwichRequested) {
      if (sandwichCandidates.length > 0) {
        const selectedSandwich = sandwichCandidates[0];
        const hasSandwichCust = (initialCustomizations || []).some((c: any) =>
          JSON.stringify(c).toLowerCase().includes("sandwich")
        );
        const nextCusts = hasSandwichCust ? initialCustomizations : [...initialCustomizations, { title: "Option / Size", selected: ["Sandwich"] }];
        return this.resolveMenuItem(selectedSandwich.id, nextCusts);
      } else {
        const match = candidates[0];
        return this.resolveMenuItem(match.id, initialCustomizations);
      }
    }

    // Neither meal nor sandwich specified in prompt (e.g., "Fajita" or "فاهيتا")
    // Check if the dish exists in both Sandwich and Meal formats
    if (mealCandidates.length > 0 && sandwichCandidates.length > 0) {
      const defaultMatch = sandwichCandidates[0] || candidates[0];
      return {
        ambiguous: true,
        baseName: defaultMatch.name,
        item: defaultMatch,
        resolvedName: defaultMatch.name,
        price: defaultMatch.price
      };
    }

    // Check if single candidate has option for both Meal and Sandwich
    const snackOptionItem = candidates.find((c) =>
      c.customizations?.some((cust) =>
        cust.options?.some((opt) => opt.name.toLowerCase() === "sandwich") &&
        cust.options?.some((opt) => opt.name.toLowerCase() === "meal")
      )
    );

    if (snackOptionItem) {
      return {
        ambiguous: true,
        baseName: snackOptionItem.name,
        item: snackOptionItem,
      };
    }

    // Default to best candidate
    return this.resolveMenuItem(candidates[0].id, initialCustomizations);
  }

  /**
   * Deterministic pairing method to find the opposite variant (Meal <-> Sandwich) for a menu/cart item
   */
  public static findOppositeVariant(
    itemOrId: MenuItem | any | string,
    targetVariantType: 'meal' | 'sandwich'
  ): {
    foundItem?: MenuItem;
    resolvedName?: string;
    price?: number;
    noVariantAvailable?: boolean;
    baseName?: string;
    error?: string;
  } {
    const allItems = this.getAllItems();
    let currentItem: MenuItem | undefined;

    if (typeof itemOrId === 'string') {
      currentItem = this.getItemById(itemOrId) || this.getItemByName(itemOrId);
    } else if (itemOrId && typeof itemOrId === 'object') {
      const idToSearch = itemOrId.itemId || itemOrId.id;
      const nameToSearch = itemOrId.name || itemOrId.itemName;
      if (idToSearch) currentItem = this.getItemById(idToSearch);
      if (!currentItem && nameToSearch) currentItem = this.getItemByName(nameToSearch);
    }

    if (!currentItem && typeof itemOrId === 'string') {
      const resolved = this.resolveMenuItem(itemOrId);
      currentItem = resolved.item;
    }

    if (!currentItem) {
      return { error: `Item '${itemOrId}' not found on menu` };
    }

    // Explicit pair map for Salein Cafe menu
    const explicitPairMap: Record<string, { mealId?: string; sandwichId?: string }> = {
      "sn-1": { mealId: "sn-1-meal", sandwichId: "sn-1-sandwich" },
      "sn-1-sandwich": { mealId: "sn-1-meal", sandwichId: "sn-1-sandwich" },
      "sn-1-meal": { sandwichId: "sn-1-sandwich", mealId: "sn-1-meal" },
      "sw-2": { mealId: "sn-1-meal", sandwichId: "sw-2" },
      "sn-2": { mealId: "sn-2-meal", sandwichId: "sn-2-sandwich" },
      "sn-2-sandwich": { mealId: "sn-2-meal", sandwichId: "sn-2-sandwich" },
      "sn-2-meal": { sandwichId: "sn-2-sandwich", mealId: "sn-2-meal" },
      "sn-3": { mealId: "sn-3-meal", sandwichId: "sn-3-sandwich" },
      "sn-3-sandwich": { mealId: "sn-3-meal", sandwichId: "sn-3-sandwich" },
      "sn-3-meal": { sandwichId: "sn-3-sandwich", mealId: "sn-3-meal" },
      "sn-4": { mealId: "sn-4-meal", sandwichId: "sn-4-sandwich" },
      "sn-4-sandwich": { mealId: "sn-4-meal", sandwichId: "sn-4-sandwich" },
      "sn-4-meal": { sandwichId: "sn-4-sandwich", mealId: "sn-4-meal" },
      "sn-5": { mealId: "sn-5-meal", sandwichId: "sn-5-sandwich" },
      "sn-5-sandwich": { mealId: "sn-5-meal", sandwichId: "sn-5-sandwich" },
      "sn-5-meal": { sandwichId: "sn-5-sandwich", mealId: "sn-5-meal" },
      "sn-6": { mealId: "sn-6-meal", sandwichId: "sn-6-sandwich" },
      "sn-6-sandwich": { mealId: "sn-6-meal", sandwichId: "sn-6-sandwich" },
      "sn-6-meal": { sandwichId: "sn-6-sandwich", mealId: "sn-6-meal" },
      "sw-3": { mealId: "sn-6-meal", sandwichId: "sw-3" },
      "sn-7": { mealId: "sn-7-meal", sandwichId: "sn-7-sandwich" },
      "sn-7-sandwich": { mealId: "sn-7-meal", sandwichId: "sn-7-sandwich" },
      "sn-7-meal": { sandwichId: "sn-7-sandwich", mealId: "sn-7-meal" },
      "sn-8": { mealId: "sn-8-meal", sandwichId: "sn-8-sandwich" },
      "sn-8-sandwich": { mealId: "sn-8-meal", sandwichId: "sn-8-sandwich" },
      "sn-8-meal": { sandwichId: "sn-8-sandwich", mealId: "sn-8-meal" },
      "sn-9": { mealId: "sn-9-meal", sandwichId: "sn-9-sandwich" },
      "sn-9-sandwich": { mealId: "sn-9-meal", sandwichId: "sn-9-sandwich" },
      "sn-9-meal": { sandwichId: "sn-9-sandwich", mealId: "sn-9-meal" },
      "sn-10": { mealId: "sn-10-meal", sandwichId: "sn-10-sandwich" },
      "sn-10-sandwich": { mealId: "sn-10-meal", sandwichId: "sn-10-sandwich" },
      "sn-10-meal": { sandwichId: "sn-10-sandwich", mealId: "sn-10-meal" },
      "sn-11": { mealId: "sn-11-meal", sandwichId: "sn-11-sandwich" },
      "sn-11-sandwich": { mealId: "sn-11-meal", sandwichId: "sn-11-sandwich" },
      "sn-11-meal": { sandwichId: "sn-11-sandwich", mealId: "sn-11-meal" },
      "sw-1": { mealId: "ml-1", sandwichId: "sw-1" },
      "ml-1": { sandwichId: "sw-1", mealId: "ml-1" }
    };

    const rawId = ((currentItem as any)?.itemId || (currentItem as any)?.id || "").toString();
    const currentId = rawId.toLowerCase();
    const explicit = explicitPairMap[rawId] || explicitPairMap[currentId];

    // Check if currentItem is ALREADY the target variant type
    const isAlreadyTarget =
      (targetVariantType === 'meal' && (currentId.endsWith('-meal') || currentItem.category?.toLowerCase() === 'meals' || (currentItem as any).itemType === 'meal')) ||
      (targetVariantType === 'sandwich' && (currentId.endsWith('-sandwich') || currentItem.category?.toLowerCase() === 'sandwiches' || (currentItem as any).itemType === 'sandwich'));

    if (isAlreadyTarget) {
      const fullItem = this.getItemById(currentId) || currentItem;
      return { foundItem: fullItem as MenuItem, resolvedName: fullItem.name, price: fullItem.price };
    }

    if (targetVariantType === 'meal' && explicit?.mealId) {
      const target = this.getItemById(explicit.mealId);
      if (target) {
        return { foundItem: target, resolvedName: target.name, price: target.price };
      }
    }

    if (targetVariantType === 'sandwich' && explicit?.sandwichId) {
      const target = this.getItemById(explicit.sandwichId);
      if (target) {
        return { foundItem: target, resolvedName: target.name, price: target.price };
      }
    }

    // Naming pattern check: sn-X-sandwich <-> sn-X-meal
    if (targetVariantType === 'meal' && currentId.endsWith('-sandwich')) {
      const mealId = currentId.replace(/-sandwich$/, '-meal');
      const target = this.getItemById(mealId);
      if (target) {
        return { foundItem: target, resolvedName: target.name, price: target.price };
      }
    } else if (targetVariantType === 'sandwich' && currentId.endsWith('-meal')) {
      const sandwichId = currentId.replace(/-meal$/, '-sandwich');
      const target = this.getItemById(sandwichId);
      if (target) {
        return { foundItem: target, resolvedName: target.name, price: target.price };
      }
    }

    // Check if currentItem has Option / Size customization for Meal vs Sandwich
    const hasVariantOption = currentItem.customizations?.some(c =>
      c.options?.some(o => o.name.toLowerCase().includes(targetVariantType))
    );

    if (hasVariantOption) {
      const optName = targetVariantType === 'meal' ? 'Meal' : 'Sandwich';
      const custs = [{ title: "Option / Size", selected: [optName] }];
      const price = this.calculateItemPrice(currentItem, custs);
      const resolvedName = currentItem.name.toLowerCase().includes(targetVariantType)
        ? currentItem.name
        : `${currentItem.name} ${optName}`;
      return { foundItem: currentItem, resolvedName, price };
    }

    // Candidate search by normalized dish name
    const baseName = this.normalizeDishQuery(currentItem.name);
    const candidates = allItems.filter(item => {
      const norm = this.normalizeDishQuery(item.name);
      return (norm.includes(baseName) || baseName.includes(norm)) && item.id.toLowerCase() !== currentId;
    });

    const matchingVariant = candidates.find(candidate => {
      const cat = candidate.category.toLowerCase();
      const name = candidate.name.toLowerCase();
      if (targetVariantType === 'meal') {
        return cat === 'meals' || name.includes('meal') || candidate.id.endsWith('-meal');
      } else {
        return cat === 'sandwiches' || name.includes('sandwich') || candidate.id.endsWith('-sandwich');
      }
    });

    if (matchingVariant) {
      return { foundItem: matchingVariant, resolvedName: matchingVariant.name, price: matchingVariant.price };
    }

    // No variant available on the menu
    return {
      noVariantAvailable: true,
      baseName: currentItem.name,
      error: `No ${targetVariantType} option exists for ${currentItem.name} on the menu.`
    };
  }

  public static getItemByName(name: string): MenuItem | undefined {
    if (!name) return undefined;
    const resolved = this.resolveMenuItem(name);
    return resolved.item;
  }

  public static searchMenu(query: string): MenuItem[] {
    if (!query) return [];
    const items = this.getAllItems();
    const q = query.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.nameAr && item.nameAr.toLowerCase().includes(q)) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        item.ingredients.some((ing) => ing.toLowerCase().includes(q))
    );
  }

  public static getCategoryItems(category: string): MenuItem[] {
    const items = this.getAllItems();
    return items.filter((item) => item.category.toLowerCase() === category.toLowerCase());
  }

  public static calculateItemPrice(item: MenuItem, selectedCustomizations: CustomizationOption[] | any = []): number {
    // ALWAYS look up the latest live menu item by ID to get the current database price
    const itemId = (item as any)?.itemId || item.id;
    const latestItem = this.getItemById(itemId) || item;
    let price = latestItem.price;

    if (!latestItem.customizations || !Array.isArray(latestItem.customizations) || latestItem.customizations.length === 0) {
      return Number(price.toFixed(2));
    }

    // Flatten all selected option strings
    const selectedOptionStrings: string[] = [];
    if (Array.isArray(selectedCustomizations)) {
      for (const cust of selectedCustomizations) {
        if (typeof cust === "string") {
          selectedOptionStrings.push(cust);
        } else if (cust && Array.isArray(cust.selected)) {
          for (const s of cust.selected) {
            if (typeof s === "string") selectedOptionStrings.push(s);
          }
        } else if (cust && typeof cust.name === "string") {
          selectedOptionStrings.push(cust.name);
        }
      }
    }

    const matchedOptions = new Set<string>();

    for (const optStr of selectedOptionStrings) {
      const cleanOpt = optStr.trim().toLowerCase();
      if (!cleanOpt) continue;

      for (const menuCust of latestItem.customizations) {
        if (!Array.isArray(menuCust.options)) continue;
        for (const o of menuCust.options) {
          const menuOptName = o.name.toLowerCase();
          const optionKey = `${menuCust.title}:${o.name}`;

          if (matchedOptions.has(optionKey)) continue;

          if (
            menuOptName === cleanOpt ||
            menuOptName.includes(cleanOpt) ||
            cleanOpt.includes(menuOptName)
          ) {
            price += o.priceModifier;
            matchedOptions.add(optionKey);
            break;
          }
        }
      }
    }

    return Number(price.toFixed(2));
  }
}


