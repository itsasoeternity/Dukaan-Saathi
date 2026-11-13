/**
 * Login, per-shop data sync and the admin (vendor management) API.
 *
 * Privacy rule from the spec: the admin manages vendor ACCOUNTS (name, owner, plan, status, password)
 * and sees shop-level totals, but never a shop's customer names, phone numbers or per-customer balances.
 * Only the shop itself can read its khata.
 */
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import {
  AuthedRequest,
  clearSessionCookie,
  getSession,
  hashPassword,
  isAdminLogin,
  loginRateLimited,
  passwordProblem,
  requireRole,
  resetLoginAttempts,
  setSessionCookie,
  signSession,
  verifyPassword,
} from './auth.js';
import { computeShopStats, validateShopData } from './stats.js';
import { parseStatementToken } from '../lib/statement.js';
import { computeBalances } from '../lib/ledger.js';
import { getStore } from './store.js';
import { applySendResults } from './crm.js';
import { publicShop, ShopData, ShopPlan, ShopRecord, ShopStats } from './types.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function clean(v: unknown, max = 120): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function newShopId() {
  return `shop_${crypto.randomBytes(8).toString('hex')}`;
}

function log(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

async function createShopAccount(input: {
  email: string;
  password: string;
  name: string;
  owner: string;
  phone?: string;
  plan?: ShopPlan;
}): Promise<{ shop?: ShopRecord; error?: string; status?: number }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Sahi email daaliye', status: 400 };
  const pw = passwordProblem(input.password);
  if (pw) return { error: pw, status: 400 };
  if (!input.name) return { error: 'Dukaan ka naam zaroori hai', status: 400 };
  if (email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) return { error: 'Yeh email admin ke liye hai', status: 409 };
  const store = await getStore();
  if (await store.getShopByEmail(email)) return { error: 'Is email se account pehle se hai', status: 409 };
  const now = new Date().toISOString();
  const shop: ShopRecord = {
    id: newShopId(),
    email,
    password_hash: hashPassword(input.password),
    name: input.name,
    owner: input.owner,
    phone: (input.phone ?? '').replace(/\D/g, '').slice(-10),
    upi_id: '',
    status: 'active',
    plan: input.plan ?? 'free',
    admin_notes: '',
    created_at: now,
    updated_at: now,
    last_sync_at: null,
    stats: null,
  };
  await store.createShop(shop);
  return { shop };
}

