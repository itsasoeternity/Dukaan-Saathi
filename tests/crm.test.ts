import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { Lead, MessageTemplate, ScheduledMessage } from '../src/types';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-crm-test-'));
process.env.DATA_DIR = dataDir;
process.env.SESSION_SECRET = 'test-secret-test-secret-1234';
process.env.CRON_SECRET = 'cron-test-secret';
delete process.env.DATABASE_URL;
delete process.env.WHATSAPP_TOKEN;
delete process.env.WHATSAPP_PHONE_NUMBER_ID;

const crm = await import('../src/lib/crm');
const { sendDueForShop, buildPayload } = await import('../src/server/crm');
const { getStore } = await import('../src/server/store');
const { app } = await import('../src/server/app');
const { initialShopProfile } = await import('../src/utils/seedData');

let server: Server;
let base = '';
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function call(method: string, url: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, json: (await res.json()) as Record<string, any>, cookie: setCookie ? setCookie.split(';')[0] : undefined };
}

const lead = (id: string, over: Partial<Lead> = {}): Lead => ({
  id, shop_id: 's', name: `Lead ${id}`, phone: '9811000111', consent_given_at: '2026-11-01T00:00:00Z',
  tags: [], status: 'new', source: '', note: '', created_at: '2026-11-01T00:00:00Z', ...over,
});
const tpl: MessageTemplate = { id: 'tpl-1', shop_id: 's', name: 'Offer', body: 'Namaste {name} ji, {shop} mein offer! UPI: {upi}', created_at: '' };

/* ------------------------------- pure logic ------------------------------- */

test('tags are normalised: lowercase, trimmed, no duplicates, no #', () => {
  assert.deepEqual(crm.normalizeTags('VIP, vip , #Diwali,,  home   delivery'), ['vip', 'diwali', 'home delivery']);
  assert.deepEqual(crm.normalizeTags(['A', 'a', ' ']), ['a']);
});

test('tag filter needs every chosen tag; allTags counts usage', () => {
  const leads = [lead('1', { tags: ['vip', 'bulk'] }), lead('2', { tags: ['vip'] }), lead('3', { tags: ['bulk'] })];
  assert.deepEqual(crm.filterByTags(leads, ['vip']).map((l) => l.id), ['1', '2']);
  assert.deepEqual(crm.filterByTags(leads, ['vip', 'bulk']).map((l) => l.id), ['1']);
  assert.equal(crm.filterByTags(leads, []).length, 3);
  assert.deepEqual(crm.allTags(leads), [{ tag: 'bulk', count: 2 }, { tag: 'vip', count: 2 }]);
});

test('template placeholders are filled; bracket notes are dropped from the name', () => {
  const text = crm.renderTemplate(tpl.body, { name: 'Sharma Ji (Gali 3)', shop: 'Gupta Kirana', upi: 'g@okaxis' });
  assert.equal(text, 'Namaste Sharma Ji ji, Gupta Kirana mein offer! UPI: g@okaxis');
  assert.equal(crm.renderTemplate('{NAME} {unknown}', { name: 'Neha', shop: 'X' }), 'Neha {unknown}');
});

test('only leads with a valid number and consent can be messaged', () => {
  assert.equal(crm.canMessage(lead('1')), true);
  assert.equal(crm.canMessage(lead('2', { consent_given_at: null })), false);
  assert.equal(crm.canMessage(lead('3', { phone: '12345' })), false);
  assert.equal(crm.toE164('09811000111'), '919811000111');
});

test('planSchedule: one message per reachable lead, skips no-consent and duplicates', () => {
  let n = 0;
  const at = new Date('2026-11-20T04:30:00Z');
  const first = crm.planSchedule({
    leads: [lead('1'), lead('2', { consent_given_at: null, phone: '' })],
    template: tpl, sendAt: at, existing: [], shopId: 's', makeId: () => `m${++n}`,
  });
  assert.equal(first.created.length, 1);
  assert.equal(first.created[0].send_at, at.toISOString());
  assert.deepEqual(first.skipped, [{ lead_id: '2', reason: 'no_consent' }]);
  const again = crm.planSchedule({ leads: [lead('1')], template: tpl, sendAt: at, existing: first.created, shopId: 's', makeId: () => 'x' });
  assert.equal(again.created.length, 0);
  assert.equal(again.skipped[0].reason, 'duplicate');
});

test('due vs upcoming split by time; cancelled and sent are neither', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  const m = (id: string, send_at: string, status: ScheduledMessage['status'] = 'scheduled'): ScheduledMessage => ({
    id, shop_id: 's', lead_id: '1', template_id: 'tpl-1', send_at, status, created_at: '',
  });
  const list = [m('a', '2026-11-20T09:59:00Z'), m('b', '2026-11-20T10:30:00Z'), m('c', '2026-11-20T08:00:00Z', 'cancelled'), m('d', '2026-11-20T07:00:00Z', 'sent')];
  assert.deepEqual(crm.dueMessages(list, now).map((x) => x.id), ['a']);
  assert.deepEqual(crm.upcomingMessages(list, now).map((x) => x.id), ['b']);
});

