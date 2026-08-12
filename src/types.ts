export const RESTAURANT_ID = "salein_cafe";

export interface CartItem {
  id: string; // unique cart line ID
  itemId: string; // menu item ID
  name: string;
  nameAr?: string;
  category?: string; // menu category e.g. "Meals" | "Sandwiches"
  baseProduct?: string; // e.g. "fajita" | "zinger"
  itemType?: 'sandwich' | 'meal' | 'other';
  image: string;
  basePrice: number;
  customizations: {
    title: string;
    selected: string[];
  }[];
  price: number; // calculated total price with customization modifiers
  quantity: number;
  note?: string; // item-specific special instructions (e.g. "Oat milk", "No onions")
}

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  role: 'customer' | 'staff';
  loyaltyPoints: number;
  createdAt: any;
}

export interface OrderItem {
  itemId: string;
  name: string;
  category?: string; // menu category e.g. "Meals" | "Sandwiches"
  baseProduct?: string;
  itemType?: 'sandwich' | 'meal' | 'other';
  quantity: number;
  price: number;
  customizations: {
    title: string;
    selected: string[];
  }[];
  note?: string; // item-specific special instructions
  notes?: string; // alias for item-specific special instructions
}

export interface Order {
  orderId: string;
  restaurantId?: string;
  userId: string;
  customerName?: string;
  tableNumber: string;
  items: OrderItem[];
  orderedItems?: OrderItem[];
  subtotal: number;
  tax: number;
  serviceFee: number;
  discount: number;
  talkTableFee: number;
  total: number;
  status: 'pending' | 'new' | 'New' | 'preparing' | 'ready' | 'delivered' | 'finished' | 'cancelled';
  orderStatus: 'pending' | 'new' | 'New' | 'preparing' | 'ready' | 'delivered' | 'finished' | 'cancelled';
  paymentStatus: 'unpaid' | 'paid' | 'pending';
  paymentMethod: 'cash' | 'card';
  notes?: string; // order-wide notes / special instructions
  orderSource?: string; // 'AI Waiter' | 'QR Menu' | 'Manual'
  pointsEarned: number;
  acknowledged?: boolean;
  acknowledgedAt?: any;
  acknowledgedBy?: string;
  finishedBy?: string;
  finishedAt?: any;
  createdAt: any;
  updatedAt: any;
}

export interface WaiterRequest {
  requestId: string;
  tableNumber: string;
  userId: string | null;
  type: 'call_waiter' | 'request_water' | 'request_napkins' | 'request_cutlery' | 'clean_table' | 'request_bill';
  status: 'pending' | 'completed';
  createdAt: any;
}

export interface Review {
  reviewId: string;
  userId: string;
  userName: string;
  foodRating: number;
  serviceRating: number;
  atmosphereRating: number;
  comments: string;
  createdAt: any;
}

export interface Favorite {
  favoriteId: string;
  userId: string;
  itemId: string;
  createdAt: any;
}

export interface RestaurantSettings {
  name: string;
  description: string;
  logo: string;
  coverImage: string;
  address: string;
  phone: string;
  businessHours: string;
  cuisineType: string;
  currency: string;
  language: string;
  taxRate: number;
  serviceFee: number;
  isServiceFeeEnabled: boolean;
  acceptedPaymentMethods: string[];
  facebook: string;
  instagram: string;
  status?: 'Open' | 'Closed';
  activeShiftId?: string;
}

export interface Shift {
  shiftId: string;
  restaurantId: string;
  openedBy: string;
  closedBy?: string;
  startTime: any;
  endTime?: any;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  cashOrders: number;
  cardOrders: number;
  totalSales: number;
  totalTalkTableeeFees: number;
  averageOrderValue: number;
  status: 'open' | 'closed';
}