export function registerAccountRoutes(app: Express) {
  /* ------------------------------- auth ------------------------------- */

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const email = clean(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const key = `${req.ip}|${email}`;
    if (loginRateLimited(key)) return res.status(429).json({ error: 'Bahut baar galat password. 15 minute baad koshish karein.' });

    if (isAdminLogin(email, password)) {
      resetLoginAttempts(key);
      setSessionCookie(res, signSession({ role: 'admin', sub: 'admin' }));
      log('login', { role: 'admin' });
      return res.json({ role: 'admin' });
    }

    const store = await getStore();
    const shop = await store.getShopByEmail(email);
    if (!shop || !verifyPassword(password, shop.password_hash)) {
      return res.status(401).json({ error: 'Email ya password galat hai' });
    }
    if (shop.status === 'suspended') return res.status(403).json({ error: 'Yeh account admin ne band kiya hai. Support se baat karein.' });
    resetLoginAttempts(key);
    setSessionCookie(res, signSession({ role: 'shop', sub: shop.id }));
    log('login', { role: 'shop' });
    return res.json({ role: 'shop', shop: publicShop(shop) });
  });

  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    if (process.env.ALLOW_SIGNUP === 'false') return res.status(403).json({ error: 'Naya account sirf admin bana sakta hai' });
    if (loginRateLimited(`signup|${req.ip}`)) return res.status(429).json({ error: 'Thodi der baad koshish karein' });
    const result = await createShopAccount({
      email: clean(req.body?.email, 254),
      password: typeof req.body?.password === 'string' ? req.body.password : '',
      name: clean(req.body?.shopName),
      owner: clean(req.body?.ownerName),
    });
    if (!result.shop) return res.status(result.status ?? 400).json({ error: result.error });
    setSessionCookie(res, signSession({ role: 'shop', sub: result.shop.id }));
    log('signup', {});
    return res.json({ role: 'shop', shop: publicShop(result.shop) });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    const s = getSession(req);
    if (!s) return res.json({ role: null, signupAllowed: process.env.ALLOW_SIGNUP !== 'false' });
    if (s.role === 'admin') return res.json({ role: 'admin' });
    const shop = await (await getStore()).getShop(s.sub);
    if (!shop || shop.status === 'suspended') {
      clearSessionCookie(res);
      return res.json({ role: null, signupAllowed: process.env.ALLOW_SIGNUP !== 'false' });
    }
    return res.json({ role: 'shop', shop: publicShop(shop) });
  });

  /* --------------------------- shop's own data --------------------------- */

  app.get('/api/shop/data', requireRole('shop'), async (req: AuthedRequest, res: Response) => {
    const store = await getStore();
    const shop = await store.getShop(req.session!.sub);
    if (!shop || shop.status === 'suspended') return res.status(403).json({ error: 'Account band hai' });
    const data = await store.getData(shop.id);
    if (data) {
      // Admin may have changed the shop name / owner / UPI: the account record wins.
      data.profile = { ...data.profile, id: shop.id, name: shop.name, owner: shop.owner, upi_id: shop.upi_id || data.profile.upi_id };
      // Messages the server already sent through WhatsApp show as sent.
      data.scheduled = applySendResults(data.scheduled, await store.listSendResults(shop.id));
    }
    return res.json({ shop: publicShop(shop), data, updated_at: shop.last_sync_at });
  });

  app.put('/api/shop/data', requireRole('shop'), async (req: AuthedRequest, res: Response) => {
    const problem = validateShopData(req.body?.data);
    if (problem) return res.status(400).json({ error: problem });
    const store = await getStore();
    const shop = await store.getShop(req.session!.sub);
    if (!shop || shop.status === 'suspended') return res.status(403).json({ error: 'Account band hai' });

    const data = req.body.data as ShopData;
    // Every record belongs to this shop, whatever the client sent.
    data.profile.id = shop.id;
    for (const list of [data.customers, data.transactions, data.reminders, data.catalog, data.scans, data.leads ?? [], data.templates ?? [], data.scheduled ?? []] as Array<Array<{ shop_id: string }>>) {
      for (const item of list) item.shop_id = shop.id;
    }
    const now = new Date().toISOString();
    await store.saveData(shop.id, data, {
      name: clean(data.profile.name) || shop.name,
      owner: clean(data.profile.owner),
      upi_id: clean(data.profile.upi_id, 260),
      stats: computeShopStats(data),
      last_sync_at: now,
      updated_at: now,
    });
    return res.json({ ok: true, saved_at: now });
  });

  app.post('/api/shop/password', requireRole('shop'), async (req: AuthedRequest, res: Response) => {
    const store = await getStore();
    const shop = await store.getShop(req.session!.sub);
    if (!shop || !verifyPassword(String(req.body?.current ?? ''), shop.password_hash)) {
      return res.status(401).json({ error: 'Purana password galat hai' });
    }
    const pw = passwordProblem(req.body?.next);
    if (pw) return res.status(400).json({ error: pw });
    await store.updateShop(shop.id, { password_hash: hashPassword(req.body.next), updated_at: new Date().toISOString() });
    return res.json({ ok: true });
  });

  /* ------------------------ customer statement link ------------------------ */

  // Public, read-only: one customer sees their own entries and balance. No login, no phone numbers.
  const statementHits = new Map<string, { n: number; until: number }>();
  app.get('/api/statement/:token', async (req: Request, res: Response) => {
    const now = Date.now();
    const hit = statementHits.get(req.ip ?? '');
    if (hit && hit.until > now && ++hit.n > 120) return res.status(429).json({ error: 'Thodi der baad dekhein' });
    if (!hit || hit.until <= now) statementHits.set(req.ip ?? '', { n: 1, until: now + 15 * 60_000 });

    const parsed = parseStatementToken(req.params.token);
    const notFound = () => res.status(404).json({ error: 'Yeh link band hai ya galat hai. Dukaan se naya link maangein.' });
    if (!parsed) return notFound();
    const store = await getStore();
    const shop = await store.getShop(parsed.shopId);
    if (!shop || shop.status === 'suspended') return notFound();
    const data = await store.getData(shop.id);
    const customer = data?.customers.find((c) => c.id === parsed.customerId);
    const key = customer?.statement_key;
    if (!data || !customer || !key || key.length !== parsed.key.length ||
        !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(parsed.key))) {
      return notFound();
    }
    const txs = data.transactions
      .filter((t) => t.customer_id === customer.id && t.type !== 'sale')
      .sort((a, b) => b.confirmed_at.localeCompare(a.confirmed_at));
    const balance = computeBalances(txs, [customer.id]).get(customer.id)?.balance ?? 0;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.json({
      shop: { name: shop.name, upi_id: data.profile.upi_id || shop.upi_id },
      customer: { name: customer.name },
      balance_paise: balance,
      entries: txs.slice(0, 300).map((t) => ({ type: t.type, amount_paise: t.amount_paise, note: t.note, date: t.confirmed_at })),
      total_entries: txs.length,
      generated_at: new Date().toISOString(),
    });
  });

  /* -------------------------------- admin -------------------------------- */

  const admin = requireRole('admin');

  app.get('/api/admin/overview', admin, async (_req: Request, res: Response) => {
    const store = await getStore();
    const shops = await store.listShops();
    const sum = (f: (s: ShopStats) => number) => shops.reduce((a, s) => a + (s.stats ? f(s.stats) : 0), 0);
    const weekAgo = Date.now() - 7 * 86_400_000;
    res.json({
      storage: store.kind,
      storage_persistent: store.persistent,
      shops_total: shops.length,
      shops_active: shops.filter((s) => s.status === 'active').length,
      shops_suspended: shops.filter((s) => s.status === 'suspended').length,
      shops_active_7d: shops.filter((s) => s.stats?.last_activity_at && new Date(s.stats.last_activity_at).getTime() >= weekAgo).length,
      plans: { free: shops.filter((s) => s.plan === 'free').length, basic: shops.filter((s) => s.plan === 'basic').length, pro: shops.filter((s) => s.plan === 'pro').length },
      customers_total: sum((s) => s.customers),
      transactions_total: sum((s) => s.transactions),
      voice_entries_total: sum((s) => s.voice_entries),
      reminders_opened_total: sum((s) => s.reminders_opened),
      shelf_scans_total: sum((s) => s.shelf_scans),
      pending_paise_total: sum((s) => s.pending_paise),
      sales_30d_paise_total: sum((s) => s.sales_30d_paise),
      recovered_30d_paise_total: sum((s) => s.recovered_30d_paise),
    });
  });

  app.get('/api/admin/shops', admin, async (_req: Request, res: Response) => {
    const shops = await (await getStore()).listShops();
    res.json({ shops: shops.map(publicShop) });
  });

  app.post('/api/admin/shops', admin, async (req: Request, res: Response) => {
    const plan = ['free', 'basic', 'pro'].includes(req.body?.plan) ? (req.body.plan as ShopPlan) : 'free';
    const result = await createShopAccount({
      email: clean(req.body?.email, 254),
      password: typeof req.body?.password === 'string' ? req.body.password : '',
      name: clean(req.body?.name),
      owner: clean(req.body?.owner),
      phone: clean(req.body?.phone, 20),
      plan,
    });
    if (!result.shop) return res.status(result.status ?? 400).json({ error: result.error });
    log('admin_create_shop', {});
    res.json({ shop: publicShop(result.shop) });
  });

  app.patch('/api/admin/shops/:id', admin, async (req: Request, res: Response) => {
    const store = await getStore();
    const shop = await store.getShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Vendor nahi mila' });
    const b = req.body ?? {};
    const patch: Partial<ShopRecord> = { updated_at: new Date().toISOString() };
    if (typeof b.name === 'string' && b.name.trim()) patch.name = clean(b.name);
    if (typeof b.owner === 'string') patch.owner = clean(b.owner);
    if (typeof b.phone === 'string') patch.phone = b.phone.replace(/\D/g, '').slice(-10);
    if (typeof b.upi_id === 'string') patch.upi_id = clean(b.upi_id, 260);
    if (typeof b.admin_notes === 'string') patch.admin_notes = clean(b.admin_notes, 1000);
    if (b.status === 'active' || b.status === 'suspended') patch.status = b.status;
    if (['free', 'basic', 'pro'].includes(b.plan)) patch.plan = b.plan;
    if (typeof b.email === 'string' && b.email.trim().toLowerCase() !== shop.email) {
      const email = b.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Sahi email daaliye' });
      if (await store.getShopByEmail(email)) return res.status(409).json({ error: 'Is email se account pehle se hai' });
      patch.email = email;
    }
    const updated = await store.updateShop(shop.id, patch);
    log('admin_update_shop', {});
    res.json({ shop: updated ? publicShop(updated) : null });
  });

  app.post('/api/admin/shops/:id/password', admin, async (req: Request, res: Response) => {
    const pw = passwordProblem(req.body?.password);
    if (pw) return res.status(400).json({ error: pw });
    const store = await getStore();
    if (!(await store.getShop(req.params.id))) return res.status(404).json({ error: 'Vendor nahi mila' });
    await store.updateShop(req.params.id, { password_hash: hashPassword(req.body.password), updated_at: new Date().toISOString() });
    log('admin_reset_password', {});
    res.json({ ok: true });
  });

  app.delete('/api/admin/shops/:id', admin, async (req: Request, res: Response) => {
    const store = await getStore();
    if (!(await store.getShop(req.params.id))) return res.status(404).json({ error: 'Vendor nahi mila' });
    await store.deleteShop(req.params.id);
    log('admin_delete_shop', {});
    res.json({ ok: true });
  });
}
