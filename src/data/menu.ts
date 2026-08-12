export interface MenuItem {
  id: string;
  name: string;
  nameAr?: string;
  description: string;
  descriptionAr?: string;
  price: number; // in JD (Jordanian Dinar)
  mealPrice?: number; // in JD for full meal option / combo
  category: string;
  baseProduct?: string; // e.g. "fajita" | "zinger" | "lollipop"
  itemType?: 'sandwich' | 'meal' | 'other';
  image?: string;
  calories?: number;
  prepTime?: string;
  rating?: number;
  reviewsCount?: number;
  tags: string[];
  ingredients: string[];
  allergens: string[];
  availability?: 'available' | 'unavailable' | 'sold_out' | 'hidden';
  isArchived?: boolean;
  customizations: {
    title: string;
    type: 'select' | 'multiselect';
    options: { name: string; priceModifier: number }[];
  }[];
}

export const CATEGORY_TRANSLATIONS: Record<string, string> = {
  "Meals": "وجبات",
  "Hot Drinks": "مشروبات ساخنة",
  "Iced Drinks": "مشروبات باردة ومثلجة",
  "Cold Beverages": "مشروبات غازية ومنعشة",
  "Fresh Juices": "عصائر طازجة",
  "Special Cocktails": "كوكتيلات خاصة",
  "Frappe": "فرابيه",
  "Fruit Salads": "سلطات فواكه",
  "Sandwiches": "ساندويشات",
  "Snacks": "سندويشات وسناكات",
  "Shawarma": "شاورما دجاج ولحم",
  "Grilled Chicken Burger": "برجر دجاج مشوي",
  "Hot Dog": "هوت دوغ",
  "Crispy": "دجاج كريسبي",
  "Salads": "سلطات طازجة",
  "Burgers": "برجر فاخر",
  "Sides": "مقبلات وجوانب",
  "Chicken Wings & Healthy Meal": "أجنحة دجاج وجبات صحية",
  "Extras Sauce": "صلصات وإضافات",
  "Hookah": "أراجيل ومعسل"
};

export const COMMON_ARABIC_ITEM_NAMES: Record<string, string> = {
  "Fajita": "سندويش فاهيتا دجاج",
  "Lollipop": "لولي بوب دجاج",
  "Mexican Chicken": "دجاج مكسيكي حار",
  "Zinger": "سندويش زنجر دجاج",
  "Francisco": "سندويش فرانسيسكو",
  "Philadelphia": "سندويش فيلادلفيا لحم",
  "Escalope": "إسكالوب دجاج",
  "Steak Sandwich": "ستيك ساندويش",
  "Turkish Coffee": "قهوة تركية فاخرة",
  "Espresso": "إسبريسو سينجل / دبل",
  "Cappuccino": "كابتشينو إيطالي",
  "Latte": "لاتيه حليب غني",
  "Americano": "أمريكانو بلاك",
  "Mocha": "موكا شوكولاتة",
  "Spanish Latte": "سبانيش لاتيه مميز",
  "Hot Chocolate": "شوكولاتة ساخنة غنية",
  "Iced Latte": "آيس لاتيه بارد",
  "Iced Spanish Latte": "آيس سبانيش لاتيه",
  "Fresh Orange Juice": "عصير برتقال طازج",
  "Lemon & Mint": "عصير ليمون ونعناع طازج",
  "Hookah Two Apples": "أرجيلة تفاحتين فاخر",
  "Hookah Mint": "أرجيلة نعناع بابلز",
  "Hookah Lemon Mint": "أرجيلة ليمون ونعناع"
};

export function getCategoryName(category: string, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') return category;
  return CATEGORY_TRANSLATIONS[category] || category;
}

export function getItemName(item: MenuItem, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') return item.name;
  if (item.nameAr) return item.nameAr;
  if (COMMON_ARABIC_ITEM_NAMES[item.name]) return COMMON_ARABIC_ITEM_NAMES[item.name];
  return item.name;
}

export function getItemDescription(item: MenuItem, lang: 'ar' | 'en' = 'ar'): string {
  if (lang === 'en') return item.description || "Freshly prepared at Salein Cafe";
  if (item.descriptionAr) return item.descriptionAr;
  if (item.description) return item.description;
  return "محضر طازجاً بأجود المكونات في سالين كافيه";
}

export const ITEM_PHOTOS: Record<string, string> = {};

export const DEFAULT_MENU_ITEM_IMAGE = "/salein-logo.svg";

export function getItemImage(item?: Partial<MenuItem> | null | Record<string, any>): string {
  if (item && item.image && typeof item.image === "string" && item.image.trim() !== "") {
    return item.image.trim();
  }
  return DEFAULT_MENU_ITEM_IMAGE;
}

export const MENU_CATEGORIES = [
  "Meals",
  "Sandwiches",
  "Hot Drinks",
  "Iced Drinks",
  "Cold Beverages",
  "Fresh Juices",
  "Special Cocktails",
  "Frappe",
  "Fruit Salads",
  "Snacks",
  "Shawarma",
  "Grilled Chicken Burger",
  "Hot Dog",
  "Crispy",
  "Salads",
  "Burgers",
  "Sides",
  "Chicken Wings & Healthy Meal",
  "Extras Sauce",
  "Hookah"
] as const;

