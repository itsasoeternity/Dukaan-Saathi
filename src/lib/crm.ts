/**
 * CRM logic: leads, tags, message templates and scheduled sends. Pure functions, used by the browser
 * (CrmScreen) and the server (automatic sending), and covered by tests/crm.test.ts.
 */
import type { Lead, MessageTemplate, ScheduledMessage } from '../types';

export const LEAD_STATUSES = ['new', 'contacted', 'interested', 'converted', 'lost'] as const;

export const LEAD_STATUS_LABEL: Record<Lead['status'], string> = {
  new: 'Naya',
  contacted: 'Baat hui',
  interested: 'Interested',
  converted: 'Grahak bana',
  lost: 'Nahi chahiye',
};

export const PLACEHOLDERS = ['{name}', '{shop}', '{owner}', '{upi}'] as const;

/** Lowercase, trim, collapse spaces, drop empties and duplicates. "VIP, vip , Diwali" -> ["vip", "diwali"] */
export function normalizeTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(',');
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^#/, '').slice(0, 30);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Every tag in use, most used first. */
export function allTags(leads: Pick<Lead, 'tags'>[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const l of leads) for (const t of l.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Leads that have ALL the given tags (no tags = every lead). */
export function filterByTags<T extends Pick<Lead, 'tags'>>(leads: T[], tags: string[]): T[] {
  if (!tags.length) return leads;
  return leads.filter((l) => tags.every((t) => l.tags.includes(t)));
}

/** A lead can get messages only with a valid Indian mobile number saved with consent. */
export function canMessage(lead: Pick<Lead, 'phone' | 'consent_given_at'>): boolean {
  return Boolean(lead.consent_given_at && toE164(lead.phone));
}

/** 10-digit Indian mobile (or 91 / 0 prefixed) -> "91XXXXXXXXXX"; anything else -> null. */
export function toE164(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10 && /^[6-9]/.test(d)) return `91${d}`;
  if (d.length === 12 && d.startsWith('91') && /^[6-9]/.test(d.slice(2))) return d;
  if (d.length === 11 && d.startsWith('0') && /^[6-9]/.test(d.slice(1))) return `91${d.slice(1)}`;
  return null;
}

export interface TemplateContext {
  name: string;
  shop: string;
  owner?: string;
  upi?: string;
}

/** Fill {name}, {shop}, {owner}, {upi}. Unknown {placeholders} are left as they are. */
export function renderTemplate(body: string, ctx: TemplateContext): string {
  const values: Record<string, string> = {
    name: firstName(ctx.name),
    shop: ctx.shop,
    owner: ctx.owner ?? '',
    upi: ctx.upi ?? '',
  };
  return body
    .replace(/\{(name|shop|owner|upi)\}/gi, (_m, k: string) => values[k.toLowerCase()])
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** "Sharma Ji (Gali 3)" -> "Sharma Ji": the bracketed note is for the shop, not the message. */
export function firstName(name: string): string {
  return name.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim() || name.trim();
}

/** Messages whose time has come and that still need sending. */
export function dueMessages(messages: ScheduledMessage[], now = new Date()): ScheduledMessage[] {
  const t = now.getTime();
  return messages
    .filter((m) => m.status === 'scheduled' && new Date(m.send_at).getTime() <= t)
    .sort((a, b) => a.send_at.localeCompare(b.send_at));
}

export function upcomingMessages(messages: ScheduledMessage[], now = new Date()): ScheduledMessage[] {
  const t = now.getTime();
  return messages
    .filter((m) => m.status === 'scheduled' && new Date(m.send_at).getTime() > t)
    .sort((a, b) => a.send_at.localeCompare(b.send_at));
}

/**
 * Create one scheduled message per lead. Leads that cannot be messaged (no number or no consent) and
 * leads that already have the same template scheduled at the same minute are skipped.
 */
export function planSchedule(params: {
  leads: Lead[];
  template: Pick<MessageTemplate, 'id'>;
  sendAt: Date;
  existing: ScheduledMessage[];
  shopId: string;
  makeId: () => string;
  now?: Date;
}): { created: ScheduledMessage[]; skipped: Array<{ lead_id: string; reason: 'no_consent' | 'duplicate' }> } {
  const { leads, template, sendAt, existing, shopId, makeId } = params;
  const now = params.now ?? new Date();
  const minute = (iso: string) => iso.slice(0, 16);
  const sendIso = sendAt.toISOString();
  const created: ScheduledMessage[] = [];
  const skipped: Array<{ lead_id: string; reason: 'no_consent' | 'duplicate' }> = [];
  for (const lead of leads) {
    if (!canMessage(lead)) {
      skipped.push({ lead_id: lead.id, reason: 'no_consent' });
      continue;
    }
    const dup = existing.some(
      (m) => m.status === 'scheduled' && m.lead_id === lead.id && m.template_id === template.id && minute(m.send_at) === minute(sendIso),
    );
    if (dup) {
      skipped.push({ lead_id: lead.id, reason: 'duplicate' });
      continue;
    }
    created.push({
      id: makeId(),
      shop_id: shopId,
      lead_id: lead.id,
      template_id: template.id,
      send_at: sendIso,
      status: 'scheduled',
      created_at: now.toISOString(),
    });
  }
  return { created, skipped };
}

/**
 * Server-side merge when a shop uploads its data: a message the server already sent (or failed to send)
 * keeps that result even if the phone still has it as "scheduled", so it is never sent twice.
 */
export function keepServerResults(incoming: ScheduledMessage[], current: ScheduledMessage[] | undefined): ScheduledMessage[] {
  if (!current?.length) return incoming;
  const done = new Map(current.filter((m) => m.status === 'sent' || m.status === 'failed').map((m) => [m.id, m]));
  return incoming.map((m) => {
    const server = done.get(m.id);
    return server && m.status === 'scheduled' ? { ...m, ...pickResult(server) } : m;
  });
}

export function pickResult(m: ScheduledMessage): Pick<ScheduledMessage, 'status' | 'sent_via' | 'sent_at' | 'text' | 'error'> {
  return { status: m.status, sent_via: m.sent_via, sent_at: m.sent_at, text: m.text, error: m.error };
}

/** Quick time choices for the scheduler, in the browser's local time. */
export function quickTimes(now = new Date()): Array<{ label: string; at: Date }> {
  const at = (days: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const inHour = new Date(now.getTime() + 60 * 60_000);
  inHour.setSeconds(0, 0);
  const list = [
    { label: '1 ghante baad', at: inHour },
    { label: 'Aaj shaam 6 baje', at: at(0, 18) },
    { label: 'Kal subah 10 baje', at: at(1, 10) },
    { label: 'Kal shaam 6 baje', at: at(1, 18) },
  ];
  // Next Sunday 10am (or the one after, if today is Sunday)
  const toSunday = (7 - now.getDay()) % 7 || 7;
  list.push({ label: 'Ravivar subah 10 baje', at: at(toSunday, 10) });
  return list.filter((q) => q.at.getTime() > now.getTime() + 60_000);
}

/** Date -> value for <input type="datetime-local"> (local time). */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function defaultTemplates(shopId: string, now = new Date().toISOString()): MessageTemplate[] {
  return [
    {
      id: 'tpl-welcome',
      shop_id: shopId,
      name: 'Swagat (Welcome)',
      body: 'Namaste {name} ji! {shop} mein aapka swagat hai. Ghar ka saara rashan, doodh aur daily saman yahan milta hai. Order WhatsApp par bhejiye, hum ghar tak pahuncha denge.',
      created_at: now,
    },
    {
      id: 'tpl-offer',
      shop_id: shopId,
      name: 'Offer',
      body: 'Namaste {name} ji, {shop} mein is hafte special offer: chuninda saman par chhoot. Aaj hi aaiye ya WhatsApp par order kijiye!',
      created_at: now,
    },
    {
      id: 'tpl-followup',
      shop_id: shopId,
      name: 'Follow-up',
      body: 'Namaste {name} ji, {shop} se {owner} bol raha hoon. Kya aapko kisi saman ki zaroorat hai? Bataiye, hum taiyaar rakhenge.',
      created_at: now,
    },
    {
      id: 'tpl-festival',
      shop_id: shopId,
      name: 'Tyohaar',
      body: 'Namaste {name} ji! Tyohaar ki shubhkamnayein. {shop} mein mithai ka saman, dry fruits aur pooja samagri aa gayi hai. Pehle se order karke rakhwa lijiye.',
      created_at: now,
    },
  ];
}
