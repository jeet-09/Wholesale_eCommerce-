// Shared API types mirroring the backend response envelope and DTOs.

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
  meta: ApiMeta;
}

// --- Domain DTOs ------------------------------------------------------------

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthContext {
  roles: string[];
  permissions: string[];
  organizationId: string | null;
  vendorId: string | null;
  restaurantId: string | null;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  user: User;
  context: AuthContext;
}

export interface MoneyWithCurrency {
  price: string;
  currency: string;
}

export interface ProductInventory {
  availableQuantity: string;
  reservedQuantity: string;
  sellableQuantity: string;
}

export interface Product {
  id: string;
  vendorId: string;
  vendorName: string | null;
  categoryId: string;
  categoryName: string | null;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  brand: string | null;
  status: string;
  isFeatured: boolean;
  currentPrice: MoneyWithCurrency | null;
  inventory: ProductInventory | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: string;
  unitPriceSnapshot: string;
  currentPrice: string | null;
  subtotal: string;
  priceChanged: boolean;
}

export interface Cart {
  id: string;
  restaurantId: string;
  status: string;
  items: CartItem[];
  itemCount: number;
  subtotal: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  unitPrice: string;
  quantity: string;
  subtotal: string;
}

export interface OrderStatusHistory {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  remarks: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  restaurantId: string;
  restaurantName: string | null;
  vendorId: string;
  vendorName: string | null;
  status: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  gstAmount: string;
  deliveryCharges: string;
  totalAmount: string;
  placedAt: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
  statusHistory: OrderStatusHistory[];
  createdAt: string;
  updatedAt: string;
}