test('quick times are all in the future', () => {
  const now = new Date(2026, 10, 15, 19, 0); // Sunday 7pm
  const q = crm.quickTimes(now);
  assert.ok(q.length >= 3);
  for (const x of q) assert.ok(x.at.getTime() > now.getTime());
  assert.ok(!q.some((x) => x.label.startsWith('Aaj shaam'))); // 6pm already passed
});

test('WhatsApp payload: approved template when set, plain text otherwise', () => {
  const text = buildPayload(lead('1'), tpl, 'hello') as any;
  assert.equal(text.type, 'text');
  assert.equal(text.to, '919811000111');
  const t = buildPayload(lead('1', { name: 'Neha Kapoor (B-12)' }), { ...tpl, wa_template_name: 'offer_v1', wa_language: 'hi' }, 'x') as any;
  assert.equal(t.type, 'template');
  assert.equal(t.template.name, 'offer_v1');
  assert.equal(t.template.language.code, 'hi');
  assert.equal(t.template.components[0].parameters[0].text, 'Neha Kapoor');
});

/* --------------------------------- server --------------------------------- */

test('server sends each due message once, records failures, ignores future and very late ones', async () => {
  const store = await getStore();
  const signup = await call('POST', '/api/auth/signup', { email: 'crm1@example.test', password: 'vendor-pass-1', shopName: 'CRM Shop', ownerName: 'A' });
  assert.equal(signup.status, 200);
  const shopId = signup.json.shop.id as string;
  const now = new Date('2026-11-20T10:00:00Z');
  const sch = (id: string, lead_id: string, send_at: string): ScheduledMessage => ({
    id, shop_id: shopId, lead_id, template_id: 'tpl-1', send_at, status: 'scheduled', created_at: '',
  });
  const data = {
    profile: { ...initialShopProfile, id: shopId, name: 'CRM Shop' },
    customers: [], transactions: [], reminders: [], catalog: [], scans: [], reorder: [],
    leads: [lead('L1'), lead('L2', { phone: '', consent_given_at: null })],
    templates: [tpl],
    scheduled: [
      sch('due-ok', 'L1', '2026-11-20T09:59:00Z'),
      sch('due-noconsent', 'L2', '2026-11-20T09:00:00Z'),
      sch('future', 'L1', '2026-11-20T11:00:00Z'),
      sch('too-late', 'L1', '2026-11-18T09:00:00Z'),
    ],
  };
  const put = await call('PUT', '/api/shop/data', { data }, signup.cookie);
  assert.equal(put.status, 200);

  const sent: any[] = [];
  const sender = async (p: Record<string, unknown>) => {
    sent.push(p);
    return { ok: true };
  };
  const shop = (await store.getShop(shopId))!;
  const stored = (await store.getData(shopId))!;
  const r1 = await sendDueForShop(store, shop, stored, sender, now);
  assert.deepEqual(r1, { sent: 1, failed: 1, skipped: 1 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text.body, 'Namaste Lead L1 ji, CRM Shop mein offer! UPI: ' + (initialShopProfile.upi_id));

  // A second run (or a phone uploading the old "scheduled" copy) never sends it again.
  assert.equal((await call('PUT', '/api/shop/data', { data }, signup.cookie)).status, 200);
  const r2 = await sendDueForShop(store, shop, (await store.getData(shopId))!, sender, now);
  assert.equal(r2.sent, 0);
  assert.equal(sent.length, 1);

  // The shop sees the results through the status endpoint and when loading its data.
  const status = await call('GET', '/api/crm/status', undefined, signup.cookie);
  assert.equal(status.json.auto_send, false);
  const byId = Object.fromEntries((status.json.results as any[]).map((r) => [r.id, r.status]));
  assert.deepEqual(byId, { 'due-ok': 'sent', 'due-noconsent': 'failed' });
  const loaded = await call('GET', '/api/shop/data', undefined, signup.cookie);
  const st = Object.fromEntries((loaded.json.data.scheduled as any[]).map((m) => [m.id, m.status]));
  assert.deepEqual(st, { 'due-ok': 'sent', 'due-noconsent': 'failed', future: 'scheduled', 'too-late': 'scheduled' });
});

test('CRM status needs a shop login; cron endpoint needs the secret', async () => {
  assert.equal((await call('GET', '/api/crm/status')).status, 401);
  assert.equal((await call('GET', '/api/cron/send-due')).status, 401);
  const ok = await call('GET', '/api/cron/send-due', undefined, undefined, { Authorization: 'Bearer cron-test-secret' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.auto_send, false);
});

test('bad scheduled data is rejected on upload', async () => {
  const s = await call('POST', '/api/auth/signup', { email: 'crm2@example.test', password: 'vendor-pass-2', shopName: 'S2', ownerName: 'B' });
  const base = { profile: initialShopProfile, customers: [], transactions: [], reminders: [], catalog: [], scans: [], reorder: [] };
  const bad = await call('PUT', '/api/shop/data', { data: { ...base, scheduled: [{ id: 'x', lead_id: 'l', template_id: 't', send_at: 'not a date', status: 'scheduled' }] } }, s.cookie);
  assert.equal(bad.status, 400);
  // Older uploads without CRM fields still work.
  assert.equal((await call('PUT', '/api/shop/data', { data: base }, s.cookie)).status, 200);
});
