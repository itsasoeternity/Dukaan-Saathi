/**
 * Browser storage for the prototype (the spec's "Database: browser state only").
 * v2 keys hold the spec data model (integer paise, shop_id, consent dates).
 * Data saved by the earlier v1 prototype (rupee amounts) is migrated once on first load.
 */
import type { Customer, Lead, MessageTemplate, Product, ReminderLog, ScheduledMessage, ShelfScan, ShopProfile, Transaction } from '../types';
import { defaultTemplates } from './crm.js';
import { rupeesToPaise } from './money.js';
import { sanitizeDetections } from './shelf.js';

export const KEYS = {
  PROFILE: 'dukaan_saathi_profile_v2',
  CUSTOMERS: 'dukaan_saathi_customers_v2',
  TRANSACTIONS: 'dukaan_saathi_transactions_v2',
  REMINDERS: 'dukaan_saathi_reminders_v2',
  CATALOG: 'dukaan_saathi_catalog_v2',
  SCANS: 'dukaan_saathi_scans_v2',
  REORDER: 'dukaan_saathi_reorder_v2',
  /** CRM: leads, message templates, scheduled messages. */
  LEADS: 'dukaan_saathi_leads_v1',
  TEMPLATES: 'dukaan_saathi_templates_v1',
  SCHEDULED: 'dukaan_saathi_scheduled_v1',
  /** Saathi chat history (this browser only, never synced). */
  CHATS: 'dukaan_saathi_chats_v1',
} as const;

const V1 = {
  PROFILE: 'dukaan_saathi_profile_v1',
  CUSTOMERS: 'dukaan_saathi_customers_v1',
  TRANSACTIONS: 'dukaan_saathi_transactions_v1',
  REMINDERS: 'dukaan_saathi_reminders_v1',
  CATALOG: 'dukaan_saathi_catalog_v1',
  SCANS: 'dukaan_saathi_scans_v1',
  REORDER: 'dukaan_saathi_reorder_v1',
};

export function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function safeSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked (private mode); the app keeps working in memory
  }
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function migrateV1(raw: {
  profile?: any;
  customers?: any[];
  transactions?: any[];
  reminders?: any[];
  catalog?: any[];
  scans?: any[];
}) {
  const shopId: string = raw.profile?.id || 'shop-local';
  const now = new Date().toISOString();

  const profile: ShopProfile | null = raw.profile
    ? {
        id: shopId,
        name: raw.profile.name ?? 'Hamari Dukaan',
        owner: raw.profile.owner ?? '',
        owner_phone: raw.profile.owner_phone ?? raw.profile.phone ?? '',
        upi_id: raw.profile.upi_id ?? '',
        language: raw.profile.language ?? 'hinglish',
        created_at: raw.profile.created_at ?? now,
        consent_accepted: Boolean(raw.profile.consent_accepted),
        address: raw.profile.address,
        reminder_settings: raw.profile.reminder_settings ?? {
          default_tone: 'polite',
          language: raw.profile.language ?? 'hinglish',
        },
      }
    : null;

  const customers: Customer[] = (raw.customers ?? []).map((c) => ({
    id: c.id,
    shop_id: c.shop_id ?? shopId,
    name: c.name,
    // v1 never recorded consent: keep the number only if consent was recorded.
    phone: c.consent_given_at ? c.phone ?? '' : '',
    consent_given_at: c.consent_given_at ?? null,
    note: c.note ?? '',
    created_at: c.created_at ?? now,
    avatar_color: c.avatar_color,
    receipts_opt_in: Boolean(c.consent_given_at && c.receipts_opt_in),
    statement_key: typeof c.statement_key === 'string' ? c.statement_key : null,
    credit_limit_paise: Number.isInteger(c.credit_limit_paise) ? c.credit_limit_paise : null,
  }));

  const transactions: Transaction[] = (raw.transactions ?? []).map((t) => ({
    id: t.id,
    shop_id: t.shop_id ?? shopId,
    customer_id: t.customer_id ?? null,
    type: t.type === 'payment' ? 'payment' : t.type === 'sale' ? 'sale' : 'credit',
    amount_paise: typeof t.amount_paise === 'number' ? t.amount_paise : rupeesToPaise(Number(t.amount) || 0),
    note: t.note ?? '',
    source: t.source === 'voice' || t.source === 'text' ? t.source : 'manual',
    confirmed_at: t.confirmed_at ?? t.date ?? now,
  }));

  const reminders: ReminderLog[] = (raw.reminders ?? []).map((r) => ({
    id: r.id,
    shop_id: r.shop_id ?? shopId,
    customer_id: r.customer_id,
    channel: 'whatsapp',
    text: r.text ?? r.message_preview ?? '',
    amount_paise: typeof r.amount_paise === 'number' ? r.amount_paise : rupeesToPaise(Number(r.amount) || 0),
    tone: r.tone ?? 'polite',
    link_opened_at: r.link_opened_at ?? r.sent_at ?? now,
  }));

  const catalog: Product[] = (raw.catalog ?? []).map((p) => {
    const min = Number(p.low_stock_threshold ?? p.min_level ?? 10);
    const cur = p.current_level;
    const status = p.stock_status ?? (cur === undefined ? 'unknown' : cur === 0 ? 'out' : cur <= min ? 'low' : 'ok');
    return {
      id: p.id,
      shop_id: p.shop_id ?? shopId,
      name: p.name,
      aliases: Array.isArray(p.aliases) ? p.aliases : [],
      category: p.category ?? 'General',
      low_stock_threshold: min,
      unit: p.unit ?? 'pcs',
      supplier_name: p.supplier_name ?? '',
      supplier_phone: p.supplier_phone ?? '',
      mrp_paise: typeof p.mrp_paise === 'number' ? p.mrp_paise : p.mrp ? rupeesToPaise(p.mrp) : undefined,
      stock_status: status,
      status_updated_at: p.status_updated_at,
    };
  });

  const scans: ShelfScan[] = (raw.scans ?? []).map((s) => ({
    id: s.id,
    shop_id: s.shop_id ?? shopId,
    image_ref: s.image_ref ?? s.image_thumbnail ?? '',
    detected_items: sanitizeDetections(s.detected_items ?? s.results),
    overall_notes: s.overall_notes ?? '',
    quality_warning: s.quality_warning ?? null,
    created_at: s.created_at ?? now,
  }));

  return { profile, customers, transactions, reminders, catalog, scans };
}

