import type { Customer, Lead, MessageTemplate, Product, ReminderLog, ReorderItem, ScheduledMessage, ShelfScan, ShopProfile, Transaction } from '../types';

/** Everything one shop keeps. Synced from the shop's browser; only that shop reads it back. */
export interface ShopData {
  profile: ShopProfile;
  customers: Customer[];
  transactions: Transaction[];
  reminders: ReminderLog[];
  catalog: Product[];
  scans: ShelfScan[];
  reorder: ReorderItem[];
  /** CRM. Optional because data uploaded before the CRM existed does not have them. */
  leads?: Lead[];
  templates?: MessageTemplate[];
  scheduled?: ScheduledMessage[];
}

/** What happened to one scheduled message the server tried to send (kept apart from the shop's data). */
export interface SendResult {
  id: string;
  status: 'sending' | 'sent' | 'failed';
  sent_via: 'api';
  sent_at?: string;
  text?: string;
  error?: string;
}

/** Shop-level totals. This is all the admin panel sees: no customer names, phones or per-customer balances. */
export interface ShopStats {
  customers: number;
  customers_with_phone: number;
  transactions: number;
  pending_paise: number;
  sales_30d_paise: number;
  credit_30d_paise: number;
  recovered_30d_paise: number;
  voice_entries: number;
  reminders_opened: number;
  shelf_scans: number;
  products_low_or_out: number;
  last_activity_at: string | null;
}

export type ShopStatus = 'active' | 'suspended';
export type ShopPlan = 'free' | 'basic' | 'pro';

/** A vendor (kirana shop) account. */
export interface ShopRecord {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  owner: string;
  phone: string;
  upi_id: string;
  status: ShopStatus;
  plan: ShopPlan;
  admin_notes: string;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  stats: ShopStats | null;
}

/** What the admin API returns for a vendor (never the password hash or the shop's khata). */
export type PublicShop = Omit<ShopRecord, 'password_hash'>;

export function publicShop(r: ShopRecord): PublicShop {
  const { password_hash: _ignored, ...rest } = r;
  return rest;
}
