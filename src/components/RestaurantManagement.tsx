import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Percent,
  Plus,
  Edit,
  Trash2,
  Archive,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Layers,
  Sparkles,
  Star,
  Flame,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Save,
  RotateCcw,
  FileText,
  Tag,
  DollarSign,
  Image as ImageIcon,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  ListFilter,
  Upload,
  Camera,
  RefreshCw,
  Link as LinkIcon,
  ChefHat
} from "lucide-react";
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  Timestamp, 
  query, 
  orderBy, 
  writeBatch 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { MENU_ITEMS, MenuItem, MENU_CATEGORIES, CATEGORY_TRANSLATIONS, getItemImage, DEFAULT_MENU_ITEM_IMAGE } from "../data/menu";
import { RestaurantSettings, RESTAURANT_ID } from "../types";
import { safeSessionStorage } from "../utils/safeStorage";

export function getCategoryEmoji(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (lower.includes("coffee") || lower.includes("hot drink")) return "☕";
  if (lower.includes("iced") || lower.includes("cold") || lower.includes("drink") || lower.includes("beverage") || lower.includes("juice") || lower.includes("cocktail") || lower.includes("frappe")) return "🥤";
  if (lower.includes("dessert") || lower.includes("cake") || lower.includes("fruit") || lower.includes("sweet")) return "🍰";
  if (lower.includes("meal")) return "🍽";
  if (lower.includes("sandwich") || lower.includes("snack") || lower.includes("burger") || lower.includes("shawarma")) return "🥪";
  return "📋";
}

export interface ExtendedMenuItem extends MenuItem {
  nameAr?: string;
  descriptionAr?: string;
  availability?: "available" | "unavailable" | "sold_out" | "hidden";
  isPopular?: boolean;
  isFeatured?: boolean;
  isSpicy?: boolean;
  mealPrice?: number;
  isArchived?: boolean;
  displayOrder?: number;
  updatedAt?: any;
  createdAt?: any;
}

export interface AuditLogRecord {
  id?: string;
  action: string;
  userRole: string;
  userName?: string;
  itemAffected: string;
  oldValue?: string;
  newValue?: string;
  timestamp: any;
  details?: string;
}

interface RestaurantManagementProps {
  userRole: "owner" | "admin" | "manager" | "staff" | "waiter" | string | null;
  settings: RestaurantSettings;
  onUpdateSettings?: (newSettings: Partial<RestaurantSettings>) => void;
  triggerAlert?: (msg: string, type?: "success" | "error" | "info") => void;
}

// Helper to resize and compress uploaded images client-side before storing or displaying
const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.82): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const PRESET_FOOD_IMAGES: string[] = [];

const ALLERGEN_OPTIONS = [
  { id: "Dairy", nameAr: "مشتقات الحليب", nameEn: "Dairy" },
  { id: "Gluten", nameAr: "غلوتين / قمح", nameEn: "Gluten" },
  { id: "Nuts", nameAr: "مكسرات", nameEn: "Nuts" },
  { id: "Eggs", nameAr: "بيض", nameEn: "Eggs" },
  { id: "Soy", nameAr: "صويا", nameEn: "Soy" },
  { id: "Seafood", nameAr: "مأكولات بحرية", nameEn: "Seafood" }
];

