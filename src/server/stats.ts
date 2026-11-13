import { addDays, pendingAsOf, startOfDay, summarizeRange } from '../lib/ledger.js';
import type { ShopData, ShopStats } from './types';

/** Compute the aggregate numbers the admin may see. Pure, so it can be tested. */
export function computeShopStats(data: ShopData, now = new Date()): ShopStats {
  const to = addDays(startOfDay(now), 1);
  const from = addDays(to, -30);
  const month = summarizeRange(data.transactions, from, to);
  const times = [
    ...data.transactions.map((t) => t.confirmed_at),
    ...data.reminders.map((r) => r.link_opened_at),
    ...data.scans.map((s) => s.created_at),
  ].sort();
  return {
    customers: data.customers.length,
    customers_with_phone: data.customers.filter((c) => c.phone && c.consent_given_at).length,
    transactions: data.transactions.length,
    pending_paise: pendingAsOf(data.transactions, new Date(8.64e15)),
    sales_30d_paise: month.sales_paise,
    credit_30d_paise: month.credit_given_paise,
    recovered_30d_paise: month.recovered_paise,
    voice_entries: data.transactions.filter((t) => t.source === 'voice').length,
    reminders_opened: data.reminders.length,
    shelf_scans: data.scans.length,
    products_low_or_out: data.catalog.filter((p) => p.stock_status === 'low' || p.stock_status === 'out').length,
    last_activity_at: times.length ? times[times.length - 1] : null,
  };
}

const CRM_LIMITS: Record<string, number> = { leads: 10000, templates: 100, scheduled: 50000 };

const LIMITS: Record<string, number> = { customers: 5000, transactions: 100000, reminders: 20000, catalog: 2000, scans: 50, reorder: 2000 };

/** Basic shape and size checks on data uploaded by a shop. Returns an error message or null. */
export function validateShopData(d: unknown): string | null {
  if (!d || typeof d !== 'object') return 'data must be an object';
  const x = d as Record<string, unknown>;
  if (!x.profile || typeof x.profile !== 'object') return 'profile missing';
  for (const [k, max] of Object.entries(LIMITS)) {
    if (!Array.isArray(x[k])) return `${k} must be an array`;
    if ((x[k] as unknown[]).length > max) return `too many ${k}`;
  }
  for (const t of x.transactions as Array<Record<string, unknown>>) {
    if (!Number.isInteger(t.amount_paise) || (t.amount_paise as number) <= 0) return 'amount_paise must be a positive integer';
    if (!['credit', 'payment', 'sale'].includes(t.type as string)) return 'bad transaction type';
  }
  for (const [k, max] of Object.entries(CRM_LIMITS)) {
    if (x[k] === undefined) continue;
    if (!Array.isArray(x[k])) return `${k} must be an array`;
    if ((x[k] as unknown[]).length > max) return `too many ${k}`;
  }
  for (const m of (x.scheduled as Array<Record<string, unknown>> | undefined) ?? []) {
    if (typeof m.id !== 'string' || typeof m.lead_id !== 'string' || typeof m.template_id !== 'string') return 'bad scheduled message';
    if (typeof m.send_at !== 'string' || Number.isNaN(Date.parse(m.send_at))) return 'bad send_at';
    if (!['scheduled', 'sent', 'failed', 'cancelled'].includes(m.status as string)) return 'bad scheduled status';
  }
  for (const t of (x.templates as Array<Record<string, unknown>> | undefined) ?? []) {
    if (typeof t.body !== 'string' || t.body.length > 2000) return 'template body must be text up to 2000 characters';
  }
  return null;
}
