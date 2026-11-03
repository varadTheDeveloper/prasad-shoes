import type { Permission, Role } from './permissions';

export type PaymentType = 'COD' | 'PREPAID';

export interface Me {
  id: number;
  name: string;
  mobile: string;
  role: Role;
  permissions: Permission[];
  mustChangePassword: boolean;
}

export interface Order {
  id: number;
  ship_name: string;
  address: string;
  landmark: string | null;
  district: string | null;
  state: string | null;
  pincode: string;
  mobile1: string;
  mobile2: string | null;
  product_name: string | null;
  size: string | null;
  note: string | null;
  payment_type: PaymentType;
  amount?: number | null; // null = left blank; missing when the user lacks ORDER_VIEW_AMOUNT
  // COD only (null for Prepaid orders and for orders saved before COD was added)
  booking_date: string | null; // 'YYYY-MM-DD'
  weight: string | null; // as written, e.g. '800 g'
  is_printed: boolean;
  printed_at: string | null;
  raw_message?: string;
  dup_override: boolean;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OrderInput {
  ship_name: string;
  address: string;
  landmark?: string | null;
  district?: string | null;
  state?: string | null;
  pincode: string;
  mobile1: string;
  mobile2?: string | null;
  product_name?: string | null;
  size?: string | null;
  note?: string | null;
  payment_type: PaymentType;
  amount?: number | null;
  booking_date?: string | null;
  weight?: string | null;
}

export interface DuplicateMatch {
  id: number;
  ship_name: string;
  address: string;
  pincode: string;
  mobile1: string;
  payment_type: PaymentType;
  amount?: number | null;
  saved_by: string;
  created_at: string;
  same_message: boolean;
}

export interface ShopSettings {
  shop_name: string;
  address1: string;
  address2: string | null;
  city_pin: string;
  phones: string;
}

export interface ApiErrorBody {
  error: {
    code:
      | 'VALIDATION'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'DUPLICATE'
      | 'NOT_FOUND'
      | 'LOCKED'
      | 'PASSWORD_CHANGE_REQUIRED'
      | 'RATE_LIMITED'
      | 'BUSY'
      | 'EMAIL_NOT_SET_UP'
      | 'EMAIL_FAILED'
      | 'SERVER';
    message: string;
    fields?: Record<string, string>;
    matches?: DuplicateMatch[];
  };
}