export default function RestaurantManagement({
  userRole,
  settings,
  onUpdateSettings,
  triggerAlert
}: RestaurantManagementProps) {
  // Check authorization
  const isAuthorized = userRole === "owner" || userRole === "admin" || userRole === "manager";

  // Real-time states
  const [menuItems, setMenuItems] = useState<ExtendedMenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([...MENU_CATEGORIES]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Tax Settings Form State
  const [taxRateInput, setTaxRateInput] = useState<string>(
    settings.taxRate !== undefined ? settings.taxRate.toString() : "0"
  );
  const [taxNameInput, setTaxNameInput] = useState<string>(
    (settings as any).taxName || "ضريبة المبيعات"
  );
  const [isTaxEnabled, setIsTaxEnabled] = useState<boolean>(
    (settings as any).isTaxEnabled !== false
  );
  const [taxError, setTaxError] = useState<string | null>(null);
  const [isSavingTax, setIsSavingTax] = useState(false);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "price_asc" | "price_desc" | "category">("category");

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExtendedMenuItem | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryInputAr, setNewCategoryInputAr] = useState("");
  const [newCategoryInputEn, setNewCategoryInputEn] = useState("");

  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const [itemToDelete, setItemToDelete] = useState<ExtendedMenuItem | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Form input state for item modal
  const [itemForm, setItemForm] = useState<{
    id: string;
    name: string;
    nameAr: string;
    description: string;
    descriptionAr: string;
    price: string;
    mealPrice: string;
    category: string;
    prepTime: string;
    image: string;
    calories: string;
    availability: "available" | "unavailable" | "sold_out" | "hidden";
    isPopular: boolean;
    isFeatured: boolean;
    isSpicy: boolean;
    allergens: string[];
    tags: string[];
  }>({
    id: "",
    name: "",
    nameAr: "",
    description: "",
    descriptionAr: "",
    price: "",
    mealPrice: "",
    category: MENU_CATEGORIES[0] || "Hot Drinks",
    prepTime: "15",
    image: "",
    calories: "250",
    availability: "available",
    isPopular: false,
    isFeatured: false,
    isSpicy: false,
    allergens: [],
    tags: []
  });

  const [formError, setFormError] = useState<string | null>(null);

  // Image Upload States & Handlers
  const [imageUploadMode, setImageUploadMode] = useState<"file" | "url" | "preset">("file");
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isDragOverImage, setIsDragOverImage] = useState(false);

  const handleImageFileChange = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("يرجى اختيار ملف صورة صالح (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setFormError("حجم الملف كبير جداً. يرجى اختيار صورة بحجم أقل من 15 ميغابايت.");
      return;
    }
    setIsProcessingImage(true);
    setFormError(null);
    try {
      const compressedDataUrl = await compressImage(file);
      setItemForm((prev) => ({ ...prev, image: compressedDataUrl }));
    } catch (err) {
      console.error("Error processing image file:", err);
      setFormError("حدث خطأ أثناء معالجة الصورة. يرجى اختيار صورة أخرى.");
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Sync settings prop to tax state if changed externally
  useEffect(() => {
    if (settings.taxRate !== undefined) {
      setTaxRateInput(settings.taxRate.toString());
    }
    if ((settings as any).taxName) {
      setTaxNameInput((settings as any).taxName);
    }
    if ((settings as any).isTaxEnabled !== undefined) {
      setIsTaxEnabled((settings as any).isTaxEnabled);
    }
  }, [settings]);

  // Firestore Real-Time Listeners
  useEffect(() => {
    if (!isAuthorized) return;

    // 1. Subscribe to menuItems collection
    const unsubscribeMenu = onSnapshot(collection(db, "menuItems"), (snapshot) => {
      const items: ExtendedMenuItem[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as ExtendedMenuItem);
      });

      // Auto-seed if Firestore menuItems collection is completely empty
      if (snapshot.empty && !isSeeding) {
        seedInitialMenuItems();
      } else {
        setMenuItems(items);
        setLoading(false);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, "menuItems");
      setLoading(false);
    });

    // 2. Subscribe to categories document
    const unsubscribeCategories = onSnapshot(doc(db, "settings", "categories"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().list) {
        setCategories(docSnap.data().list);
      }
    });

    // 3. Subscribe to audit logs
    const qAudit = query(collection(db, "auditLogs"), orderBy("timestamp", "desc"));
    const unsubscribeAudit = onSnapshot(qAudit, (snapshot) => {
      const logs: AuditLogRecord[] = [];
      snapshot.forEach((docSnap) => {
        logs.push({ id: docSnap.id, ...docSnap.data() } as AuditLogRecord);
      });
      setAuditLogs(logs);
    });

    return () => {
      unsubscribeMenu();
      unsubscribeCategories();
      unsubscribeAudit();
    };
  }, [isAuthorized]);

  // Helper to seed initial default menu items to Firestore if collection is empty
  const seedInitialMenuItems = async () => {
    setIsSeeding(true);
    try {
      const batch = writeBatch(db);
      MENU_ITEMS.forEach((item) => {
        const docRef = doc(db, "menuItems", item.id);
        const extended: ExtendedMenuItem = {
          ...item,
          nameAr: item.nameAr || item.name,
          descriptionAr: item.descriptionAr || item.description,
          availability: "available",
          isPopular: item.tags?.includes("Best Seller") || item.tags?.includes("Popular") || false,
          isFeatured: item.tags?.includes("Chef Special") || false,
          isSpicy: item.tags?.includes("Spicy") || false,
          isArchived: false,
          displayOrder: 1,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        batch.set(docRef, extended);
      });

      // Also set categories doc
      const catRef = doc(db, "settings", "categories");
      batch.set(catRef, { list: MENU_CATEGORIES, updatedAt: Timestamp.now() }, { merge: true });

      await batch.commit();
      if (triggerAlert) triggerAlert("تم تهيئة قائمة الطعام والتحكم بنجاح في قاعدة البيانات.", "success");
    } catch (err) {
      console.error("Failed to seed initial menu items:", err);
    } finally {
      setIsSeeding(false);
    }
  };

  // Log audit helper
  const logAuditAction = async (action: string, itemAffected: string, oldValue?: string, newValue?: string, details?: string) => {
    try {
      const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await setDoc(doc(db, "auditLogs", logId), {
        action,
        userRole: userRole || "admin",
        userName: safeSessionStorage.getItem("staff_name") || "المدير المسؤول",
        itemAffected,
        oldValue: oldValue || "-",
        newValue: newValue || "-",
        details: details || "",
        timestamp: Timestamp.now(),
        authorizedAdmin: userRole || "admin",
        restaurantId: RESTAURANT_ID
      });
    } catch (e) {
      console.error("Error writing audit log:", e);
    }
  };

  // Tax Save Handler
  const handleSaveTaxSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setTaxError(null);

    const val = parseFloat(taxRateInput);
    if (isNaN(val) || val < 0 || val > 100) {
      setTaxError("يرجى إدخال نسبة ضريبة صحيحة بين 0% و 100%.");
      return;
    }

    setIsSavingTax(true);
    try {
      const oldTax = settings.taxRate;
      await updateDoc(doc(db, "settings", "restaurant"), {
        taxRate: val,
        taxName: taxNameInput.trim() || "ضريبة المبيعات",
        isTaxEnabled: isTaxEnabled,
        updatedAt: Timestamp.now()
      });

      await logAuditAction(
        "TAX_UPDATE",
        "تعديل نسبة الضريبة",
        `${oldTax}%`,
        `${val}%`,
        `تم تحديث الضريبة إلى ${val}% (${taxNameInput}) - الحالة: ${isTaxEnabled ? "مفعلة" : "معطلة"}`
      );

      if (onUpdateSettings) {
        onUpdateSettings({ taxRate: val, taxName: taxNameInput, isTaxEnabled } as any);
      }

      if (triggerAlert) {
        triggerAlert(`تم حفظ نسبة الضريبة (${val}%) بنجاح وتحديثها على كامل النظام.`, "success");
      }
    } catch (err: any) {
      console.error("Failed to save tax settings:", err);
      setTaxError("حدث خطأ أثناء حفظ التغييرات في قاعدة البيانات.");
    } finally {
      setIsSavingTax(false);
    }
  };

  // Filtered & Sorted Menu Items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.nameAr && item.nameAr.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q));

      // Category filter
      const matchCategory = selectedCategory === "All" || item.category === selectedCategory;

      // Availability filter
      let matchAvailability = true;
      if (availabilityFilter === "available") matchAvailability = item.availability === "available" || (!item.availability && !item.isArchived);
      else if (availabilityFilter === "unavailable") matchAvailability = item.availability === "unavailable";
      else if (availabilityFilter === "sold_out") matchAvailability = item.availability === "sold_out";
      else if (availabilityFilter === "hidden") matchAvailability = item.availability === "hidden" || item.isArchived === true;

      // Tag filter
      let matchTag = true;
      if (tagFilter === "popular") matchTag = !!item.isPopular;
      else if (tagFilter === "featured") matchTag = !!item.isFeatured;
      else if (tagFilter === "spicy") matchTag = !!item.isSpicy;

      return matchSearch && matchCategory && matchAvailability && matchTag;
    }).sort((a, b) => {
      if (sortBy === "name") return (a.nameAr || a.name).localeCompare(b.nameAr || b.name);
      if (sortBy === "price_asc") return a.price - b.price;
      if (sortBy === "price_desc") return b.price - a.price;
      return a.category.localeCompare(b.category);
    });
  }, [menuItems, searchQuery, selectedCategory, availabilityFilter, tagFilter, sortBy]);

  // Open Add / Edit Modal
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setItemForm({
      id: `item_${Date.now()}`,
      name: "",
      nameAr: "",
      description: "",
      descriptionAr: "",
      price: "",
      mealPrice: "",
      category: categories[0] || "Hot Drinks",
      prepTime: "15",
      image: "",
      calories: "200",
      availability: "available",
      isPopular: false,
      isFeatured: false,
      isSpicy: false,
      allergens: [],
      tags: []
    });
    setFormError(null);
    setIsItemModalOpen(true);
  };

  const handleOpenEditModal = (item: ExtendedMenuItem) => {
    setEditingItem(item);
    setItemForm({
      id: item.id,
      name: item.name || "",
      nameAr: item.nameAr || item.name || "",
      description: item.description || "",
      descriptionAr: item.descriptionAr || item.description || "",
      price: item.price.toString(),
      mealPrice: item.mealPrice ? item.mealPrice.toString() : "",
      category: item.category || categories[0],
      prepTime: item.prepTime || "15",
      image: item.image || "",
      calories: item.calories ? item.calories.toString() : "200",
      availability: item.availability || (item.isArchived ? "hidden" : "available"),
      isPopular: !!item.isPopular,
      isFeatured: !!item.isFeatured,
      isSpicy: !!item.isSpicy,
      allergens: item.allergens || [],
      tags: item.tags || []
    });
    setFormError(null);
    setIsItemModalOpen(true);
  };

  // Save Item (Add or Update)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const priceNum = parseFloat(itemForm.price);
    const mealPriceNum = itemForm.mealPrice ? parseFloat(itemForm.mealPrice) : undefined;
    if (!itemForm.nameAr.trim() && !itemForm.name.trim()) {
      setFormError("يرجى إدخال اسم الصنف باللغة العربية والإنجليزية.");
      return;
    }
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError("يرجى إدخال سعر صحيح للصنف (يجب أن يكون رقماً أكبر من أو يساوي 0).");
      return;
    }

    try {
      const itemData: ExtendedMenuItem = {
        id: itemForm.id,
        name: itemForm.name.trim() || itemForm.nameAr.trim(),
        nameAr: itemForm.nameAr.trim() || itemForm.name.trim(),
        description: itemForm.description.trim() || itemForm.descriptionAr.trim(),
        descriptionAr: itemForm.descriptionAr.trim() || itemForm.description.trim(),
        price: priceNum,
        mealPrice: (mealPriceNum !== undefined && !isNaN(mealPriceNum) && mealPriceNum > 0) ? mealPriceNum : undefined,
        category: itemForm.category,
        prepTime: itemForm.prepTime ? `${itemForm.prepTime.replace(/[^0-9]/g, "")} دقيقة` : "15 دقيقة",
        image: itemForm.image.trim(),
        calories: parseInt(itemForm.calories) || 200,
        availability: itemForm.availability,
        isPopular: itemForm.isPopular,
        isFeatured: itemForm.isFeatured,
        isSpicy: itemForm.isSpicy,
        isArchived: itemForm.availability === "hidden",
        allergens: itemForm.allergens,
        tags: Array.from(new Set([
          ...itemForm.tags,
          ...(itemForm.isPopular ? ["Popular"] : []),
          ...(itemForm.isFeatured ? ["Chef Special"] : []),
          ...(itemForm.isSpicy ? ["Spicy"] : [])
        ])),
        ingredients: [],
        customizations: [],
        updatedAt: Timestamp.now()
      };

      if (!editingItem) {
        itemData.createdAt = Timestamp.now();
      }

      await setDoc(doc(db, "menuItems", itemForm.id), itemData, { merge: true });

      const isEdit = !!editingItem;
      await logAuditAction(
        isEdit ? "MENU_ITEM_EDIT" : "MENU_ITEM_ADD",
        itemData.nameAr || itemData.name,
        isEdit ? `${editingItem?.price} JD (${editingItem?.availability})` : "-",
        `${itemData.price} JD (${itemData.availability})`,
        isEdit ? `تم تعديل الصنف "${itemData.nameAr}"` : `تمت إضافة صنف جديد "${itemData.nameAr}"`
      );

      setIsItemModalOpen(false);
      if (triggerAlert) {
        triggerAlert(isEdit ? `تم تحديث بيانات الصنف "${itemData.nameAr}" بنجاح.` : `تمت إضافة الصنف الجديد "${itemData.nameAr}" للقائمة.`, "success");
      }
    } catch (err) {
      console.error("Error saving menu item:", err);
      setFormError("فشل حفظ التغييرات في قاعدة البيانات. يرجى المحاولة لاحقاً.");
    }
  };

  // Quick Toggle Item Availability
  const handleQuickStatusChange = async (item: ExtendedMenuItem, newStatus: "available" | "unavailable" | "sold_out" | "hidden") => {
    try {
      const oldStatus = item.availability || "available";
      await updateDoc(doc(db, "menuItems", item.id), {
        availability: newStatus,
        isArchived: newStatus === "hidden",
        updatedAt: Timestamp.now()
      });

      await logAuditAction(
        "MENU_ITEM_STATUS",
        item.nameAr || item.name,
        oldStatus,
        newStatus,
        `تغيير حالة توفر الصنف من "${oldStatus}" إلى "${newStatus}"`
      );

      if (triggerAlert) {
        triggerAlert(`تم تحديث حالة الصنف "${item.nameAr || item.name}" إلى ${newStatus === "available" ? "متاح" : newStatus === "sold_out" ? "نفذت الكمية" : newStatus === "hidden" ? "مخفي" : "غير متاح"}.`, "info");
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Quick Toggle Popular / Featured
  const handleQuickToggleFeature = async (item: ExtendedMenuItem, field: "isPopular" | "isFeatured" | "isSpicy") => {
    try {
      const currentVal = !!item[field];
      await updateDoc(doc(db, "menuItems", item.id), {
        [field]: !currentVal,
        updatedAt: Timestamp.now()
      });

      if (triggerAlert) {
        triggerAlert(`تم ${!currentVal ? "تفعيل" : "إلغاء"} ميزة ${field === "isPopular" ? "الأكثر طلباً" : field === "isFeatured" ? "الصنف المميز" : "الحار"} للصنف.`, "info");
      }
    } catch (err) {
      console.error("Failed to toggle feature:", err);
    }
  };

  // Archive Item (Hide from menu)
  const handleArchiveItem = async (item: ExtendedMenuItem) => {
    try {
      await updateDoc(doc(db, "menuItems", item.id), {
        availability: "hidden",
        isArchived: true,
        updatedAt: Timestamp.now()
      });

      await logAuditAction(
        "MENU_ITEM_ARCHIVE",
        item.nameAr || item.name,
        item.availability || "available",
        "hidden",
        `تمت أرشفة الصنف وخفائه من قائمة الطعام للزبائن.`
      );

      if (triggerAlert) {
        triggerAlert(`تمت أرشفة الصنف "${item.nameAr || item.name}". يمكنك إعادته في أي وقت بفك الأرشفة.`, "info");
      }
    } catch (err) {
      console.error("Failed to archive item:", err);
    }
  };

  // Delete Item Permanently
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, "menuItems", itemToDelete.id));

      await logAuditAction(
        "MENU_ITEM_DELETE",
        itemToDelete.nameAr || itemToDelete.name,
        `${itemToDelete.price} JD`,
        "DELETED",
        `حذف الصنف نهائياً من قاعدة البيانات.`
      );

      if (triggerAlert) {
        triggerAlert(`تم حذف الصنف "${itemToDelete.nameAr || itemToDelete.name}" نهائياً من النظام.`, "success");
      }
      setItemToDelete(null);
    } catch (err) {
      console.error("Error deleting item:", err);
    }
  };

  // Move Category Up/Down Handler
  const handleMoveCategory = async (catIndex: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && catIndex === 0) || (direction === 'down' && catIndex === categories.length - 1)) return;
    const targetIndex = direction === 'up' ? catIndex - 1 : catIndex + 1;
    const updated = [...categories];
    const [moved] = updated.splice(catIndex, 1);
    updated.splice(targetIndex, 0, moved);

    try {
      await setDoc(doc(db, "settings", "categories"), {
        list: updated,
        updatedAt: Timestamp.now()
      });
      setCategories(updated);
      if (triggerAlert) triggerAlert("تم تحديث ترتيب التصنيفات بنجاح.", "success");
    } catch (err) {
      console.error("Error moving category:", err);
    }
  };

  // Add Category Handler
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameAr = newCategoryInputAr.trim();
    if (!nameAr) return;

    if (categories.includes(nameAr)) {
      if (triggerAlert) triggerAlert("التصنيف موجود بالفعل بنفس الاسم.", "error");
      return;
    }

    const updated = [...categories, nameAr];
    try {
      await setDoc(doc(db, "settings", "categories"), {
        list: updated,
        updatedAt: Timestamp.now()
      });

      await logAuditAction(
        "CATEGORY_ADD",
        nameAr,
        "-",
        nameAr,
        `إضافة تصنيف جديد لقائمة الطعام: "${nameAr}"`
      );

      setCategories(updated);
      setNewCategoryInputAr("");
      setNewCategoryInputEn("");
      if (triggerAlert) triggerAlert(`تم إضافة التصنيف الجديد "${nameAr}" بنجاح.`, "success");
    } catch (err) {
      console.error("Error adding category:", err);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (catName: string) => {
    const assignedCount = menuItems.filter(i => i.category === catName).length;
    if (assignedCount > 0) {
      if (triggerAlert) triggerAlert(`لا يمكن حذف التصنيف "${catName}" لأنه يحتوي على ${assignedCount} أصناف مرتبطة به. يرجى نقل الأصناف أولاً.`, "error");
      return;
    }

    const updated = categories.filter(c => c !== catName);
    try {
      await setDoc(doc(db, "settings", "categories"), {
        list: updated,
        updatedAt: Timestamp.now()
      });

      await logAuditAction(
        "CATEGORY_DELETE",
        catName,
        catName,
        "DELETED",
        `حذف التصنيف "${catName}"`
      );

      setCategories(updated);
      if (triggerAlert) triggerAlert(`تم حذف التصنيف "${catName}".`, "success");
    } catch (err) {
      console.error("Error deleting category:", err);
    }
  };

  // Unauthorized Screen Component
  if (!isAuthorized) {
    return (
      <div dir="rtl" className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-red-900/20 border border-red-500/30 rounded-3xl p-8 max-w-md backdrop-blur-md shadow-2xl"
        >
          <div className="w-16 h-16 bg-red-500/15 border border-red-500/40 rounded-2xl flex items-center justify-center mx-auto mb-5 text-red-400">
            <ShieldAlert className="w-9 h-9" />
          </div>

          <span className="inline-block px-3 py-1 bg-red-500/20 text-red-300 rounded-full text-xs font-medium mb-3">
            منع الوصول | Access Denied
          </span>

          <h2 className="text-2xl font-bold text-white mb-3">
            ليس لديك صلاحية للوصول إلى هذه الصفحة.
          </h2>

          <p className="text-amber-200/80 text-sm leading-relaxed mb-6">
            عذراً، تقتصر صلاحية إدارة نسبة الضريبة وقائمة الطعام والتعديلات الأرشيفية على المديرين ومسؤولي المطعم والمالكين فقط (Owner / Admin / Manager).
          </p>

          <div className="bg-amber-950/40 rounded-xl p-4 text-xs text-amber-300 border border-amber-500/20 flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-amber-400" />
            <span>يرجى تسجيل الدخول باستخدام رمز المالك للوصول لكافة الصلاحيات.</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-8 font-cairo">
      {/* Page Title & Stats Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/80 border border-amber-500/20 rounded-2xl p-6 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">إدارة المطعم والقائمة (Restaurant Management)</h1>
              <p className="text-xs text-zinc-400">التحكم الفوري بنسبة الضريبة، إضافة وتحديث الأصناف، وإدارة التصنيفات.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-md"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>سجل التعديلات والعمليات ({auditLogs.length})</span>
          </button>

          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all"
          >
            <Tag className="w-4 h-4 text-amber-400" />
            <span>إدارة التصنيفات ({categories.length})</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-zinc-950 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد</span>
          </button>
        </div>
      </div>

      {/* 1. TAX SETTINGS CARD */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900/90 border border-amber-500/30 rounded-2xl p-6 relative overflow-hidden shadow-xl"
      >
        <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-amber-400 to-amber-600" />

        <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>إعدادات الضريبة المحسوبة (Tax Settings)</span>
                {isTaxEnabled ? (
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-medium">
                    مفعلة تلقائياً ({taxRateInput}%)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-full text-xs font-medium">
                    معطلة حالياً
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                يتم تطبيق نسبة الضريبة المحددة هنا تلقائياً على كل طلبات الزبائن وتظهر بالفاتورة.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveTaxSettings} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div>
            <label className="block text-xs font-semibold text-amber-200/90 mb-2">
              مسمى الضريبة بالعربية:
            </label>
            <input
              type="text"
              value={taxNameInput}
              onChange={(e) => setTaxNameInput(e.target.value)}
              placeholder="مثال: ضريبة المبيعات الحكومية"
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-amber-200/90 mb-2">
              نسبة الضريبة الإجمالية (%):
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={taxRateInput}
                onChange={(e) => setTaxRateInput(e.target.value)}
                placeholder="16"
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all pl-10"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 text-sm font-bold">%</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer bg-zinc-950 border border-zinc-800 px-4 py-2.5 rounded-xl flex-1 select-none">
              <input
                type="checkbox"
                checked={isTaxEnabled}
                onChange={(e) => setIsTaxEnabled(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
              <span className="text-xs font-medium text-white">تفعيل احتساب الضريبة</span>
            </label>

            <button
              type="submit"
              disabled={isSavingTax}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md shrink-0"
            >
              {isSavingTax ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ التعديلات</span>
                </>
              )}
            </button>
          </div>
        </form>

        {taxError && (
          <div className="mt-4 p-3 bg-red-950/60 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{taxError}</span>
          </div>
        )}
      </motion.div>

      {/* 2. MENU ITEMS FILTERS & SEARCH */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث باسم الصنف، المكونات، أو الوصف..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500/50 rounded-xl pr-10 pl-4 py-2 text-xs text-white outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 text-xs">
            <span className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300">
              إجمالي الأصناف: <strong className="text-amber-400">{menuItems.length}</strong>
            </span>
            <span className="px-3 py-1.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-emerald-300">
              متاحة: <strong>{menuItems.filter(i => i.availability === "available" || (!i.availability && !i.isArchived)).length}</strong>
            </span>
            <span className="px-3 py-1.5 bg-red-950/40 border border-red-500/30 rounded-lg text-red-300">
              نفذت الكمية: <strong>{menuItems.filter(i => i.availability === "sold_out").length}</strong>
            </span>
            <span className="px-3 py-1.5 bg-amber-950/40 border border-amber-500/30 rounded-lg text-amber-300">
              مخفية: <strong>{menuItems.filter(i => i.availability === "hidden" || i.isArchived).length}</strong>
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/60">
          {/* Categories Horizontal Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
            <button
              onClick={() => setSelectedCategory("All")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === "All"
                  ? "bg-amber-500 text-zinc-950"
                  : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              الكل ({menuItems.length})
            </button>
            {categories.map((cat) => {
              const count = menuItems.filter(i => i.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? "bg-amber-500 text-zinc-950"
                      : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                  }`}
                >
                  {getCategoryEmoji(cat)} {CATEGORY_TRANSLATIONS[cat] || cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Availability & Sort dropdowns */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-xl px-3 py-1.5 outline-none"
            >
              <option value="all">كل الحالات</option>
              <option value="available">المتاحة فقط</option>
              <option value="unavailable">غير متاحة</option>
              <option value="sold_out">نفذت الكمية</option>
              <option value="hidden">المخفية / المؤرشفة</option>
            </select>

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-xl px-3 py-1.5 outline-none"
            >
              <option value="all">كل الميزات</option>
              <option value="popular">الأكثر طلباً ⭐</option>
              <option value="featured">الأصناف المميزة ✨</option>
              <option value="spicy">الأصناف الحارة 🌶️</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-xl px-3 py-1.5 outline-none"
            >
              <option value="category">حسب التصنيف</option>
              <option value="name">أبجدياً (بالاسم)</option>
              <option value="price_asc">السعر: من الأقل للأعلى</option>
              <option value="price_desc">السعر: من الأعلى للأقل</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. MENU ITEMS GRID */}
      {loading ? (
        <div className="py-20 text-center text-amber-400 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">جاري تحميل عناصر قائمة الطعام...</span>
        </div>
      ) : filteredMenuItems.length === 0 ? (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
          <Layers className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">لا توجد أصناف مطابقة للبحث</h3>
          <p className="text-xs text-zinc-500 mb-4">جرب تغيير كلمة البحث أو فلاتر التصفية أعلاه.</p>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 bg-amber-500 text-zinc-950 text-xs font-bold rounded-xl inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد الآن</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMenuItems.map((item) => {
            const isHidden = item.availability === "hidden" || item.isArchived;
            const isSoldOut = item.availability === "sold_out";
            const isUnavailable = item.availability === "unavailable";

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-zinc-900 border rounded-2xl p-4 flex flex-col justify-between relative transition-all hover:border-amber-500/40 ${
                  isHidden
                    ? "border-amber-500/30 opacity-60 bg-zinc-950"
                    : isSoldOut
                    ? "border-red-500/30 bg-red-950/10"
                    : "border-zinc-800"
                }`}
              >
                <div>
                  {/* Top Badges & Image */}
                  <div className="relative h-44 rounded-xl overflow-hidden mb-3 bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                    <img
                      src={getItemImage(item)}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = DEFAULT_MENU_ITEM_IMAGE;
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-transparent to-black/40 pointer-events-none" />

                    {/* Category Tag */}
                    <span className="absolute top-2 right-2 px-2.5 py-1 bg-zinc-950/80 backdrop-blur-md text-amber-300 text-[10px] font-bold rounded-lg border border-amber-500/30">
                      {CATEGORY_TRANSLATIONS[item.category] || item.category}
                    </span>

                    {/* Quick Feature Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      {item.isPopular && (
                        <span className="p-1 bg-amber-500 text-zinc-950 rounded-md" title="أكثر طلباً">
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </span>
                      )}
                      {item.isFeatured && (
                        <span className="p-1 bg-purple-500 text-white rounded-md" title="صنف مميز">
                          <Sparkles className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {item.isSpicy && (
                        <span className="p-1 bg-red-500 text-white rounded-md" title="حار">
                          <Flame className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>

                    {/* Price Tag Overlay */}
                    <div className="absolute bottom-2 right-2 px-3 py-1 bg-amber-500 text-zinc-950 font-black rounded-lg text-sm shadow-md flex items-center gap-1.5">
                      <span>{item.price.toFixed(2)}</span>
                      <span className="text-[10px] font-bold">د.أ</span>
                      {item.mealPrice && (
                        <span className="text-[10px] bg-zinc-950 text-amber-300 px-1.5 py-0.5 rounded-md font-semibold border border-amber-500/30 mr-0.5">
                          وجبة: {item.mealPrice.toFixed(2)} د.أ
                        </span>
                      )}
                    </div>

                    {/* Prep Time Overlay */}
                    {item.prepTime && (
                      <div className="absolute bottom-2 left-2 px-2.5 py-1 bg-zinc-950/80 text-zinc-300 text-[10px] rounded-lg border border-zinc-800 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>{item.prepTime}</span>
                      </div>
                    )}
                  </div>

                  {/* Names & Description */}
                  <div className="mb-3">
                    <h3 className="text-base font-bold text-white mb-0.5 flex items-center justify-between">
                      <span>{item.nameAr || item.name}</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-sans mb-1.5">{item.name}</p>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {item.descriptionAr || item.description || "بدون وصف إضافي"}
                    </p>
                  </div>
                </div>

                {/* Status Selector & Action Controls */}
                <div className="pt-3 border-t border-zinc-800/80 space-y-3">
                  {/* Availability Dropdown */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-zinc-400">حالة الصنف:</span>
                    <select
                      value={item.availability || "available"}
                      onChange={(e) => handleQuickStatusChange(item, e.target.value as any)}
                      className={`text-xs font-bold rounded-lg px-2.5 py-1 outline-none border transition-all ${
                        item.availability === "available" || !item.availability
                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                          : item.availability === "sold_out"
                          ? "bg-red-950/60 text-red-300 border-red-500/40"
                          : item.availability === "hidden"
                          ? "bg-amber-950/60 text-amber-300 border-amber-500/40"
                          : "bg-zinc-800 text-zinc-300 border-zinc-700"
                      }`}
                    >
                      <option value="available">متاح الآن (Available)</option>
                      <option value="sold_out">نفذت الكمية (Sold Out)</option>
                      <option value="unavailable">غير متاح مؤقتاً (Unavailable)</option>
                      <option value="hidden">مخفي / مؤرشف (Hidden)</option>
                    </select>
                  </div>

                  {/* Feature Quick Toggles */}
                  <div className="flex items-center justify-between bg-zinc-950 p-2 rounded-xl border border-zinc-800/80 text-[11px]">
                    <button
                      onClick={() => handleQuickToggleFeature(item, "isPopular")}
                      className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${
                        item.isPopular ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Star className="w-3 h-3" />
                      <span>شائع</span>
                    </button>

                    <button
                      onClick={() => handleQuickToggleFeature(item, "isFeatured")}
                      className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${
                        item.isFeatured ? "bg-purple-500/20 text-purple-300 border border-purple-500/40" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>مميز</span>
                    </button>

                    <button
                      onClick={() => handleQuickToggleFeature(item, "isSpicy")}
                      className={`px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${
                        item.isSpicy ? "bg-red-500/20 text-red-300 border border-red-500/40" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Flame className="w-3 h-3" />
                      <span>حار</span>
                    </button>
                  </div>

                  {/* Buttons Action Bar */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border border-amber-500/20"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>

                    <button
                      onClick={() => handleArchiveItem(item)}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded-lg text-xs font-semibold transition-all border border-zinc-700"
                      title={isHidden ? "إظهار الصنف" : "أرشفة وإخفاء"}
                    >
                      {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => setItemToDelete(item)}
                      className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg text-xs font-semibold transition-all border border-red-500/30"
                      title="حذف نهائي"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: ADD / EDIT MENU ITEM */}
      <AnimatePresence>
        {isItemModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-amber-500/30 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 text-right font-cairo shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    {editingItem ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">
                      {editingItem ? `تعديل الصنف: ${editingItem.nameAr || editingItem.name}` : "إضافة صنف جديد للقائمة"}
                    </h2>
                    <p className="text-xs text-zinc-400">ستنعكس جميع التغيرات فوراً على شاشات ائتمان الزبائن وتطبيق المطبخ.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsItemModalOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveItem} className="space-y-5">
                {/* Names Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">
                      اسم الصنف بالعربية <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={itemForm.nameAr}
                      onChange={(e) => setItemForm({ ...itemForm, nameAr: e.target.value })}
                      placeholder="مثال: سبانيش لاتيه بارد"
                      required
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">
                      اسم الصنف بالإنجليزية <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={itemForm.name}
                      onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                      placeholder="e.g. Iced Spanish Latte"
                      required
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none text-left dir-ltr"
                    />
                  </div>
                </div>

                {/* Descriptions Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">الوصف بالعربية:</label>
                    <textarea
                      rows={2}
                      value={itemForm.descriptionAr}
                      onChange={(e) => setItemForm({ ...itemForm, descriptionAr: e.target.value })}
                      placeholder="وصف مختصر ومشهي للمكونات والمذاق..."
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2 text-xs text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">الوصف بالإنجليزية:</label>
                    <textarea
                      rows={2}
                      value={itemForm.description}
                      onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                      placeholder="Short appetizing description..."
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2 text-xs text-white outline-none text-left dir-ltr"
                    />
                  </div>
                </div>

                {/* Price, Meal Price, Category, Prep Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">
                      السعر الإفرادي (د.أ) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={itemForm.price}
                      onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                      placeholder="3.50"
                      required
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">
                      سعر الوجبة (Meal Price - د.أ) <span className="text-zinc-500 font-normal">(اختياري)</span>
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      value={itemForm.mealPrice}
                      onChange={(e) => setItemForm({ ...itemForm, mealPrice: e.target.value })}
                      placeholder="5.00"
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">
                      التصنيف (Category) <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={itemForm.category}
                      onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {getCategoryEmoji(cat)} {CATEGORY_TRANSLATIONS[cat] || cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">وقت التحضير (بالدقائق):</label>
                    <input
                      type="number"
                      min="1"
                      value={itemForm.prepTime}
                      onChange={(e) => setItemForm({ ...itemForm, prepTime: e.target.value })}
                      placeholder="15"
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                {/* Availability State & Features */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">حالة توفر الصنف:</label>
                    <select
                      value={itemForm.availability}
                      onChange={(e) => setItemForm({ ...itemForm, availability: e.target.value as any })}
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none font-bold"
                    >
                      <option value="available">متاح للطلب الآن (Available)</option>
                      <option value="sold_out">نفذت الكمية (Sold Out)</option>
                      <option value="unavailable">غير متاح مؤقتاً (Unavailable)</option>
                      <option value="hidden">مخفي / مؤرشف (Hidden)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-amber-200/90 mb-1.5">السعرات الحرارية المقدرة (كالس):</label>
                    <input
                      type="number"
                      value={itemForm.calories}
                      onChange={(e) => setItemForm({ ...itemForm, calories: e.target.value })}
                      placeholder="250"
                      className="w-full bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                {/* Feature Toggles */}
                <div className="flex flex-wrap items-center gap-4 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={itemForm.isPopular}
                      onChange={(e) => setItemForm({ ...itemForm, isPopular: e.target.checked })}
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span className="text-xs text-white flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> أكثر طلباً (Popular)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={itemForm.isFeatured}
                      onChange={(e) => setItemForm({ ...itemForm, isFeatured: e.target.checked })}
                      className="w-4 h-4 accent-purple-500 rounded"
                    />
                    <span className="text-xs text-white flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" /> صنف مميز (Featured)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={itemForm.isSpicy}
                      onChange={(e) => setItemForm({ ...itemForm, isSpicy: e.target.checked })}
                      className="w-4 h-4 accent-red-500 rounded"
                    />
                    <span className="text-xs text-white flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-red-400" /> حار (Spicy)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={itemForm.tags.includes("New")}
                      onChange={(e) => {
                        const newTags = e.target.checked
                          ? [...itemForm.tags, "New"]
                          : itemForm.tags.filter(t => t !== "New");
                        setItemForm({ ...itemForm, tags: newTags });
                      }}
                      className="w-4 h-4 accent-emerald-500 rounded"
                    />
                    <span className="text-xs text-white flex items-center gap-1">
                      ✨ جديدنا (New)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={itemForm.tags.includes("Vegetarian")}
                      onChange={(e) => {
                        const newTags = e.target.checked
                          ? [...itemForm.tags, "Vegetarian"]
                          : itemForm.tags.filter(t => t !== "Vegetarian");
                        setItemForm({ ...itemForm, tags: newTags });
                      }}
                      className="w-4 h-4 accent-emerald-500 rounded"
                    />
                    <span className="text-xs text-white flex items-center gap-1">
                      🌱 نباتي (Vegetarian)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={itemForm.tags.includes("Gluten-Free")}
                      onChange={(e) => {
                        const newTags = e.target.checked
                          ? [...itemForm.tags, "Gluten-Free"]
                          : itemForm.tags.filter(t => t !== "Gluten-Free");
                        setItemForm({ ...itemForm, tags: newTags });
                      }}
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span className="text-xs text-white flex items-center gap-1">
                      🌾 خالي من الغلوتين (Gluten-Free)
                    </span>
                  </label>
                </div>

                {/* Image Selection & Device Upload */}
                <div className="space-y-3 bg-zinc-950/80 p-4 rounded-2xl border border-zinc-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-amber-200/90 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-amber-400" />
                      <span>صورة الصنف (Menu Item Picture)</span>
                    </label>

                    {/* Source Selector Tabs */}
                    <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setImageUploadMode("file")}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                          imageUploadMode === "file"
                            ? "bg-amber-500 text-zinc-950 font-bold shadow"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <Upload className="w-3 h-3" />
                        <span>من الهاتف/الكمبيوتر</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImageUploadMode("url")}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                          imageUploadMode === "url"
                            ? "bg-amber-500 text-zinc-950 font-bold shadow"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <LinkIcon className="w-3 h-3" />
                        <span>رابط URL</span>
                      </button>

                      {PRESET_FOOD_IMAGES.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setImageUploadMode("preset")}
                          className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                            imageUploadMode === "preset"
                              ? "bg-amber-500 text-zinc-950 font-bold shadow"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>معرض الصور</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mode 1: Device File Upload & Phone Camera */}
                  {imageUploadMode === "file" && (
                    <div className="space-y-3">
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragOverImage(true);
                        }}
                        onDragLeave={() => setIsDragOverImage(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragOverImage(false);
                          const droppedFile = e.dataTransfer.files?.[0];
                          if (droppedFile) handleImageFileChange(droppedFile);
                        }}
                        className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer relative overflow-hidden ${
                          isDragOverImage
                            ? "border-amber-400 bg-amber-500/10"
                            : "border-zinc-700 hover:border-amber-500/50 bg-zinc-900/50"
                        }`}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          id="item-file-upload-input"
                          className="hidden"
                          onChange={(e) => {
                            const selectedFile = e.target.files?.[0];
                            handleImageFileChange(selectedFile);
                          }}
                        />

                        {isProcessingImage ? (
                          <div className="flex flex-col items-center gap-2 py-3">
                            <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
                            <span className="text-xs text-amber-200 font-semibold">جاري تحسين وضغط الصورة...</span>
                          </div>
                        ) : (
                          <label
                            htmlFor="item-file-upload-input"
                            className="w-full flex flex-col items-center gap-2 cursor-pointer py-2"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                                <Upload className="w-5 h-5" />
                              </div>
                              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-inner">
                                <Camera className="w-5 h-5" />
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-white">
                                اضغط هنا لاختيار صورة من هاتفك المحمول أو الكمبيوتر
                              </p>
                              <p className="text-[11px] text-zinc-400 mt-0.5">
                                أو اسحب ملف الصورة وأسقطه هنا (الكاميرا، المعرض، الصور)
                              </p>
                            </div>
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mode 2: External URL */}
                  {imageUploadMode === "url" && (
                    <div>
                      <input
                        type="url"
                        value={itemForm.image}
                        onChange={(e) => setItemForm({ ...itemForm, image: e.target.value })}
                        placeholder="https://example.com/dish-photo.jpg"
                        className="w-full bg-zinc-900 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none text-left dir-ltr"
                      />
                    </div>
                  )}

                  {/* Mode 3: Preset Food Gallery */}
                  {imageUploadMode === "preset" && (
                    <div className="space-y-2">
                      <span className="text-[11px] text-zinc-400 block">اختر صورة من الصور الافتراضية المقترحة:</span>
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                        {PRESET_FOOD_IMAGES.map((imgUrl, idx) => (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => setItemForm({ ...itemForm, image: imgUrl })}
                            className={`aspect-square rounded-xl overflow-hidden border-2 transition-all relative group ${
                              itemForm.image === imgUrl
                                ? "border-amber-400 ring-2 ring-amber-400/40 scale-105"
                                : "border-zinc-800 opacity-70 hover:opacity-100 hover:border-zinc-600"
                            }`}
                          >
                            <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                            {itemForm.image === imgUrl && (
                              <div className="absolute inset-0 bg-amber-500/30 flex items-center justify-center">
                                <Check className="w-4 h-4 text-white drop-shadow-md" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Image Preview & Active Selection */}
                  {itemForm.image && (
                    <div className="flex items-center justify-between bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-amber-500/40 shrink-0 bg-zinc-950">
                          <img
                            src={itemForm.image}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> تم تعيين الصورة للصنف
                          </span>
                          <p className="text-[10px] text-zinc-400 max-w-[240px] truncate dir-ltr text-right">
                            {itemForm.image.startsWith("data:") ? "صورة مخصصة مرفوعة من الجهاز" : itemForm.image}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setItemForm({ ...itemForm, image: "" })}
                        className="px-2.5 py-1 text-[11px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-all"
                      >
                        إزالة الصورة
                      </button>
                    </div>
                  )}
                </div>

                {formError && (
                  <div className="p-3 bg-red-950/60 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setIsItemModalOpen(false)}
                    className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20"
                  >
                    <Save className="w-4 h-4" />
                    <span>{editingItem ? "حفظ التعديلات" : "إضافة الصنف الآن"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: CATEGORY MANAGEMENT */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-amber-500/30 rounded-3xl w-full max-w-lg p-6 text-right font-cairo shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">إدارة تصنيفات المأكولات والمشروبات</h2>
                    <p className="text-xs text-zinc-400">إضافة، تعديل أو حذف تصنيفات القائمة.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Add category form */}
              <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={newCategoryInputAr}
                  onChange={(e) => setNewCategoryInputAr(e.target.value)}
                  placeholder="اسم التصنيف الجديد بالعربية (مثلاً: حلويات شرقيه)..."
                  className="flex-1 bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-white outline-none"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold rounded-xl text-xs flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة</span>
                </button>
              </form>

              {/* List of categories */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {categories.map((cat, idx) => {
                  const itemCount = menuItems.filter(i => i.category === cat).length;
                  return (
                    <div
                      key={cat}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-white">{getCategoryEmoji(cat)} {CATEGORY_TRANSLATIONS[cat] || cat}</span>
                        <span className="text-[10px] text-zinc-500">({itemCount} أصناف)</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveCategory(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 text-zinc-400 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-zinc-400 rounded-lg transition-all cursor-pointer"
                          title="تحريك للأعلى"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveCategory(idx, 'down')}
                          disabled={idx === categories.length - 1}
                          className="p-1.5 text-zinc-400 hover:text-amber-400 disabled:opacity-30 disabled:hover:text-zinc-400 rounded-lg transition-all cursor-pointer"
                          title="تحريك للأسفل"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-lg transition-all cursor-pointer mr-1"
                          title="حذف التصنيف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-zinc-800 mt-5 flex justify-end">
                <button
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-5 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: AUDIT LOGS VIEW */}
      <AnimatePresence>
        {isAuditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-amber-500/30 rounded-3xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-6 text-right font-cairo shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">سجل تعديلات القائمة والضرائب (Audit Log)</h2>
                    <p className="text-xs text-zinc-400">تتبع زمني لكافة التغيرات وحركات المديرين على النظام.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAuditModalOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {auditLogs.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500 text-xs">
                    لا توجد سجلات تعديل سابقة مسجلة.
                  </div>
                ) : (
                  auditLogs.map((log) => {
                    const dateStr = log.timestamp?.toDate
                      ? log.timestamp.toDate().toLocaleString("ar-JO")
                      : new Date(log.timestamp).toLocaleString("ar-JO");

                    return (
                      <div
                        key={log.id}
                        className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-400">{log.action}</span>
                          <span className="text-[10px] text-zinc-500">{dateStr}</span>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-300">
                          <span className="font-medium">المستخدم: {log.userName || log.userRole}</span>
                          <span>•</span>
                          <span className="text-zinc-400">العنصر: {log.itemAffected}</span>
                        </div>
                        {log.details && (
                          <p className="text-[11px] text-zinc-400 bg-zinc-900 p-2 rounded-lg border border-zinc-800/60 mt-1">
                            {log.details}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-4 border-t border-zinc-800 mt-4 flex justify-end shrink-0">
                <button
                  onClick={() => setIsAuditModalOpen(false)}
                  className="px-5 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM DELETE MODAL */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-red-500/40 rounded-3xl w-full max-w-md p-6 text-center font-cairo shadow-2xl relative"
            >
              <div className="w-14 h-14 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-400">
                <Trash2 className="w-7 h-7" />
              </div>

              <h3 className="text-lg font-bold text-white mb-2">
                تأكيد حذف الصنف نهائياً؟
              </h3>

              <p className="text-xs text-zinc-400 leading-relaxed mb-6">
                هل أنت متأكد من إزالة الصنف <strong className="text-white">"{itemToDelete.nameAr || itemToDelete.name}"</strong> من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.
              </p>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setItemToDelete(null)}
                  className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>تأكيد الحذف النهائي</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
