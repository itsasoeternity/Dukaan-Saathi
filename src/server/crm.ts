/**
 * CRM on the server:
 *  - GET  /api/crm/status      (shop)  whether automatic sending is on, and what the server has sent
 *  - GET  /api/cron/send-due   (cron)  sends every due scheduled message through the WhatsApp Cloud API
 *
 * Automatic sending is OFF unless WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set. Without them the
 * app shows due messages to the owner, who opens WhatsApp and taps send (same as payment reminders).
 *
 * WhatsApp only delivers free text to people who messaged the shop in the last 24 hours. For anyone
 * else a template must be approved by Meta first; set its name on the template in the app
 * ("WhatsApp template name") and the server sends that template, with {{1}} = the lead's first name.
 *
 * Logs never contain names, phone numbers or message text.
 */
import type { Express, Request, Response } from 'express';
import { AuthedRequest, requireRole } from './auth.js';
import { getStore, Store } from './store.js';
import type { SendResult, ShopData, ShopRecord } from './types.js';
import { canMessage, dueMessages, firstName, renderTemplate, toE164 } from '../lib/crm.js';
import type { Lead, MessageTemplate, ScheduledMessage } from '../types/index.js';

function log(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

export function autoSendConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Messages older than this are not sent automatically any more (e.g. after a long outage); the owner decides. */
const MAX_LATE_MS = 24 * 60 * 60_000;

export type WhatsAppSender = (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

const cloudApiSender: WhatsAppSender = async (payload) => {
  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
    return { ok: false, error: `WhatsApp: ${body.error?.message ?? res.status}`.slice(0, 200) };
  } catch {
    return { ok: false, error: 'WhatsApp API tak nahi pahunch paye' };
  }
};

/** Request body for one message: an approved template if the shop set one, otherwise plain text. */
export function buildPayload(lead: Lead, tpl: MessageTemplate, text: string): Record<string, unknown> {
  const to = toE164(lead.phone)!;
  if (tpl.wa_template_name) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: tpl.wa_template_name,
        language: { code: tpl.wa_language || 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: firstName(lead.name) }] }],
      },
    };
  }
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body: text, preview_url: false } };
}

/** Send every due message of one shop. Returns counts only. */
export async function sendDueForShop(
  store: Store,
  shop: ShopRecord,
  data: ShopData,
  send: WhatsAppSender,
  now = new Date(),
): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  const scheduled = data.scheduled ?? [];
  if (!scheduled.length) return out;
  const done = new Set((await store.listSendResults(shop.id)).map((r) => r.id));
  for (const m of dueMessages(scheduled, now)) {
    if (done.has(m.id)) continue;
    const lead = data.leads?.find((l) => l.id === m.lead_id);
    const tpl = data.templates?.find((t) => t.id === m.template_id);
    const late = now.getTime() - new Date(m.send_at).getTime() > MAX_LATE_MS;
    if (late) {
      out.skipped++;
      continue;
    }
    if (!(await store.claimSend(shop.id, m.id))) continue;
    const fail = async (error: string) => {
      out.failed++;
      await store.setSendResult(shop.id, { id: m.id, status: 'failed', sent_via: 'api', error });
    };
    if (!lead || !tpl) {
      await fail('Lead ya template mita diya gaya');
      continue;
    }
    if (!canMessage(lead)) {
      await fail('Number ya consent nahi hai');
      continue;
    }
    const text = renderTemplate(tpl.body, { name: lead.name, shop: data.profile.name || shop.name, owner: data.profile.owner, upi: data.profile.upi_id });
    const r = await send(buildPayload(lead, tpl, text));
    if (r.ok) {
      out.sent++;
      await store.setSendResult(shop.id, { id: m.id, status: 'sent', sent_via: 'api', sent_at: new Date().toISOString(), text });
    } else {
      await fail(r.error ?? 'Send nahi hua');
    }
  }
  return out;
}

export async function sendAllDue(send: WhatsAppSender = cloudApiSender, now = new Date()) {
  const store = await getStore();
  const totals = { shops: 0, sent: 0, failed: 0, skipped: 0 };
  for (const shop of await store.listShops()) {
    if (shop.status !== 'active') continue;
    const data = await store.getData(shop.id);
    if (!data?.scheduled?.length) continue;
    totals.shops++;
    const r = await sendDueForShop(store, shop, data, send, now);
    totals.sent += r.sent;
    totals.failed += r.failed;
    totals.skipped += r.skipped;
  }
  return totals;
}

/** Overlay the server's send results on a shop's scheduled messages (used when the shop loads its data). */
export function applySendResults(scheduled: ScheduledMessage[] | undefined, results: SendResult[]): ScheduledMessage[] | undefined {
  if (!scheduled || !results.length) return scheduled;
  const byId = new Map(results.filter((r) => r.status !== 'sending').map((r) => [r.id, r]));
  return scheduled.map((m) => {
    const r = byId.get(m.id);
    if (!r || m.status !== 'scheduled') return m;
    return { ...m, status: r.status as 'sent' | 'failed', sent_via: 'api', sent_at: r.sent_at, text: r.text, error: r.error };
  });
}

let running = false;

export function registerCrmRoutes(app: Express) {
  app.get('/api/crm/status', requireRole('shop'), async (req: AuthedRequest, res: Response) => {
    const store = await getStore();
    const results = (await store.listSendResults(req.session!.sub)).filter((r) => r.status !== 'sending');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ auto_send: autoSendConfigured(), results });
  });

  // Called by a scheduler (Vercel Cron, an external cron service, or the timer in server.ts).
  app.get('/api/cron/send-due', async (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
    if (!autoSendConfigured()) return res.json({ ok: true, auto_send: false });
    if (running) return res.json({ ok: true, busy: true });
    running = true;
    try {
      const totals = await sendAllDue();
      log('crm_send_due', totals);
      return res.json({ ok: true, ...totals });
    } finally {
      running = false;
    }
  });
}

/** For a normal Node server: check for due messages every minute (no external cron needed). */
export function startCrmTimer() {
  if (!autoSendConfigured()) return;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const totals = await sendAllDue();
      if (totals.sent || totals.failed) log('crm_send_due', totals);
    } catch {
      log('crm_send_due_error');
    } finally {
      running = false;
    }
  }, 60_000);
  log('crm_timer_started');
}