export const MENU_ITEMS: MenuItem[] = [
  // --- MEALS ---
  {
    id: "ml-1",
    name: "Chicken Escalope Meal",
    nameAr: "وجبة إسكالوب دجاج",
    description: "Crispy breaded chicken breast served with golden French fries, garlic dip, coleslaw salad, and fresh bread.",
    descriptionAr: "صدر دجاج إسكالوب مقرمش يقدم مع بطاطا مقلية ذهبية، ثومية، سلطة كولسلو، وخبز طازج.",
    price: 4.50,
    category: "Meals",
    baseProduct: "chicken_escalope",
    itemType: "meal",
    image: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&q=80&w=800",
    calories: 780,
    prepTime: "12 mins",
    rating: 4.9,
    reviewsCount: 42,
    tags: ["Meals", "Poultry", "Popular", "Chef Special"],
    ingredients: ["Chicken Breast", "Breadcrumbs", "French Fries", "Coleslaw", "Garlic Dip", "Pita Bread"],
    allergens: ["Gluten", "Eggs", "Dairy"],
    availability: "available",
    customizations: [
      {
        title: "Side Choice",
        type: "select",
        options: [
          { name: "French Fries", priceModifier: 0 },
          { name: "Seasoned Rice", priceModifier: 0.50 },
          { name: "Potato Wedges", priceModifier: 0.75 }
        ]
      },
      {
        title: "Drink Choice",
        type: "select",
        options: [
          { name: "None", priceModifier: 0 },
          { name: "Pepsi", priceModifier: 0.50 },
          { name: "Fresh Orange Juice", priceModifier: 1.00 }
        ]
      }
    ]
  },
  {
    id: "ml-2",
    name: "Crispy Chicken Meal",
    nameAr: "وجبة كريسبي دجاج",
    description: "4 golden crispy chicken tenders served with seasoned fries, coleslaw salad, garlic sauce, and dinner roll.",
    descriptionAr: "٤ قطع ستربس دجاج كريسبي مقرمش يقدم مع بطاطا مقلية متبلة، كولسلو، ثومية، وخبز طازج.",
    price: 4.25,
    category: "Meals",
    baseProduct: "crispy_chicken",
    itemType: "meal",
    image: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&q=80&w=800",
    calories: 720,
    prepTime: "10 mins",
    rating: 4.8,
    reviewsCount: 38,
    tags: ["Meals", "Crispy", "Popular"],
    ingredients: ["Chicken Tenders", "French Fries", "Coleslaw", "Garlic Sauce", "Dinner Roll"],
    allergens: ["Gluten", "Dairy", "Eggs"],
    availability: "available",
    customizations: [
      {
        title: "Sauce Choice",
        type: "select",
        options: [
          { name: "Garlic Dip", priceModifier: 0 },
          { name: "Spicy Sauce", priceModifier: 0 },
          { name: "BBQ Sauce", priceModifier: 0.25 }
        ]
      }
    ]
  },
  {
    id: "ml-3",
    name: "Super Zinger Meal",
    nameAr: "وجبة زنجر سوبريم",
    description: "Spicy crispy Zinger chicken fillet meal served with melted cheddar cheese, french fries, garlic dip, and coleslaw.",
    descriptionAr: "وجبة دجاج زنجر حار ومقرمش غني بجبنة الشيدر الذائبة، يقدم مع بطاطا مقلية، ثومية، وكولسلو.",
    price: 4.75,
    category: "Meals",
    baseProduct: "super_zinger",
    itemType: "meal",
    image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&q=80&w=800",
    calories: 810,
    prepTime: "12 mins",
    rating: 4.9,
    reviewsCount: 56,
    tags: ["Meals", "Spicy", "Popular"],
    ingredients: ["Spicy Chicken Fillet", "Cheddar Cheese", "French Fries", "Garlic Dip", "Coleslaw"],
    allergens: ["Gluten", "Dairy", "Eggs", "Soy"],
    availability: "available",
    customizations: [
      {
        title: "Spice Level",
        type: "select",
        options: [
          { name: "Medium Spicy", priceModifier: 0 },
          { name: "Extra Hot", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "ml-4",
    name: "Grilled Chicken Breast Meal",
    nameAr: "وجبة صدور دجاج مشوية",
    description: "Juicy marinated grilled chicken breasts served with herb rice, steamed vegetables, and garlic dip.",
    descriptionAr: "صدور دجاج متبلة ومشويه على الجريل بمهارة، تقدم مع أرز بالأعشاب، خضار سوتيه، وصوص الثوم.",
    price: 5.00,
    category: "Meals",
    baseProduct: "grilled_chicken",
    itemType: "meal",
    image: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&q=80&w=800",
    calories: 580,
    prepTime: "15 mins",
    rating: 4.9,
    reviewsCount: 29,
    tags: ["Meals", "Healthy", "Chef Special"],
    ingredients: ["Grilled Chicken Breast", "Herb Rice", "Steamed Vegetables", "Garlic Dip"],
    allergens: ["Dairy"],
    availability: "available",
    customizations: [
      {
        title: "Side Choice",
        type: "select",
        options: [
          { name: "Herb Rice", priceModifier: 0 },
          { name: "Steamed Veggies", priceModifier: 0 },
          { name: "French Fries", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "ml-5",
    name: "Shish Tawook Plate Meal",
    nameAr: "وجبة شيش طاووق فاخرة",
    description: "Tender skewers of marinated grilled shish tawook served with yellow rice, grilled tomatoes, garlic sauce, and pita bread.",
    descriptionAr: "أسياخ شيش طاووق متبلة ومشويه على الفحم تقدم مع أرز أصفر، طماطم مشوية، ثومية، وخبز محمر.",
    price: 5.25,
    category: "Meals",
    baseProduct: "shish_tawook_plate",
    itemType: "meal",
    image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=800",
    calories: 690,
    prepTime: "15 mins",
    rating: 5.0,
    reviewsCount: 45,
    tags: ["Meals", "Popular", "Chef Special"],
    ingredients: ["Shish Tawook Skewers", "Yellow Rice", "Grilled Vegetables", "Garlic Sauce", "Pita Bread"],
    allergens: ["Dairy", "Gluten"],
    availability: "available",
    customizations: [
      {
        title: "Portion Size",
        type: "select",
        options: [
          { name: "Regular (2 Skewers)", priceModifier: 0 },
          { name: "Large (3 Skewers)", priceModifier: 1.50 }
        ]
      }
    ]
  },
  {
    id: "sw-1",
    name: "Chicken Sandwich",
    nameAr: "ساندويش دجاج",
    description: "Grilled chicken breast sandwich with garlic sauce, lettuce, and pickles in fresh pita or baguette bread.",
    descriptionAr: "ساندويش صدر دجاج مشوي مع صلصة الثومية الفاخرة، الخس، والمخلل في خبز بياض طازج.",
    price: 3.50,
    category: "Sandwiches",
    baseProduct: "chicken",
    itemType: "sandwich",
    image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=800",
    calories: 520,
    prepTime: "8 mins",
    rating: 4.8,
    reviewsCount: 34,
    tags: ["Sandwiches", "Poultry", "Popular"],
    ingredients: ["Grilled Chicken", "Garlic Sauce", "Lettuce", "Pickles", "Bread"],
    allergens: ["Gluten", "Dairy", "Eggs"],
    availability: "available",
    customizations: [
      {
        title: "Bread Type",
        type: "select",
        options: [
          { name: "Pita Bread", priceModifier: 0 },
          { name: "Baguette / Shrak", priceModifier: 0.25 }
        ]
      }
    ]
  },
  {
    id: "sw-2",
    name: "Chicken Fajita Sandwich",
    nameAr: "ساندويش فاهيتا دجاج",
    description: "Spicy marinated chicken fajita strip sandwich with bell peppers, onions, melted cheese, and garlic sauce.",
    descriptionAr: "ساندويش شرائح فاهيتا الدجاج المتبلة مع الفلفل الرومي، البصل، الجبنة الذائبة، وصوص الثومية.",
    price: 3.50,
    category: "Sandwiches",
    baseProduct: "fajita",
    itemType: "sandwich",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&q=80&w=800",
    calories: 560,
    prepTime: "8 mins",
    rating: 4.9,
    reviewsCount: 28,
    tags: ["Sandwiches", "Poultry", "Spicy"],
    ingredients: ["Chicken Fajita", "Bell Peppers", "Onions", "Melted Cheese", "Garlic Sauce"],
    allergens: ["Gluten", "Dairy", "Soy"],
    availability: "available",
    customizations: []
  },
  {
    id: "sw-3",
    name: "Zinger Sandwich",
    nameAr: "ساندويش زنجر دجاج",
    description: "Crispy spicy Zinger chicken sandwich with mayonnaise, lettuce, cheddar cheese, and pickles.",
    descriptionAr: "ساندويش دجاج زنجر مقرمش وحار مع المايونيز، الخس الطازج، جبنة الشيدر، والمخلل.",
    price: 3.25,
    category: "Sandwiches",
    baseProduct: "zinger",
    itemType: "sandwich",
    image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&q=80&w=800",
    calories: 590,
    prepTime: "8 mins",
    rating: 4.9,
    reviewsCount: 52,
    tags: ["Sandwiches", "Crispy", "Popular"],
    ingredients: ["Zinger Chicken", "Cheddar Cheese", "Mayonnaise", "Lettuce", "Pickles"],
    allergens: ["Gluten", "Dairy", "Eggs"],
    availability: "available",
    customizations: []
  },
  {
    id: "sw-4",
    name: "Francisco Sandwich",
    nameAr: "ساندويش فرانسيسكو",
    description: "Grilled chicken strips with sweet corn, mushrooms, mayonnaise, and melted mozzarella cheese.",
    descriptionAr: "شرائح دجاج مشوية مع الذرة الحلوة، الفطر، المايونيز، وجبنة الموزاريلا الذائبة.",
    price: 3.50,
    category: "Sandwiches",
    baseProduct: "francisco",
    itemType: "sandwich",
    image: "https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&q=80&w=800",
    calories: 540,
    prepTime: "8 mins",
    rating: 4.7,
    reviewsCount: 21,
    tags: ["Sandwiches", "Poultry", "Cheese"],
    ingredients: ["Chicken Strips", "Sweet Corn", "Mushrooms", "Mozzarella", "Mayonnaise"],
    allergens: ["Gluten", "Dairy", "Eggs"],
    availability: "available",
    customizations: []
  },
  {
    id: "sw-5",
    name: "Philadelphia Steak Sandwich",
    nameAr: "ساندويش فيلادلفيا لحم",
    description: "Tender beef steak strips sauteed with onions, mushrooms, bell peppers, and melted cheese.",
    descriptionAr: "شرائح ستيك لحم بقري طرية مشوية مع البصل، الفطر، الفلفل الحلو، والجبنة الذائبة.",
    price: 3.75,
    category: "Sandwiches",
    baseProduct: "philadelphia",
    itemType: "sandwich",
    image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=800",
    calories: 610,
    prepTime: "10 mins",
    rating: 4.9,
    reviewsCount: 39,
    tags: ["Sandwiches", "Beef", "Chef Special"],
    ingredients: ["Beef Steak", "Onions", "Mushrooms", "Bell Peppers", "Melted Cheese"],
    allergens: ["Gluten", "Dairy"],
    availability: "available",
    customizations: []
  },
  {
    id: "sn-1-sandwich",
    name: "Fajita Sandwich",
    description: "",
    price: 2.00,
    category: "Sandwiches",
    baseProduct: "fajita",
    itemType: "sandwich",
    tags: ["Poultry", "Popular", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Soy", "Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "sn-1-meal",
    name: "Fajita Meal",
    description: "",
    price: 3.25,
    category: "Meals",
    baseProduct: "fajita",
    itemType: "meal",
    tags: ["Poultry", "Popular", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Soy", "Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "sn-2-sandwich",
    name: "Lollipop Sandwich",
    description: "",
    price: 2.00,
    category: "Sandwiches",
    baseProduct: "lollipop",
    itemType: "sandwich",
    tags: ["Poultry", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy", "Eggs"],
    customizations: []
  },
  {
    id: "sn-2-meal",
    name: "Lollipop Meal",
    description: "",
    price: 3.25,
    category: "Meals",
    baseProduct: "lollipop",
    itemType: "meal",
    tags: ["Poultry", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy", "Eggs"],
    customizations: []
  },
  {
    id: "sn-3-sandwich",
    name: "Mexican Chicken Sandwich",
    description: "",
    price: 2.00,
    category: "Sandwiches",
    baseProduct: "mexican_chicken",
    itemType: "sandwich",
    tags: ["Poultry", "Spicy Note", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "sn-3-meal",
    name: "Mexican Chicken Meal",
    description: "",
    price: 3.25,
    category: "Meals",
    baseProduct: "mexican_chicken",
    itemType: "meal",
    tags: ["Poultry", "Spicy Note", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "sn-4-sandwich",
    name: "Steak Cream Sandwich",
    description: "",
    price: 2.25,
    category: "Sandwiches",
    baseProduct: "steak_cream",
    itemType: "sandwich",
    tags: ["Beef", "Creamy", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "sn-4-meal",
    name: "Steak Cream Meal",
    description: "",
    price: 3.50,
    category: "Meals",
    baseProduct: "steak_cream",
    itemType: "meal",
    tags: ["Beef", "Creamy", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "sn-5-sandwich",
    name: "Steak BBQ Sandwich",
    description: "",
    price: 2.25,
    category: "Sandwiches",
    baseProduct: "steak_bbq",
    itemType: "sandwich",
    tags: ["Beef", "BBQ", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "sn-5-meal",
    name: "Steak BBQ Meal",
    description: "",
    price: 3.50,
    category: "Meals",
    baseProduct: "steak_bbq",
    itemType: "meal",
    tags: ["Beef", "BBQ", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "sn-6-sandwich",
    name: "Zinger Sandwich",
    description: "",
    price: 1.75,
    category: "Sandwiches",
    baseProduct: "zinger",
    itemType: "sandwich",
    tags: ["Crispy", "Popular", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy", "Gluten", "Eggs"],
    customizations: []
  },
  {
    id: "sn-6-meal",
    name: "Zinger Meal",
    description: "",
    price: 3.00,
    category: "Meals",
    baseProduct: "zinger",
    itemType: "meal",
    tags: ["Crispy", "Popular", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy", "Gluten", "Eggs"],
    customizations: []
  },
  {
    id: "sn-7-sandwich",
    name: "Zinger Smoked Cream Sandwich",
    description: "",
    price: 2.25,
    category: "Sandwiches",
    baseProduct: "zinger_smoked_cream",
    itemType: "sandwich",
    tags: ["Smoked", "Chef Special", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "sn-7-meal",
    name: "Zinger Smoked Cream Meal",
    description: "",
    price: 3.50,
    category: "Meals",
    baseProduct: "zinger_smoked_cream",
    itemType: "meal",
    tags: ["Smoked", "Chef Special", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "sn-8-sandwich",
    name: "Cordon Bleu Sandwich",
    description: "",
    price: 1.75,
    category: "Sandwiches",
    baseProduct: "cordon_bleu",
    itemType: "sandwich",
    tags: ["Poultry", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "sn-8-meal",
    name: "Cordon Bleu Meal",
    description: "",
    price: 3.00,
    category: "Meals",
    baseProduct: "cordon_bleu",
    itemType: "meal",
    tags: ["Poultry", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "sn-9-sandwich",
    name: "Shish Tawook Sandwich",
    description: "",
    price: 2.00,
    category: "Sandwiches",
    baseProduct: "shish_tawook",
    itemType: "sandwich",
    tags: ["Grilled", "Sandwich/Meal"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sn-9-meal",
    name: "Shish Tawook Meal",
    description: "",
    price: 3.25,
    category: "Meals",
    baseProduct: "shish_tawook",
    itemType: "meal",
    tags: ["Grilled", "Sandwich/Meal"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sn-10-sandwich",
    name: "Majnoona Sandwich",
    description: "",
    price: 2.25,
    category: "Sandwiches",
    baseProduct: "majnoona",
    itemType: "sandwich",
    tags: ["Signature", "Beef & Chicken", "Sandwich/Meal"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sn-10-meal",
    name: "Majnoona Meal",
    description: "",
    price: 3.50,
    category: "Meals",
    baseProduct: "majnoona",
    itemType: "meal",
    tags: ["Signature", "Beef & Chicken", "Sandwich/Meal"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sn-11-sandwich",
    name: "Italian Sandwich",
    description: "",
    price: 2.50,
    category: "Sandwiches",
    baseProduct: "italian",
    itemType: "sandwich",
    tags: ["Cheese", "Italian Sauce", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "sn-11-meal",
    name: "Italian Meal",
    description: "",
    price: 3.75,
    category: "Meals",
    baseProduct: "italian",
    itemType: "meal",
    tags: ["Cheese", "Italian Sauce", "Sandwich/Meal"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "ex-1",
    name: "Honey Mustard Sauce",
    description: "",
    price: 0.30,
    category: "Extras Sauce",
    tags: ["Dip", "Sauce"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "ex-2",
    name: "BBQ Sauce",
    description: "",
    price: 0.30,
    category: "Extras Sauce",
    tags: ["Dip", "Sauce"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "ex-3",
    name: "Buffalo Sauce",
    description: "",
    price: 0.30,
    category: "Extras Sauce",
    tags: ["Dip", "Spicy"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "ex-4",
    name: "Smoked Sauce",
    description: "",
    price: 0.30,
    category: "Extras Sauce",
    tags: ["Dip", "Smoked"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "ex-5",
    name: "Dynamite Sauce",
    description: "",
    price: 0.30,
    category: "Extras Sauce",
    tags: ["Dip", "Spicy"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "ex-6",
    name: "Special House Sauce",
    description: "",
    price: 0.30,
    category: "Extras Sauce",
    tags: ["Dip", "Signature"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sh-1",
    name: "Shawarma House",
    description: "",
    price: 1.50,
    category: "Shawarma",
    tags: ["Traditional", "Best Seller"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size / Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Normal Meal", priceModifier: 1.00 },
          { name: "Super Meal", priceModifier: 2.00 }
        ]
      }
    ]
  },
  {
    id: "sh-2",
    name: "Shawarma Cream",
    description: "",
    price: 1.75,
    category: "Shawarma",
    tags: ["Creamy", "Chef Special"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size / Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Normal Meal", priceModifier: 1.00 },
          { name: "Super Meal", priceModifier: 2.00 }
        ]
      }
    ]
  },
  {
    id: "gc-1",
    name: "Classic Grilled Chicken Breast",
    description: "",
    price: 2.75,
    category: "Grilled Chicken Burger",
    tags: ["Grilled", "Healthy Choice"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.25 }
        ]
      }
    ]
  },
  {
    id: "gc-2",
    name: "Jalapeño & Pineapple Grilled Chicken Breast",
    description: "",
    price: 2.75,
    category: "Grilled Chicken Burger",
    tags: ["Sweet & Spicy", "Chef Special"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.25 }
        ]
      }
    ]
  },
  {
    id: "gc-3",
    name: "Smoked Grilled Chicken Breast",
    description: "",
    price: 3.00,
    category: "Grilled Chicken Burger",
    tags: ["Smoked", "Popular"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.25 }
        ]
      }
    ]
  },
  {
    id: "gc-4",
    name: "Mushroom Grilled Chicken Breast",
    description: "",
    price: 2.75,
    category: "Grilled Chicken Burger",
    tags: ["Mushroom", "Creamy"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.25 }
        ]
      }
    ]
  },
  {
    id: "hd-1",
    name: "Classic Hot Dog",
    description: "",
    price: 1.75,
    category: "Hot Dog",
    tags: ["Classic"],
    ingredients: [],
    allergens: ["Dairy", "Mustard", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.25 }
        ]
      }
    ]
  },
  {
    id: "cw-1",
    name: "Chicken Wings Meal",
    description: "",
    price: 2.75,
    category: "Chicken Wings & Healthy Meal",
    tags: ["Wings", "Flavor Choice"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Flavor Choice",
        type: "select",
        options: [
          { name: "BBQ Sauce", priceModifier: 0 },
          { name: "Buffalo Sauce", priceModifier: 0 },
          { name: "House Sauce with Parmesan", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "cw-2",
    name: "Healthy Meal",
    description: "",
    price: 3.25,
    category: "Chicken Wings & Healthy Meal",
    tags: ["Healthy", "Fitness", "Low Carb"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "cr-1",
    name: "Smoked Crispy",
    description: "",
    price: 1.95,
    category: "Crispy",
    tags: ["Crispy", "Smoked"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.05 }
        ]
      }
    ]
  },
  {
    id: "cr-2",
    name: "Honey Mustard Crispy",
    description: "",
    price: 1.95,
    category: "Crispy",
    tags: ["Crispy", "Sweet & Tangy"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.05 }
        ]
      }
    ]
  },
  {
    id: "cr-3",
    name: "Buffalo Crispy",
    description: "",
    price: 1.95,
    category: "Crispy",
    tags: ["Crispy", "Spicy"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.05 }
        ]
      }
    ]
  },
  {
    id: "cr-4",
    name: "House Crispy",
    description: "",
    price: 1.95,
    category: "Crispy",
    tags: ["Signature", "Crispy"],
    ingredients: [],
    allergens: ["Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.05 }
        ]
      }
    ]
  },
  {
    id: "cr-5",
    name: "Dynamite Crispy",
    description: "",
    price: 1.95,
    category: "Crispy",
    tags: ["Crispy", "Spicy"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.05 }
        ]
      }
    ]
  },
  {
    id: "sl-1",
    name: "Caesar Salad",
    description: "",
    price: 2.50,
    category: "Salads",
    tags: ["Fresh", "Vegetarian Option"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "sl-2",
    name: "House Salad",
    description: "",
    price: 2.75,
    category: "Salads",
    tags: ["Fresh", "Vegan"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sl-3",
    name: "Fries Chicken Salad",
    description: "",
    price: 2.75,
    category: "Salads",
    tags: ["Salad with Protein"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "bg-1",
    name: "Classic Burger",
    description: "",
    price: 3.25,
    category: "Burgers",
    tags: ["Beef", "Classic", "Popular"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.00 }
        ]
      }
    ]
  },
  {
    id: "bg-2",
    name: "Triple B Burger",
    description: "",
    price: 3.50,
    category: "Burgers",
    tags: ["Beef", "BBQ", "Bacon"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.00 }
        ]
      }
    ]
  },
  {
    id: "bg-3",
    name: "Steak Burger",
    description: "",
    price: 3.75,
    category: "Burgers",
    tags: ["Angus Beef", "Steak", "Gourmet"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.00 }
        ]
      }
    ]
  },
  {
    id: "bg-4",
    name: "Caramelized Onion Burger",
    description: "",
    price: 3.50,
    category: "Burgers",
    tags: ["Beef", "Sweet & Savory"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 1.00 }
        ]
      }
    ]
  },
  {
    id: "bg-5",
    name: "House Spicy Burger",
    description: "",
    price: 4.00,
    category: "Burgers",
    tags: ["Spicy", "Chef Special"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 0.90 }
        ]
      }
    ]
  },
  {
    id: "bg-6",
    name: "Pomegranate Burger",
    description: "",
    price: 3.50,
    category: "Burgers",
    tags: ["Signature", "Pomegranate"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 0.90 }
        ]
      }
    ]
  },
  {
    id: "bg-7",
    name: "Mushroom Burger",
    description: "",
    price: 3.50,
    category: "Burgers",
    tags: ["Mushroom", "Creamy"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 0.90 }
        ]
      }
    ]
  },
  {
    id: "bg-8",
    name: "Beef Bacon Burger",
    description: "",
    price: 3.50,
    category: "Burgers",
    tags: ["Beef Bacon", "Loaded"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: [
      {
        title: "Option",
        type: "select",
        options: [
          { name: "Sandwich", priceModifier: 0 },
          { name: "Meal", priceModifier: 0.90 }
        ]
      }
    ]
  },
  {
    id: "sd-1",
    name: "Fresh Fries",
    description: "",
    price: 1.00,
    category: "Sides",
    tags: ["Crispy", "Popular", "Vegan"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sd-2",
    name: "Potato Wedges",
    description: "",
    price: 1.50,
    category: "Sides",
    tags: ["Seasoned", "Vegan"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sd-3",
    name: "Curly Fries",
    description: "",
    price: 1.50,
    category: "Sides",
    tags: ["Seasoned", "Crispy"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "sd-4",
    name: "Onion Rings",
    description: "",
    price: 1.75,
    category: "Sides",
    tags: ["Crispy", "Vegetarian"],
    ingredients: [],
    allergens: ["Gluten"],
    customizations: []
  },
  {
    id: "sd-5",
    name: "Mozzarella Sticks",
    description: "",
    price: 1.75,
    category: "Sides",
    tags: ["Cheese", "Popular"],
    ingredients: [],
    allergens: ["Dairy", "Gluten"],
    customizations: []
  },
  {
    id: "hd-dr-1",
    name: "Espresso (Single / Double)",
    description: "",
    price: 1.75,
    category: "Hot Drinks",
    tags: ["Coffee", "Hot", "Classic"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small (Single)", priceModifier: 0 },
          { name: "Medium (Double)", priceModifier: 0.25 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-2",
    name: "Americano",
    description: "",
    price: 2.20,
    category: "Hot Drinks",
    tags: ["Coffee", "Hot"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.30 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-3",
    name: "Turkish Coffee",
    description: "",
    price: 1.75,
    category: "Hot Drinks",
    tags: ["Traditional", "Hot"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.25 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-4",
    name: "Red Eye",
    description: "",
    price: 3.00,
    category: "Hot Drinks",
    tags: ["Strong Coffee", "Hot"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "hd-dr-5",
    name: "Cappuccino",
    description: "",
    price: 2.75,
    category: "Hot Drinks",
    tags: ["Coffee", "Hot", "Popular"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-6",
    name: "Flat White",
    description: "",
    price: 2.75,
    category: "Hot Drinks",
    tags: ["Coffee", "Hot"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-7",
    name: "Latte",
    description: "",
    price: 2.75,
    category: "Hot Drinks",
    tags: ["Coffee", "Hot", "Classic"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-8",
    name: "Spanish Latte",
    description: "",
    price: 3.25,
    category: "Hot Drinks",
    tags: ["Sweet Coffee", "Best Seller"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-9",
    name: "Caramel Macchiato",
    description: "",
    price: 3.00,
    category: "Hot Drinks",
    tags: ["Caramel", "Sweet Coffee"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-10",
    name: "Dark White Mocha",
    description: "",
    price: 2.75,
    category: "Hot Drinks",
    tags: ["Chocolate", "Coffee"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-11",
    name: "Spanish Rose Latte",
    description: "",
    price: 3.40,
    category: "Hot Drinks",
    tags: ["Floral", "Specialty"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-12",
    name: "Pistachio Latte",
    description: "",
    price: 3.40,
    category: "Hot Drinks",
    tags: ["Pistachio", "Gourmet Coffee"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-13",
    name: "Hot Chocolate",
    description: "",
    price: 2.75,
    category: "Hot Drinks",
    tags: ["Chocolate", "Hot"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-14",
    name: "Strawberry Hot Chocolate",
    description: "",
    price: 3.00,
    category: "Hot Drinks",
    tags: ["Strawberry", "Chocolate"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.35 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-15",
    name: "Marshmallow Hot Chocolate",
    description: "",
    price: 3.00,
    category: "Hot Drinks",
    tags: ["Sweet", "Marshmallow"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-16",
    name: "Tea",
    description: "",
    price: 1.75,
    category: "Hot Drinks",
    tags: ["Tea", "Hot"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.25 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-17",
    name: "Herbal Tea",
    description: "",
    price: 1.75,
    category: "Hot Drinks",
    tags: ["Herbal", "Relaxing"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.25 }
        ]
      }
    ]
  },
  {
    id: "hd-dr-18",
    name: "Hot Red Velvet",
    description: "",
    price: 3.00,
    category: "Hot Drinks",
    tags: ["Red Velvet", "Sweet"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "ic-1",
    name: "Iced Americano",
    description: "",
    price: 2.20,
    category: "Iced Drinks",
    tags: ["Cold Coffee", "Refreshing"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.30 }
        ]
      }
    ]
  },
  {
    id: "ic-2",
    name: "Iced Latte",
    description: "",
    price: 2.75,
    category: "Iced Drinks",
    tags: ["Cold Coffee", "Popular"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "ic-3",
    name: "Iced Spanish Latte",
    description: "",
    price: 3.25,
    category: "Iced Drinks",
    tags: ["Best Seller", "Cold Coffee"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "ic-4",
    name: "Iced Dark White Mocha",
    description: "",
    price: 3.40,
    category: "Iced Drinks",
    tags: ["Chocolate", "Cold Coffee"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "ic-5",
    name: "Iced Spanish Rose Latte",
    description: "",
    price: 3.00,
    category: "Iced Drinks",
    tags: ["Floral", "Cold Coffee"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "ic-6",
    name: "Iced Caramel Macchiato",
    description: "",
    price: 3.00,
    category: "Iced Drinks",
    tags: ["Caramel", "Cold Coffee"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "ic-7",
    name: "Iced Shaken Coffee",
    description: "",
    price: 3.00,
    category: "Iced Drinks",
    tags: ["Shaken", "Foamy Coffee"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "cb-1",
    name: "Iced Tea (Choose flavor)",
    description: "",
    price: 2.50,
    category: "Cold Beverages",
    tags: ["Iced Tea", "Refreshing"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.40 }
        ]
      },
      {
        title: "Flavor Choice",
        type: "select",
        options: [
          { name: "Peach Flavor", priceModifier: 0 },
          { name: "Lemon Flavor", priceModifier: 0 },
          { name: "Berry Flavor", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "cb-2",
    name: "Blue Energy",
    description: "",
    price: 3.50,
    category: "Cold Beverages",
    tags: ["Energy", "Mocktail"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "cb-3",
    name: "Green Energy",
    description: "",
    price: 3.25,
    category: "Cold Beverages",
    tags: ["Energy", "Green Apple"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "cb-4",
    name: "Green Lemonade",
    description: "",
    price: 2.75,
    category: "Cold Beverages",
    tags: ["Lemonade", "Mint", "Refreshing"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "cb-5",
    name: "Passion Berries",
    description: "",
    price: 3.25,
    category: "Cold Beverages",
    tags: ["Fruity", "Passion Fruit"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "cb-6",
    name: "Passion Punch Energy",
    description: "",
    price: 3.50,
    category: "Cold Beverages",
    tags: ["Energy", "Passion Fruit"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "cb-7",
    name: "Passion Punch Lemonade",
    description: "",
    price: 3.00,
    category: "Cold Beverages",
    tags: ["Lemonade", "Passion Fruit"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "cb-8",
    name: "Iced Chocolate",
    description: "",
    price: 3.00,
    category: "Cold Beverages",
    tags: ["Chocolate", "Cold"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: []
  },
  {
    id: "cb-9",
    name: "Mojito (Choose flavor)",
    description: "",
    price: 3.00,
    category: "Cold Beverages",
    tags: ["Mocktail", "Mojito", "Popular"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Flavor Choice",
        type: "select",
        options: [
          { name: "Classic Lime Mint", priceModifier: 0 },
          { name: "Strawberry Mojito", priceModifier: 0 },
          { name: "Blue Mojito", priceModifier: 0 },
          { name: "Passion Fruit Mojito", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "fj-1",
    name: "Orange Juice",
    description: "",
    price: 2.25,
    category: "Fresh Juices",
    tags: ["Fresh", "Vitamin C", "Vegan"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-2",
    name: "Lemon Juice",
    description: "",
    price: 2.25,
    category: "Fresh Juices",
    tags: ["Fresh", "Citrus"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-3",
    name: "Lemon with Honey & Ginger",
    description: "",
    price: 2.50,
    category: "Fresh Juices",
    tags: ["Immunity Boost", "Healthy"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-4",
    name: "Strawberry & Mango",
    description: "",
    price: 2.75,
    category: "Fresh Juices",
    tags: ["Tropical", "Fresh"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.25 }
        ]
      }
    ]
  },
  {
    id: "fj-5",
    name: "Strawberry, Banana & Milk",
    description: "",
    price: 2.75,
    category: "Fresh Juices",
    tags: ["Smoothie", "Creamy"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-6",
    name: "Strawberry Juice",
    description: "",
    price: 2.50,
    category: "Fresh Juices",
    tags: ["Fresh", "Vegan"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-7",
    name: "Pineapple Juice",
    description: "",
    price: 2.50,
    category: "Fresh Juices",
    tags: ["Tropical", "Vegan"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-8",
    name: "Pineapple & Kiwi",
    description: "",
    price: 2.75,
    category: "Fresh Juices",
    tags: ["Fresh", "Tangy"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-9",
    name: "Pineapple & Coconut",
    description: "",
    price: 2.75,
    category: "Fresh Juices",
    tags: ["Tropical", "Pina Colada"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-10",
    name: "Kiwi & Lemon",
    description: "",
    price: 2.75,
    category: "Fresh Juices",
    tags: ["Citrus", "Refreshing"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-11",
    name: "Kiwi & Strawberry",
    description: "",
    price: 2.75,
    category: "Fresh Juices",
    tags: ["Fruity"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-12",
    name: "Kiwi Juice",
    description: "",
    price: 2.50,
    category: "Fresh Juices",
    tags: ["Fresh"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fj-13",
    name: "Farghali Juice",
    description: "",
    price: 2.50,
    category: "Fresh Juices",
    tags: ["Traditional", "Mango"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-1",
    name: "Mix Berry Cocktail",
    description: "",
    price: 3.00,
    category: "Special Cocktails",
    tags: ["Berries", "Cocktail"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-2",
    name: "House Cocktail",
    description: "",
    price: 3.25,
    category: "Special Cocktails",
    tags: ["Signature", "Popular"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.25 }
        ]
      }
    ]
  },
  {
    id: "sc-3",
    name: "Signature Cocktail",
    description: "",
    price: 2.50,
    category: "Special Cocktails",
    tags: ["Signature"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 1.00 }
        ]
      }
    ]
  },
  {
    id: "sc-4",
    name: "Avocado with Strawberry or Mango",
    description: "",
    price: 2.50,
    category: "Special Cocktails",
    tags: ["Avocado", "Superfood"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      },
      {
        title: "Topping Choice",
        type: "select",
        options: [
          { name: "Strawberry Topping", priceModifier: 0 },
          { name: "Mango Topping", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "sc-5",
    name: "Avocado with Cream, Honey & Nuts",
    description: "",
    price: 3.25,
    category: "Special Cocktails",
    tags: ["Gourmet", "Nuts & Honey", "Chef Special"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-6",
    name: "Shammi Super Cocktail",
    description: "",
    price: 3.25,
    category: "Special Cocktails",
    tags: ["Levantine", "Traditional"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-7",
    name: "Banana & Milk",
    description: "",
    price: 2.50,
    category: "Special Cocktails",
    tags: ["Milkshake", "Classic"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-8",
    name: "Banana, Milk & Strawberry",
    description: "",
    price: 2.75,
    category: "Special Cocktails",
    tags: ["Smoothie"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-9",
    name: "Banana Nutella",
    description: "",
    price: 2.75,
    category: "Special Cocktails",
    tags: ["Nutella", "Sweet"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-10",
    name: "Awar El Qalb",
    description: "",
    price: 2.75,
    category: "Special Cocktails",
    tags: ["Famous", "Levantine"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-11",
    name: "Emperor Cocktail",
    description: "",
    price: 2.75,
    category: "Special Cocktails",
    tags: ["Royal", "Gourmet"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "sc-12",
    name: "Tropical Cocktail",
    description: "",
    price: 2.75,
    category: "Special Cocktails",
    tags: ["Tropical"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fr-1",
    name: "Coffee Frappe – Choose your favorite flavor",
    description: "",
    price: 3.25,
    category: "Frappe",
    tags: ["Blended Coffee", "Popular"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      },
      {
        title: "Flavor Choice",
        type: "select",
        options: [
          { name: "Caramel", priceModifier: 0 },
          { name: "Vanilla", priceModifier: 0 },
          { name: "Hazelnut", priceModifier: 0 },
          { name: "Mocha", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "fr-2",
    name: "Creamy Frappe – Choose your favorite flavor",
    description: "",
    price: 3.75,
    category: "Frappe",
    tags: ["Creamy", "Sweet"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.75 }
        ]
      }
    ]
  },
  {
    id: "fr-3",
    name: "Nutella Frappe",
    description: "",
    price: 3.50,
    category: "Frappe",
    tags: ["Nutella", "Chocolate"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fr-4",
    name: "Pistachio Frappe",
    description: "",
    price: 3.75,
    category: "Frappe",
    tags: ["Pistachio", "Gourmet"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.75 }
        ]
      }
    ]
  },
  {
    id: "fr-5",
    name: "Kinder Frappe",
    description: "",
    price: 3.75,
    category: "Frappe",
    tags: ["Kinder Chocolate", "Kids Favorite"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.75 }
        ]
      }
    ]
  },
  {
    id: "fr-6",
    name: "Spanish Cinnamon Frappe",
    description: "",
    price: 3.50,
    category: "Frappe",
    tags: ["Cinnamon", "Blended Coffee"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fr-7",
    name: "Marshmallow Frappe",
    description: "",
    price: 3.50,
    category: "Frappe",
    tags: ["Marshmallow"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.50 }
        ]
      }
    ]
  },
  {
    id: "fr-8",
    name: "Caramel or Nutella Frappuccino",
    description: "",
    price: 3.75,
    category: "Frappe",
    tags: ["Frappuccino", "Sweet Coffee"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.75 }
        ]
      },
      {
        title: "Sauce Choice",
        type: "select",
        options: [
          { name: "Caramel Sauce", priceModifier: 0 },
          { name: "Nutella Sauce", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "fr-9",
    name: "Mocha Frappe (Dark / White)",
    description: "",
    price: 3.75,
    category: "Frappe",
    tags: ["Mocha", "Chocolate Coffee"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Size",
        type: "select",
        options: [
          { name: "Small", priceModifier: 0 },
          { name: "Medium", priceModifier: 0.25 }
        ]
      },
      {
        title: "Chocolate Type",
        type: "select",
        options: [
          { name: "Dark Chocolate", priceModifier: 0 },
          { name: "White Chocolate", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "fs-1",
    name: "Diet Cocktail with Fruit Pieces",
    description: "",
    price: 3.00,
    category: "Fruit Salads",
    tags: ["Diet", "Fresh Fruits", "Healthy"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "fs-2",
    name: "Special Cocktail with Cream, Honey & Nuts",
    description: "",
    price: 3.50,
    category: "Fruit Salads",
    tags: ["Honey & Nuts", "Levantine", "Popular"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: []
  },
  {
    id: "fs-3",
    name: "Fakhfakhina Cocktail",
    description: "",
    price: 3.50,
    category: "Fruit Salads",
    tags: ["Traditional", "Fakhfakhina"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: []
  },
  {
    id: "fs-4",
    name: "Special Fruit Salad",
    description: "",
    price: 3.75,
    category: "Fruit Salads",
    tags: ["Special"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "fs-5",
    name: "Diet Salad",
    description: "",
    price: 4.50,
    category: "Fruit Salads",
    tags: ["Diet", "Healthy", "Vegan"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "fs-6",
    name: "Shammi Salad",
    description: "",
    price: 4.50,
    category: "Fruit Salads",
    tags: ["Traditional", "Shammi"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: []
  },
  {
    id: "fs-7",
    name: "Upside-Down Salad",
    description: "",
    price: 4.50,
    category: "Fruit Salads",
    tags: ["Fun", "Chocolate"],
    ingredients: [],
    allergens: ["Nuts"],
    customizations: []
  },
  {
    id: "fs-8",
    name: "Chocolate Salad (Your choice)",
    description: "",
    price: 5.00,
    category: "Fruit Salads",
    tags: ["Chocolate Lovers"],
    ingredients: [],
    allergens: ["Dairy"],
    customizations: [
      {
        title: "Chocolate Choice",
        type: "select",
        options: [
          { name: "Nutella Chocolate", priceModifier: 0 },
          { name: "Milk Chocolate", priceModifier: 0 },
          { name: "Dark Chocolate", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "fs-9",
    name: "House Fruit Salad",
    description: "",
    price: 5.50,
    category: "Fruit Salads",
    tags: ["Sharing", "Family Size"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "fs-10",
    name: "House Super Salad",
    description: "",
    price: 7.00,
    category: "Fruit Salads",
    tags: ["Super Feast", "Premium"],
    ingredients: [],
    allergens: ["Dairy", "Nuts"],
    customizations: []
  },
  {
    id: "hk-1",
    name: "Hookah all flavors",
    description: "",
    price: 3.50,
    category: "Hookah",
    tags: ["Shisha", "Hookah", "Relaxation"],
    ingredients: [],
    allergens: [],
    customizations: [
      {
        title: "Flavor Choice",
        type: "select",
        options: [
          { name: "Lemon Mint", priceModifier: 0 },
          { name: "Grape Mint", priceModifier: 0 },
          { name: "Watermelon Mint", priceModifier: 0 },
          { name: "Blueberry Mint", priceModifier: 0 },
          { name: "Love 66", priceModifier: 0 },
          { name: "Peach", priceModifier: 0 }
        ]
      }
    ]
  },
  {
    id: "hk-2",
    name: "Two apple hookah NAKHLA",
    description: "",
    price: 4.50,
    category: "Hookah",
    tags: ["Classic Hookah", "NAKHLA"],
    ingredients: [],
    allergens: [],
    customizations: []
  },
  {
    id: "hk-3",
    name: "EXTRA HEAD",
    description: "",
    price: 1.50,
    category: "Hookah",
    tags: ["Add-on"],
    ingredients: [],
    allergens: [],
    customizations: []
  }
];