/** One-time move of v1 browser data to v2 keys. Safe to call on every start. */
export function runStorageMigration(): void {
  try {
    if (localStorage.getItem(KEYS.TRANSACTIONS) || !localStorage.getItem(V1.TRANSACTIONS)) return;
    const migrated = migrateV1({
      profile: safeGet(V1.PROFILE, null),
      customers: safeGet(V1.CUSTOMERS, []),
      transactions: safeGet(V1.TRANSACTIONS, []),
      reminders: safeGet(V1.REMINDERS, []),
      catalog: safeGet(V1.CATALOG, []),
      scans: safeGet(V1.SCANS, []),
    });
    if (migrated.profile) safeSet(KEYS.PROFILE, migrated.profile);
    safeSet(KEYS.CUSTOMERS, migrated.customers);
    safeSet(KEYS.TRANSACTIONS, migrated.transactions);
    safeSet(KEYS.REMINDERS, migrated.reminders);
    if (migrated.catalog.length) safeSet(KEYS.CATALOG, migrated.catalog);
    if (migrated.scans.length) safeSet(KEYS.SCANS, migrated.scans);
    safeSet(KEYS.REORDER, safeGet(V1.REORDER, []));
    Object.values(V1).forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore: fall back to fresh demo data
  }
}

/* ---------------------- login: per-shop browser cache ---------------------- */

/** Which account the browser cache belongs to ("demo" or a shop id). */
export const OWNER_KEY = 'dukaan_saathi_owner';
/** Set while local changes have not reached the server yet (offline queue). */
export const UNSYNCED_KEY = 'dukaan_saathi_unsynced';
/** The logged-in shop's account details, so the app can open offline. */
export const LAST_SHOP_KEY = 'dukaan_saathi_last_shop';

export function markUnsynced(on: boolean) {
  try {
    if (on) localStorage.setItem(UNSYNCED_KEY, new Date().toISOString());
    else localStorage.removeItem(UNSYNCED_KEY);
  } catch {
    // ignore
  }
}

export function hasUnsynced(): boolean {
  try {
    return Boolean(localStorage.getItem(UNSYNCED_KEY));
  } catch {
    return false;
  }
}

export interface LocalShopData {
  profile: ShopProfile;
  customers: Customer[];
  transactions: Transaction[];
  reminders: ReminderLog[];
  catalog: Product[];
  scans: ShelfScan[];
  reorder: unknown[];
  /** CRM (optional: older uploads do not have them). */
  leads?: Lead[];
  templates?: MessageTemplate[];
  scheduled?: ScheduledMessage[];
}

export function localOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

export function setLocalOwner(owner: string) {
  try {
    localStorage.setItem(OWNER_KEY, owner);
  } catch {
    // ignore
  }
}

/** Remove the cached khata from this browser (logout on a shared phone, or switching accounts). */
export function clearLocalData() {
  try {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(OWNER_KEY);
    localStorage.removeItem(UNSYNCED_KEY);
    localStorage.removeItem(LAST_SHOP_KEY);
  } catch {
    // ignore
  }
}

export function readLocalData(): LocalShopData | null {
  const profile = safeGet<ShopProfile | null>(KEYS.PROFILE, null);
  if (!profile) return null;
  return {
    profile,
    customers: safeGet(KEYS.CUSTOMERS, []),
    transactions: safeGet(KEYS.TRANSACTIONS, []),
    reminders: safeGet(KEYS.REMINDERS, []),
    catalog: safeGet(KEYS.CATALOG, []),
    scans: safeGet(KEYS.SCANS, []),
    reorder: safeGet(KEYS.REORDER, []),
    leads: safeGet(KEYS.LEADS, []),
    templates: safeGet<MessageTemplate[] | null>(KEYS.TEMPLATES, null) ?? defaultTemplates(profile.id),
    scheduled: safeGet(KEYS.SCHEDULED, []),
  };
}

export function writeLocalData(d: LocalShopData) {
  safeSet(KEYS.PROFILE, d.profile);
  safeSet(KEYS.CUSTOMERS, d.customers);
  safeSet(KEYS.TRANSACTIONS, d.transactions);
  safeSet(KEYS.REMINDERS, d.reminders);
  safeSet(KEYS.CATALOG, d.catalog);
  safeSet(KEYS.SCANS, d.scans);
  safeSet(KEYS.REORDER, d.reorder);
  safeSet(KEYS.LEADS, d.leads ?? []);
  safeSet(KEYS.TEMPLATES, d.templates ?? defaultTemplates(d.profile.id));
  safeSet(KEYS.SCHEDULED, d.scheduled ?? []);
}
