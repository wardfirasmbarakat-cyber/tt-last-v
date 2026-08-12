import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Heart,
  Clock,
  Star,
  Flame,
  Tag,
  Plus,
  Check,
  Info,
  X,
  ChevronRight,
  Eye,
  ShieldCheck,
  ChefHat,
  SlidersHorizontal,
  Sparkles,
  Bot,
  Mic,
  ShoppingCart,
  ArrowRight,
  Filter,
  Utensils,
  Coffee,
  Pizza,
  Sandwich,
  Salad,
  GlassWater,
  IceCream,
  CupSoda,
  Sparkle
} from "lucide-react";
import {
  MENU_ITEMS,
  MenuItem,
  getCategoryName,
  getItemName,
  getItemDescription,
  getItemImage,
  DEFAULT_MENU_ITEM_IMAGE,
  CATEGORY_TRANSLATIONS
} from "../data/menu";
import { CartItem } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { collection, onSnapshot, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { safeLocalStorage } from "../utils/safeStorage";

interface MenuViewProps {
  onAddToCart: (item: CartItem) => void;
  favorites: string[]; // List of favorited item IDs
  onToggleFavorite: (itemId: string) => Promise<void>;
  isSignedIn: boolean;
  onOpenLogin: () => void;
  onAskWard?: (query: string) => void;
  cart?: CartItem[];
  onNavigateToCart?: () => void;
}

const CATEGORIES = [
  "All",
  "Meals",
  "Sandwiches",
  "Snacks",
  "Extras Sauce",
  "Shawarma",
  "Grilled Chicken Burger",
  "Hot Dog",
  "Chicken Wings & Healthy Meal",
  "Crispy",
  "Salads",
  "Burgers",
  "Sides",
  "Hot Drinks",
  "Iced Drinks",
  "Cold Beverages",
  "Fresh Juices",
  "Special Cocktails",
  "Frappe",
  "Fruit Salads",
  "Hookah"
];

const DIETARY_FILTERS = [
  { nameAr: "الأكثر طلباً", nameEn: "Popular", tag: "Popular", icon: "🔥" },
  { nameAr: "جديدنا", nameEn: "New Arrivals", tag: "New", icon: "✨" },
  { nameAr: "توصية الشيف", nameEn: "Chef Specials", tag: "Chef Special", icon: "👨‍🍳" },
  { nameAr: "نباتي", nameEn: "Vegetarian", tag: "Vegetarian", icon: "🌱" },
  { nameAr: "خالي من الغلوتين", nameEn: "Gluten-Free", tag: "Gluten-Free", icon: "🌾" },
  { nameAr: "حار", nameEn: "Spicy", tag: "Spicy", icon: "🌶️" },
  { nameAr: "ساخن", nameEn: "Hot", tag: "Hot", icon: "☕" },
  { nameAr: "بارد", nameEn: "Cold", tag: "Cold", icon: "🧊" },
  { nameAr: "متوفر اليوم", nameEn: "Available Today", tag: "Available", icon: "✅" }
];

const ALLERGEN_OPTIONS = [
  { labelAr: "غلوتين", labelEn: "Gluten", value: "Gluten", icon: "🌾" },
  { labelAr: "مشتقات الحليب", labelEn: "Dairy", value: "Milk", icon: "🥛" },
  { labelAr: "بيض", labelEn: "Eggs", value: "Eggs", icon: "🍳" },
  { labelAr: "مكسرات", labelEn: "Nuts", value: "Nuts", icon: "🥜" },
  { labelAr: "مأكولات بحرية", labelEn: "Seafood", value: "Shellfish", icon: "🦐" },
  { labelAr: "صويا", labelEn: "Soy", value: "Soy", icon: "🫘" }
];

const getCategoryIcon = (category: string) => {
  const catLower = category.toLowerCase();
  if (catLower.includes("coffee") || catLower.includes("hot drink")) return Coffee;
  if (catLower.includes("iced") || catLower.includes("cold") || catLower.includes("beverage")) return GlassWater;
  if (catLower.includes("burger")) return Utensils;
  if (catLower.includes("pizza")) return Pizza;
  if (catLower.includes("snack") || catLower.includes("sandwich") || catLower.includes("shawarma")) return Sandwich;
  if (catLower.includes("salad")) return Salad;
  if (catLower.includes("dessert") || catLower.includes("cake") || catLower.includes("fruit")) return IceCream;
  if (catLower.includes("juice") || catLower.includes("cocktail") || catLower.includes("frappe")) return CupSoda;
  return ChefHat;
};

export default function MenuView({
  onAddToCart,
  favorites,
  onToggleFavorite,
  isSignedIn,
  onOpenLogin,
  onAskWard,
  cart = [],
  onNavigateToCart
}: MenuViewProps) {
  const { t, language, isArabic } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedDietaryTags, setSelectedDietaryTags] = useState<string[]>([]);
  const [avoidAllergens, setAvoidAllergens] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  // Real-time Firestore Menu Items & Categories
  const [menuItems, setMenuItems] = useState<MenuItem[]>(MENU_ITEMS);
  const [categoriesList, setCategoriesList] = useState<string[]>(CATEGORIES);

  // Item Details Modal Customization States
  const [customizationChoices, setCustomizationChoices] = useState<Record<string, string[]>>({});
  const [customQuantity, setCustomQuantity] = useState(1);
  const [itemNote, setItemNote] = useState("");
  const [addedSuccessToast, setAddedSuccessToast] = useState<string | null>(null);

  // Sync menu items & categories from Firestore
  useEffect(() => {
    const unsubItems = onSnapshot(collection(db, "menuItems"), (snap) => {
      if (!snap.empty) {
        const items: MenuItem[] = [];
        snap.forEach((d) => {
          const item = d.data() as MenuItem;
          if (!item.isArchived && item.availability !== 'hidden') {
            items.push(item);
          }
        });
        if (items.length > 0) {
          setMenuItems(items);
        }
      }
    }, (err) => {
      console.warn("MenuView menuItems listener warning:", err);
    });

    const unsubSettingsCat = onSnapshot(doc(db, "settings", "categories"), (docSnap) => {
      if (docSnap.exists() && Array.isArray(docSnap.data()?.list)) {
        const catNames: string[] = docSnap.data().list;
        if (catNames.length > 0) {
          setCategoriesList(Array.from(new Set(["All", "Meals", ...catNames.filter(c => c !== "All")])));
        }
      }
    }, (err) => {
      console.warn("MenuView settings/categories listener warning:", err);
    });

    const unsubCat = onSnapshot(collection(db, "categories"), (snap) => {
      if (!snap.empty) {
        const catNames = snap.docs.map(d => d.data().name as string).filter(Boolean);
        if (catNames.length > 0) {
          setCategoriesList(prev => {
            return Array.from(new Set(["All", "Meals", ...prev.filter(c => c !== "All"), ...catNames.filter(c => c !== "All")]));
          });
        }
      }
    }, (err) => {
      console.warn("MenuView categories listener warning:", err);
    });

    return () => {
      unsubItems();
      unsubSettingsCat();
      unsubCat();
    };
  }, []);

  // Filter items based on search query, dietary tags, and allergens
  const filteredItems = menuItems.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    const nameEn = (item.name || "").toLowerCase();
    const nameAr = getItemName(item, 'ar').toLowerCase();
    const descEn = (item.description || "").toLowerCase();
    const descAr = getItemDescription(item, 'ar').toLowerCase();
    const categoryName = (item.category || "").toLowerCase();

    const matchesSearch = !query ||
      nameEn.includes(query) ||
      nameAr.includes(query) ||
      descEn.includes(query) ||
      descAr.includes(query) ||
      categoryName.includes(query) ||
      (item.ingredients && item.ingredients.some(ing => ing.toLowerCase().includes(query))) ||
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)));

    const matchesCategory = activeCategory === "All" ||
      ((item.category || "").trim().toLowerCase() === activeCategory.trim().toLowerCase());

    const matchesDietary = selectedDietaryTags.length === 0 ||
      selectedDietaryTags.every((tag) => {
        if (tag === "Popular") return item.tags?.includes("Popular") || item.tags?.includes("Best Seller");
        if (tag === "Chef Special") return item.tags?.includes("Chef Special");
        if (tag === "New") return item.tags?.includes("New");
        if (tag === "Available") return item.availability === "available" || !item.availability;
        return item.tags?.includes(tag);
      });

    const matchesAllergens = avoidAllergens.length === 0 ||
      !(item.allergens && item.allergens.some((allg) => avoidAllergens.includes(allg)));

    return matchesSearch && matchesCategory && matchesDietary && matchesAllergens;
  });

  // Group items by category for section layout
  const categoriesToRender = categoriesList.filter((cat) => {
    if (cat === "All") return false;
    const catItems = filteredItems.filter(i => (i.category || "").trim().toLowerCase() === cat.trim().toLowerCase());
    return catItems.length > 0;
  });

  // Scroll Spy Observer to update active category tab as customer scrolls
  useEffect(() => {
    if (activeCategory !== "All" && searchQuery) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const catId = entry.target.getAttribute("data-category-name");
            if (catId) {
              setActiveCategory(catId);
            }
          }
        });
      },
      {
        root: null,
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0
      }
    );

    categoriesToRender.forEach((cat) => {
      const id = `category-section-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [categoriesToRender, searchQuery]);

  const handleSelectCategoryTab = (cat: string) => {
    setActiveCategory(cat);
    if (cat === "All") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const id = `category-section-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const el = document.getElementById(id);
    if (el) {
      const offset = 120;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
  };

  const toggleDietaryTag = (tag: string) => {
    if (selectedDietaryTags.includes(tag)) {
      setSelectedDietaryTags(selectedDietaryTags.filter(t => t !== tag));
    } else {
      setSelectedDietaryTags([...selectedDietaryTags, tag]);
    }
  };

  const openCustomizer = (item: MenuItem) => {
    setSelectedItem(item);
    setCustomQuantity(1);
    setItemNote("");

    const defaults: Record<string, string[]> = {};
    if (item.customizations) {
      item.customizations.forEach((cust) => {
        if (cust.type === "select" && cust.options.length > 0) {
          defaults[cust.title] = [cust.options[0].name];
        } else {
          defaults[cust.title] = [];
        }
      });
    }
    setCustomizationChoices(defaults);
  };

  const handleSelectOption = (custTitle: string, optionName: string, isMultiselect: boolean) => {
    const current = customizationChoices[custTitle] || [];
    if (isMultiselect) {
      if (current.includes(optionName)) {
        setCustomizationChoices({
          ...customizationChoices,
          [custTitle]: current.filter(o => o !== optionName)
        });
      } else {
        setCustomizationChoices({
          ...customizationChoices,
          [custTitle]: [...current, optionName]
        });
      }
    } else {
      setCustomizationChoices({
        ...customizationChoices,
        [custTitle]: [optionName]
      });
    }
  };

  const calculateCustomizedPrice = (): number => {
    if (!selectedItem) return 0;
    let price = selectedItem.price;

    if (selectedItem.customizations) {
      selectedItem.customizations.forEach((cust) => {
        const selected = customizationChoices[cust.title] || [];
        selected.forEach((optName) => {
          const option = cust.options.find(o => o.name === optName);
          if (option) {
            price += option.priceModifier;
          }
        });
      });
    }

    return price * customQuantity;
  };

  const handleAddToCart = () => {
    if (!selectedItem) return;

    const itemPrice = calculateCustomizedPrice() / customQuantity;

    const cartItem: CartItem = {
      id: `${selectedItem.id}_${Date.now()}`,
      itemId: selectedItem.id,
      name: selectedItem.name,
      image: selectedItem.image || "",
      basePrice: selectedItem.price,
      customizations: Object.entries(customizationChoices).map(([title, selected]) => ({
        title,
        selected: selected as string[]
      })),
      price: itemPrice,
      quantity: customQuantity,
      note: itemNote.trim() || undefined
    };

    onAddToCart(cartItem);
    
    // Show quick toast notification
    const itemName = getItemName(selectedItem, language);
    setAddedSuccessToast(isArabic ? `تمت إضافة ${itemName} إلى الطلب` : `Added ${itemName} to your order`);
    setTimeout(() => setAddedSuccessToast(null), 2500);

    setSelectedItem(null);
  };

  // Cart summary calculations
  const totalCartItems = cart.reduce((acc, i) => acc + i.quantity, 0);
  const totalCartPrice = cart.reduce((acc, i) => acc + (i.price * i.quantity), 0);

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto pb-28 font-sans">
      {/* Toast Notification */}
      <AnimatePresence>
        {addedSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#C9A050] text-[#050505] font-bold text-xs px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-white/20"
          >
            <Check className="w-4 h-4 text-[#050505]" />
            <span>{addedSuccessToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice AI Assistant Header Banner */}
      <div className="mb-5 bg-gradient-to-r from-[#C9A050]/20 via-black/60 to-black/80 border border-[#C9A050]/40 rounded-[28px] p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden backdrop-blur-xl">
        <div className="flex items-center gap-3.5 z-10">
          <div className="w-12 h-12 rounded-2xl bg-[#C9A050] text-[#050505] flex items-center justify-center shrink-0 shadow-lg shadow-[#C9A050]/20">
            <Bot className="w-6.5 h-6.5 text-[#050505] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-white text-sm sm:text-base">
                Ward | ورد — Voice AI Waiter
              </h3>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] uppercase font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live
              </span>
            </div>
            <p className="text-xs text-[#bbbbbb] mt-0.5">
              {isArabic
                ? "اسأل ورد عن مكونات المأكولات والمشروبات، التوصيات، أو اطلب بصوتك مباشرة!"
                : "Ask Ward about ingredients, recommendations, or order directly by voice!"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto z-10 shrink-0">
          <button
            id="menu-talk-to-ward-btn"
            onClick={() => onAskWard ? onAskWard("Hi Ward! What do you recommend from the menu today?") : null}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#C9A050] hover:bg-[#b08b40] text-[#050505] font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Mic className="w-4 h-4 text-[#050505]" />
            <span>{isArabic ? "تحدث مع ورد بالصوت" : "Talk to Ward (Voice AI)"}</span>
          </button>
        </div>
      </div>

      {/* STICKY TOP NAVIGATION BAR: SEARCH + CATEGORY SCROLLBAR */}
      <div className="sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-2xl border-b border-white/10 py-3 -mx-3 sm:-mx-6 px-3 sm:px-6 shadow-2xl space-y-3">
        {/* Prominent Search Input */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-[#C9A050]">
            <Search className="w-4 h-4" />
          </span>
          <input
            id="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isArabic ? "ابحث عن اسبريسو، زنجر، شاورما، أرجيلة، خالي من الغلوتين..." : "Search coffee, burgers, shawarma, hookah, gluten-free..."}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-10 pr-10 text-xs sm:text-sm font-sans focus:outline-none focus:border-[#C9A050]/60 placeholder:text-white/30 transition-all text-white shadow-inner"
          />
          {searchQuery && (
            <button
              id="clear-search-btn"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/40 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Header */}
        <div className="flex items-center justify-between pt-1 pb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#C9A050]/20 border border-[#C9A050]/40 flex items-center justify-center text-[#C9A050]">
              <Utensils className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-xl font-display font-extrabold text-white tracking-wide">
              {isArabic ? "اختر التصنيف الرئيسي" : "Choose a Category"}
            </h2>
          </div>
          <span className="text-[11px] font-mono font-bold text-[#C9A050] bg-[#C9A050]/10 px-3 py-1 rounded-full border border-[#C9A050]/20">
            {categoriesList.length - 1} {isArabic ? "تصنيفات" : "Categories"}
          </span>
        </div>

        {/* Horizontal Category Scroll Bar */}
        <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-none scroll-smooth items-center">
          {categoriesList.map((cat) => {
            const isActive = activeCategory === cat;
            const catItemsCount = menuItems.filter(i => cat === "All" ? true : (i.category || "").trim().toLowerCase() === cat.trim().toLowerCase()).length;
            if (cat !== "All" && catItemsCount === 0 && searchQuery) return null;

            const CatIcon = cat === "All" ? Sparkles : getCategoryIcon(cat);

            return (
              <button
                id={`category-tab-${cat.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                key={cat}
                onClick={() => handleSelectCategoryTab(cat)}
                className={`flex items-center gap-3 px-4 py-3 rounded-[22px] text-sm sm:text-base font-extrabold border min-h-[64px] min-w-[150px] sm:min-w-[170px] whitespace-nowrap transition-all duration-300 cursor-pointer shadow-lg shrink-0 justify-between ${
                  isActive
                    ? "bg-[#C9A050] text-[#050505] border-[#C9A050] shadow-xl shadow-[#C9A050]/25 scale-105 z-10"
                    : "bg-white/5 text-white/90 border-white/10 hover:bg-white/10 hover:border-[#C9A050]/40 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? "bg-black/20 text-[#050505]"
                      : "bg-white/10 text-[#C9A050]"
                  }`}>
                    <CatIcon className="w-5 h-5" />
                  </div>
                  <span className="font-display tracking-tight text-sm sm:text-base">
                    {cat === "All" ? (isArabic ? "الكل" : "All") : getCategoryName(cat, language)}
                  </span>
                </div>

                <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                  isActive ? "bg-black/20 text-[#050505]" : "bg-white/10 text-white/60"
                }`}>
                  {catItemsCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dietary Filters Pill Row */}
      <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-none text-xs">
        <span className="text-[10px] font-mono font-bold uppercase text-white/40 shrink-0 flex items-center gap-1">
          <Filter className="w-3 h-3 text-[#C9A050]" />
          <span>{isArabic ? "فلترة:" : "Filter:"}</span>
        </span>

        {DIETARY_FILTERS.map((filter) => {
          const isSelected = selectedDietaryTags.includes(filter.tag);
          return (
            <button
              id={`dietary-filter-${filter.tag.replace(' ', '-').toLowerCase()}`}
              key={filter.tag}
              onClick={() => toggleDietaryTag(filter.tag)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                isSelected
                  ? "bg-[#C9A050]/20 text-[#C9A050] border-[#C9A050]/40 font-bold shadow-md"
                  : "bg-white/5 text-white/60 border-white/5 hover:bg-white/10 hover:border-white/10"
              }`}
            >
              <span>{filter.icon}</span>
              <span>{isArabic ? filter.nameAr : filter.nameEn}</span>
              {isSelected && <Check className="w-3 h-3 text-[#C9A050] shrink-0" />}
            </button>
          );
        })}

        {selectedDietaryTags.length > 0 && (
          <button
            id="clear-dietary-filters-btn"
            onClick={() => setSelectedDietaryTags([])}
            className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline shrink-0 cursor-pointer px-1"
          >
            {isArabic ? "إلغاء الفلاتر" : "Reset"}
          </button>
        )}
      </div>

      {/* Allergy Safety Guard Accordion */}
      <div className="mb-6 bg-white/5 border border-white/10 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="font-display font-bold text-xs sm:text-sm text-white">
              {isArabic ? "فلترة الحساسية الغذائية" : "Allergy Safety Filter"}
            </h3>
          </div>
          {avoidAllergens.length > 0 && (
            <button
              id="clear-allergy-filter-btn"
              onClick={() => setAvoidAllergens([])}
              className="text-[10px] text-emerald-400 hover:underline cursor-pointer font-mono"
            >
              {isArabic ? "مسح الحساسية" : "Clear Allergy"}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ALLERGEN_OPTIONS.map((allergy) => {
            const isAvoiding = avoidAllergens.includes(allergy.value);
            return (
              <button
                id={`allergy-filter-${allergy.value.toLowerCase()}`}
                key={allergy.value}
                onClick={() => {
                  if (isAvoiding) {
                    setAvoidAllergens(avoidAllergens.filter(a => a !== allergy.value));
                  } else {
                    setAvoidAllergens([...avoidAllergens, allergy.value]);
                  }
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                  isAvoiding
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                <span>{allergy.icon}</span>
                <span>{isArabic ? allergy.labelAr : allergy.labelEn}</span>
                {isAvoiding && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ORGANIZED MENU SECTION DISPLAY */}
      {activeCategory === "All" && !searchQuery && selectedDietaryTags.length === 0 ? (
        /* RENDER CATEGORY BY CATEGORY SECTIONS */
        <div className="space-y-10">
          {categoriesToRender.map((category) => {
            const catItems = filteredItems.filter(i => (i.category || "").trim().toLowerCase() === category.trim().toLowerCase());
            if (catItems.length === 0) return null;

            const CatIcon = getCategoryIcon(category);

            return (
              <section
                key={category}
                id={`category-section-${category.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                data-category-name={category}
                className="scroll-mt-36"
              >
                {/* Category Section Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#C9A050]/15 border border-[#C9A050]/30 flex items-center justify-center text-[#C9A050]">
                      <CatIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-display font-bold text-white flex items-center gap-2">
                        <span>{getCategoryName(category, language)}</span>
                        {language === 'ar' && (
                          <span className="text-xs font-sans text-white/40 font-normal">({category})</span>
                        )}
                      </h2>
                      <p className="text-[11px] text-white/50">
                        {catItems.length} {isArabic ? "أصناف متوفرة" : "items available"}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-[#C9A050] bg-[#C9A050]/10 px-3 py-1 rounded-full border border-[#C9A050]/20">
                    {category}
                  </span>
                </div>

                {/* Grid of Item Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {catItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      favorites={favorites}
                      onToggleFavorite={onToggleFavorite}
                      onOpenCustomizer={openCustomizer}
                      onAskWard={onAskWard}
                      isArabic={isArabic}
                      language={language}
                      t={t}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* SINGLE FILTERED GRID DISPLAY */
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>{isArabic ? "نتائج البحث والفلترة" : "Filtered Results"}</span>
              <span className="text-xs font-mono text-[#C9A050] bg-[#C9A050]/10 px-2.5 py-0.5 rounded-full border border-[#C9A050]/20">
                {filteredItems.length} {isArabic ? "أصناف" : "items"}
              </span>
            </h2>
          </div>

          {filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  favorites={favorites}
                  onToggleFavorite={onToggleFavorite}
                  onOpenCustomizer={openCustomizer}
                  onAskWard={onAskWard}
                  isArabic={isArabic}
                  language={language}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center bg-white/5 border border-white/10 rounded-3xl p-8 space-y-3">
              <Info className="w-10 h-10 text-white/30 mx-auto" />
              <h3 className="text-base font-bold text-white">
                {isArabic ? "لم يتم العثور على نتائج مطابقة" : "No matching items found"}
              </h3>
              <p className="text-xs text-white/50 max-w-sm mx-auto">
                {isArabic
                  ? "جرب إزالة بعض الفلاتر أو كتابة اسم صنف آخر في شريط البحث."
                  : "Try clearing search filters or entering another keyword."}
              </p>
              <button
                id="reset-all-filters-btn"
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory("All");
                  setSelectedDietaryTags([]);
                  setAvoidAllergens([]);
                }}
                className="px-4 py-2 bg-[#C9A050] text-[#050505] font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer mt-2"
              >
                {isArabic ? "إعادة ضبط البحث والكل" : "Reset All Filters"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ITEM DETAILS & CUSTOMIZATION MODAL */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-[#0e0e12] border border-white/10 w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[92vh] text-white"
            >
              {/* Image Preview Header */}
              <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-zinc-950 border-b border-white/10 shrink-0 flex items-center justify-center">
                {getItemImage(selectedItem) ? (
                  <img
                    src={getItemImage(selectedItem)}
                    alt={getItemName(selectedItem, language)}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_MENU_ITEM_IMAGE;
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#C9A050]/15 border border-[#C9A050]/30 flex items-center justify-center mb-2 text-[#C9A050]">
                      <ChefHat className="w-7 h-7" />
                    </div>
                    <span className="text-xs font-semibold text-white/60">
                      {getItemName(selectedItem, language)}
                    </span>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e12] via-black/30 to-black/60 pointer-events-none" />

                {/* Overlaid Title & Category */}
                <div className="absolute bottom-4 left-5 right-5 z-10">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#C9A050] font-bold bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md border border-[#C9A050]/30 inline-block mb-1 shadow-md">
                    {getCategoryName(selectedItem.category, language)}
                  </span>
                  <h3 className="text-lg sm:text-xl font-display font-bold text-white leading-tight drop-shadow-md">
                    {getItemName(selectedItem, language)}
                  </h3>
                  {getItemName(selectedItem, 'en') !== getItemName(selectedItem, 'ar') && (
                    <p className="text-xs text-white/60 font-sans mt-0.5">
                      {isArabic ? selectedItem.name : selectedItem.nameAr || selectedItem.name}
                    </p>
                  )}
                </div>

                {/* Close Button */}
                <button
                  id="close-item-modal-btn"
                  onClick={() => setSelectedItem(null)}
                  className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-[#C9A050] border border-white/20 flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer shrink-0 z-20 shadow-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 text-right font-sans">
                {/* Description & Base Price */}
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                      {getItemDescription(selectedItem, language)}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-base text-[#C9A050] bg-[#C9A050]/10 border border-[#C9A050]/20 px-3 py-1 rounded-xl shrink-0">
                    {selectedItem.price.toFixed(2)} JD
                  </span>
                </div>

                {/* Customization Options */}
                {selectedItem.customizations && selectedItem.customizations.length > 0 && (
                  <div className="space-y-4 pt-2 border-t border-white/10">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9A050] flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>{isArabic ? "خيارات التخصيص والحجم" : "Customization Options"}</span>
                    </h4>

                    {selectedItem.customizations.map((cust) => {
                      const isMultiselect = cust.type === "multiselect";
                      const currentSelected = customizationChoices[cust.title] || [];

                      return (
                        <div key={cust.title} className="space-y-2">
                          <label className="text-xs font-bold text-white/80 block">
                            {cust.title} {isMultiselect && <span className="text-[10px] text-white/50 font-normal">(اختيار متعدد)</span>}
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {cust.options.map((opt) => {
                              const isSelected = currentSelected.includes(opt.name);
                              return (
                                <button
                                  id={`modal-opt-${cust.title.replace(' ', '-')}-${opt.name.replace(' ', '-')}`}
                                  key={opt.name}
                                  onClick={() => handleSelectOption(cust.title, opt.name, isMultiselect)}
                                  className={`p-3 rounded-xl border text-right text-xs font-bold flex justify-between items-center transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-[#C9A050]/20 border-[#C9A050] text-[#C9A050]"
                                      : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                                  }`}
                                >
                                  <span>{opt.name}</span>
                                  {opt.priceModifier > 0 && (
                                    <span className="font-mono text-[10px] text-[#C9A050]">
                                      +{opt.priceModifier.toFixed(2)} JD
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Special Instructions Note Text Box */}
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <label className="text-xs font-bold text-white/80 block">
                    {isArabic ? "ملاحظات وتعليمات خاصة للطلب:" : "Special Instructions / Note:"}
                  </label>
                  <textarea
                    id="item-special-note-input"
                    rows={2}
                    value={itemNote}
                    onChange={(e) => setItemNote(e.target.value)}
                    placeholder={isArabic ? "مثال: بدون بصل، صوص إضافي، حليب شوفان..." : "e.g., No onions, extra hot, oat milk..."}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[#C9A050]/50 placeholder:text-white/30 resize-none"
                  />
                </div>

                {/* Ingredients & Allergens */}
                {selectedItem.ingredients && selectedItem.ingredients.length > 0 && (
                  <div className="pt-2 border-t border-white/10 text-xs text-white/60 space-y-1">
                    <span className="font-bold text-white/80 block">{isArabic ? "المكونات:" : "Ingredients:"}</span>
                    <p className="text-[11px] leading-relaxed">{selectedItem.ingredients.join(", ")}</p>
                  </div>
                )}
              </div>

              {/* Sticky Footer: Quantity Selector & Add Button */}
              <div className="p-4 border-t border-white/10 bg-[#09090c] flex items-center justify-between gap-3 shrink-0">
                {/* Quantity Controls */}
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-1.5 shrink-0">
                  <button
                    id="decrease-modal-qty"
                    onClick={() => setCustomQuantity(Math.max(1, customQuantity - 1))}
                    className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center font-bold text-sm cursor-pointer hover:bg-white/20 text-[#C9A050] transition-colors"
                  >
                    -
                  </button>
                  <span className="font-mono text-sm font-bold w-6 text-center text-white">
                    {customQuantity}
                  </span>
                  <button
                    id="increase-modal-qty"
                    onClick={() => setCustomQuantity(customQuantity + 1)}
                    className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center font-bold text-sm cursor-pointer hover:bg-white/20 text-[#C9A050] transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Submit Add to Cart Button */}
                <button
                  id="add-to-cart-modal-btn"
                  onClick={handleAddToCart}
                  className="flex-1 bg-[#C9A050] hover:bg-[#b08b40] text-[#050505] font-bold py-3 px-4 rounded-2xl text-xs sm:text-sm shadow-xl transition-all active:scale-95 flex items-center justify-between cursor-pointer"
                >
                  <span>{isArabic ? "إضافة إلى السلة" : "Add to Cart"}</span>
                  <span className="font-mono bg-black/20 px-2.5 py-1 rounded-xl text-xs font-bold">
                    {calculateCustomizedPrice().toFixed(2)} JD
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FLOATING MOBILE BOTTOM CART SUMMARY BAR */}
      {totalCartItems > 0 && onNavigateToCart && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-16 sm:bottom-6 left-4 right-4 z-40 max-w-xl mx-auto"
        >
          <button
            id="floating-view-cart-bar"
            onClick={onNavigateToCart}
            className="w-full bg-[#C9A050] text-[#050505] p-3.5 rounded-2xl shadow-2xl flex items-center justify-between font-bold text-xs sm:text-sm transition-all active:scale-[0.98] border border-white/20 cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-black/20 flex items-center justify-center font-mono text-xs font-bold">
                {totalCartItems}
              </div>
              <span>{isArabic ? "عرض السلة والطلب" : "View Cart & Checkout"}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold bg-black/20 px-2.5 py-1 rounded-xl">
                {totalCartPrice.toFixed(2)} JD
              </span>
              <ArrowRight className="w-4 h-4 rotate-180" />
            </div>
          </button>
        </motion.div>
      )}
    </div>
  );
}

// Sub-component for individual Menu Item Cards
interface MenuItemCardProps {
  item: MenuItem;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onOpenCustomizer: (item: MenuItem) => void;
  onAskWard?: (query: string) => void;
  isArabic: boolean;
  language: 'ar' | 'en';
  t: any;
}

function MenuItemCard({
  item,
  favorites,
  onToggleFavorite,
  onOpenCustomizer,
  onAskWard,
  isArabic,
  language,
  t
}: MenuItemCardProps) {
  const isFav = favorites.includes(item.id);
  const imageUrl = getItemImage(item);
  const isSoldOut = item.availability === "sold_out" || item.availability === "unavailable";

  return (
    <motion.div
      id={`menu-item-card-${item.id}`}
      whileHover={{ y: -3 }}
      className="bg-white/5 border border-white/10 rounded-[24px] p-4 flex flex-col justify-between group hover:border-[#C9A050]/50 transition-all shadow-xl relative overflow-hidden"
    >
      <div>
        {/* Card Image Area with Badges */}
        <div className="relative w-full h-40 mb-3 rounded-2xl overflow-hidden bg-gradient-to-br from-zinc-900 to-black border border-white/10 shrink-0 flex items-center justify-center">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={getItemName(item, language)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_MENU_ITEM_IMAGE;
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#C9A050]/10 border border-[#C9A050]/20 flex items-center justify-center mb-1 text-[#C9A050]">
                <ChefHat className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-medium text-white/40">
                {getItemName(item, language)}
              </span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

          {/* Badges Overlaid */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 flex-wrap z-10">
            {isSoldOut ? (
              <span className="bg-rose-500/90 text-white border border-rose-400 text-[9px] font-bold px-2 py-0.5 rounded-md shadow-md">
                {isArabic ? "غير متوفر" : "Sold Out"}
              </span>
            ) : item.tags?.includes("Chef Special") ? (
              <span className="bg-amber-500/90 text-white border border-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-md shadow-md flex items-center gap-1">
                <Flame className="w-3 h-3" /> {isArabic ? "خاص" : "Special"}
              </span>
            ) : item.tags?.includes("Best Seller") || item.tags?.includes("Popular") ? (
              <span className="bg-[#C9A050] text-[#050505] text-[9px] font-bold px-2 py-0.5 rounded-md shadow-md">
                ★ {isArabic ? "الأكثر طلباً" : "Popular"}
              </span>
            ) : null}
          </div>

          {/* Favorite Heart Button */}
          <button
            id={`fav-toggle-${item.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(item.id);
            }}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center transition-all cursor-pointer z-10 shadow-md"
          >
            <Heart className={`w-4 h-4 ${isFav ? "fill-red-500 text-red-500 animate-pulse" : "text-white/80"}`} />
          </button>
        </div>

        {/* Item Names & Price */}
        <div className="flex justify-between items-start gap-2 mb-1">
          <div className="flex-1">
            <h3 className="font-display font-bold text-white text-sm sm:text-base group-hover:text-[#C9A050] transition-colors leading-snug">
              {getItemName(item, language)}
            </h3>
            {getItemName(item, 'en') !== getItemName(item, 'ar') && (
              <span className="text-[10px] text-white/50 block font-sans">
                {isArabic ? item.name : item.nameAr || item.name}
              </span>
            )}
          </div>

          <span className="font-mono font-bold text-[#C9A050] text-sm bg-[#C9A050]/10 px-2.5 py-1 rounded-xl border border-[#C9A050]/20 shrink-0">
            {item.price.toFixed(2)} <span className="text-[10px] font-sans">JD</span>
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-white/60 line-clamp-2 leading-relaxed my-2">
          {getItemDescription(item, language)}
        </p>

        {/* Allergens / Ingredients chips */}
        {item.allergens && item.allergens.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 my-2">
            <span className="text-[9px] font-mono text-white/30">{isArabic ? "الحساسية:" : "Contains:"}</span>
            {item.allergens.map((alg) => (
              <span key={alg} className="text-[9px] font-mono bg-white/5 text-white/50 border border-white/5 px-1.5 py-0.2 rounded-md">
                {alg === "Milk" ? "Dairy" : alg}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="pt-3 border-t border-white/10 flex items-center gap-2 mt-2">
        <button
          id={`view-details-${item.id}`}
          onClick={() => onOpenCustomizer(item)}
          className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-[#C9A050]" />
          <span>{isArabic ? "التفاصيل والخيارات" : "Options"}</span>
        </button>

        <button
          id={`quick-add-${item.id}`}
          onClick={() => {
            if (isSoldOut) return;
            onOpenCustomizer(item);
          }}
          disabled={isSoldOut}
          className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 ${
            isSoldOut
              ? "bg-white/10 text-white/30 cursor-not-allowed"
              : "bg-[#C9A050] hover:bg-[#b08b40] text-[#050505] shadow-md active:scale-95"
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>{isArabic ? "إضافة" : "Add"}</span>
        </button>
      </div>
    </motion.div>
  );
}
