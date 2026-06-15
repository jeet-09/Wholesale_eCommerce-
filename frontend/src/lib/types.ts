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

/** Aggregated vendor supply for a master-catalog product. */
export interface ProductSupply {
  vendorCount: number;
  averageVendorPrice: string | null;
  lowestVendorPrice: string | null;
  computedPrice: string | null;
  totalAvailableQuantity: string;
  inStock: boolean;
}

export interface Product {
  id: string;
  categoryId: string;
  categoryName: string | null;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  brand: string | null;
  status: string;
  isFeatured: boolean;
  transportPercent: string;
  /** Final selling price shown to restaurants (admin-controlled). */
  sellingPrice: MoneyWithCurrency | null;
  supply: ProductSupply;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  parentCategoryId: string | null;
  displayOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPrice {
  id: string;
  productId: string;
  price: string;
  currency: string;
  averageVendorPrice: string | null;
  transportPercent: string | null;
  isOverride: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  isCurrent: boolean;
  createdAt: string;
}

/** Suggested selling price from average vendor offers + transport markup. */
export interface PriceSuggestion {
  productId: string;
  vendorCount: number;
  averageVendorPrice: string | null;
  transportPercent: string;
  computedPrice: string | null;
  currentPrice: string | null;
  currency: string;
}

/** A vendor's price + stock offer against a master-catalog product. */
export interface Offer {
  id: string;
  vendorId: string;
  vendorName: string | null;
  productId: string;
  productName: string | null;
  productSku: string | null;
  unit: string | null;
  vendorPrice: string;
  currency: string;
  availableQuantity: string;
  reservedQuantity: string;
  sellableQuantity: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string | null;
  paymentType: string;
  amount: string;
  currency: string;
  status: string;
  proofUrl: string | null;
  transactionReference: string | null;
  remarks: string | null;
  submittedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface VendorPerformance {
  vendorId: string;
  vendorName: string | null;
  totalAssigned: number;
  totalAccepted: number;
  totalRejected: number;
  totalCompleted: number;
  totalNoResponse: number;
  acceptanceRate: number;
  completionRate: number;
  successRate: number;
  averageFulfilmentMinutes: number | null;
  averageRating: number | null;
}

export interface DashboardMetric {
  key: string;
  label: string;
  value: number;
}

export interface DashboardStatusCount {
  status: string;
  count: number;
}

export interface Dashboard {
  scope: 'admin' | 'vendor' | 'restaurant';
  generatedAt: string;
  metrics: DashboardMetric[];
  ordersByStatus: DashboardStatusCount[];
}

export interface Vendor {
  id: string;
  organizationId: string;
  vendorName: string;
  vendorCode: string;
  businessCategory: string | null;
  status: string;
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
  assignedVendorId: string | null;
  assignedVendorName: string | null;
  status: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  gstAmount: string;
  deliveryCharges: string;
  totalAmount: string;
  advancePercent: string;
  advanceAmount: string;
  remainingAmount: string;
  placedAt: string | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  reviewedAt: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
  statusHistory: OrderStatusHistory[];
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
}
