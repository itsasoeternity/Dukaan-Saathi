/**
 * Server storage for vendor accounts and each shop's synced khata.
 *
 * - DATABASE_URL set  -> Postgres (works with Neon / Supabase / Vercel Postgres). Use this on Vercel.
 * - otherwise         -> a JSON file in DATA_DIR (default ./data). Fine for local use and a single Node server.
 *   On Vercel without DATABASE_URL the file lives in /tmp and is lost on every cold start.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SendResult, ShopData, ShopRecord } from './types';

export interface Store {
  kind: 'postgres' | 'file';
  persistent: boolean;
  listShops(): Promise<ShopRecord[]>;
  getShop(id: string): Promise<ShopRecord | null>;
  getShopByEmail(email: string): Promise<ShopRecord | null>;
  createShop(r: ShopRecord): Promise<void>;
  updateShop(id: string, patch: Partial<ShopRecord>): Promise<ShopRecord | null>;
  deleteShop(id: string): Promise<void>;
  getData(id: string): Promise<ShopData | null>;
  saveData(id: string, data: ShopData, patch: Partial<ShopRecord>): Promise<void>;
  /**
   * CRM send log. claimSend atomically records that the server is about to send a message and returns
   * false if it was already claimed, so a message is never sent twice (two cron runs, or a phone that
   * uploads an older copy still marked "scheduled").
   */
  claimSend(shopId: string, msgId: string): Promise<boolean>;
  setSendResult(shopId: string, result: SendResult): Promise<void>;
  listSendResults(shopId: string): Promise<SendResult[]>;
}

/* ------------------------------ JSON file ------------------------------ */

interface FileShape {
  shops: Record<string, ShopRecord>;
  data: Record<string, ShopData>;
  sent?: Record<string, Record<string, SendResult>>;
}

class FileStore implements Store {
  kind = 'file' as const;
  persistent: boolean;
  private file: string;
  private cache: FileShape | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(dir: string, persistent: boolean) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'dukaan-saathi.json');
    this.persistent = persistent;
  }

  private load(): FileShape {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8')) as FileShape;
    } catch {
      this.cache = { shops: {}, data: {} };
    }
    return this.cache;
  }

  /** Serialise writes and write atomically (temp file + rename). */
  private write(mutate: (s: FileShape) => void): Promise<void> {
    const run = async () => {
      const s = this.load();
      mutate(s);
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(s));
      await fs.promises.rename(tmp, this.file);
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  async listShops() {
    return Object.values(this.load().shops).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async getShop(id: string) {
    return this.load().shops[id] ?? null;
  }
  async getShopByEmail(email: string) {
    const e = email.trim().toLowerCase();
    return Object.values(this.load().shops).find((s) => s.email === e) ?? null;
  }
  async createShop(r: ShopRecord) {
    await this.write((s) => {
      s.shops[r.id] = r;
    });
  }
  async updateShop(id: string, patch: Partial<ShopRecord>) {
    let out: ShopRecord | null = null;
    await this.write((s) => {
      if (!s.shops[id]) return;
      s.shops[id] = { ...s.shops[id], ...patch, id };
      out = s.shops[id];
    });
    return out;
  }
  async deleteShop(id: string) {
    await this.write((s) => {
      delete s.shops[id];
      delete s.data[id];
      delete s.sent?.[id];
    });
  }
  async getData(id: string) {
    return this.load().data[id] ?? null;
  }
  async saveData(id: string, data: ShopData, patch: Partial<ShopRecord>) {
    await this.write((s) => {
      if (!s.shops[id]) return;
      s.data[id] = data;
      s.shops[id] = { ...s.shops[id], ...patch, id };
    });
  }
  async claimSend(shopId: string, msgId: string) {
    let claimed = false;
    await this.write((s) => {
      s.sent ??= {};
      s.sent[shopId] ??= {};
      if (s.sent[shopId][msgId]) return;
      s.sent[shopId][msgId] = { id: msgId, status: 'sending', sent_via: 'api' };
      claimed = true;
    });
    return claimed;
  }
  async setSendResult(shopId: string, result: SendResult) {
    await this.write((s) => {
      s.sent ??= {};
      s.sent[shopId] ??= {};
      s.sent[shopId][result.id] = result;
    });
  }
  async listSendResults(shopId: string) {
    return Object.values(this.load().sent?.[shopId] ?? {});
  }
}

/* ------------------------------ Postgres ------------------------------- */

type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

const COLUMNS = [
  'id', 'email', 'password_hash', 'name', 'owner', 'phone', 'upi_id', 'status', 'plan', 'admin_notes',
  'created_at', 'updated_at', 'last_sync_at', 'stats',
] as const;

function rowToShop(r: Record<string, unknown>): ShopRecord {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  return {
    id: String(r.id),
    email: String(r.email),
    password_hash: String(r.password_hash),
    name: String(r.name ?? ''),
    owner: String(r.owner ?? ''),
    phone: String(r.phone ?? ''),
    upi_id: String(r.upi_id ?? ''),
    status: r.status === 'suspended' ? 'suspended' : 'active',
    plan: (['free', 'basic', 'pro'].includes(String(r.plan)) ? r.plan : 'free') as ShopRecord['plan'],
    admin_notes: String(r.admin_notes ?? ''),
    created_at: iso(r.created_at) ?? new Date().toISOString(),
    updated_at: iso(r.updated_at) ?? new Date().toISOString(),
    last_sync_at: iso(r.last_sync_at),
    stats: (r.stats as ShopRecord['stats']) ?? null,
  };
}

class PgStore implements Store {
  kind = 'postgres' as const;
  persistent = true;
  private ready: Promise<void>;

  constructor(private pool: PgPool) {
    this.ready = this.pool
      .query(`
        CREATE TABLE IF NOT EXISTS ds_shops (
          id text PRIMARY KEY,
          email text UNIQUE NOT NULL,
          password_hash text NOT NULL,
          name text NOT NULL DEFAULT '',
          owner text NOT NULL DEFAULT '',
          phone text NOT NULL DEFAULT '',
          upi_id text NOT NULL DEFAULT '',
          status text NOT NULL DEFAULT 'active',
          plan text NOT NULL DEFAULT 'free',
          admin_notes text NOT NULL DEFAULT '',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          last_sync_at timestamptz,
          stats jsonb,
          data jsonb
        )`)
      .then(() =>
        this.pool.query(`
          CREATE TABLE IF NOT EXISTS ds_crm_sent (
            shop_id text NOT NULL REFERENCES ds_shops(id) ON DELETE CASCADE,
            msg_id text NOT NULL,
            result jsonb NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (shop_id, msg_id)
          )`),
      )
      .then(() => undefined);
  }

  private async q(sql: string, params: unknown[] = []) {
    await this.ready;
    return (await this.pool.query(sql, params)).rows;
  }

  async listShops() {
    const rows = await this.q(`SELECT ${COLUMNS.join(',')} FROM ds_shops ORDER BY created_at DESC`);
    return rows.map(rowToShop);
  }
  async getShop(id: string) {
    const rows = await this.q(`SELECT ${COLUMNS.join(',')} FROM ds_shops WHERE id = $1`, [id]);
    return rows[0] ? rowToShop(rows[0]) : null;
  }
  async getShopByEmail(email: string) {
    const rows = await this.q(`SELECT ${COLUMNS.join(',')} FROM ds_shops WHERE email = $1`, [email.trim().toLowerCase()]);
    return rows[0] ? rowToShop(rows[0]) : null;
  }
  async createShop(r: ShopRecord) {
    const values = COLUMNS.map((c) => (c === 'stats' ? JSON.stringify(r.stats) : r[c]));
    await this.q(
      `INSERT INTO ds_shops (${COLUMNS.join(',')}) VALUES (${COLUMNS.map((_, i) => `$${i + 1}`).join(',')})`,
      values,
    );
  }
  private patchSql(patch: Partial<ShopRecord>, start: number) {
    const keys = (Object.keys(patch) as Array<keyof ShopRecord>).filter((k) => k !== 'id' && (COLUMNS as readonly string[]).includes(k));
    return {
      sets: keys.map((k, i) => `${k} = $${start + i}`),
      values: keys.map((k) => (k === 'stats' ? JSON.stringify(patch[k]) : patch[k])),
    };
  }
  async updateShop(id: string, patch: Partial<ShopRecord>) {
    const { sets, values } = this.patchSql(patch, 2);
    if (sets.length) await this.q(`UPDATE ds_shops SET ${sets.join(', ')} WHERE id = $1`, [id, ...values]);
    return this.getShop(id);
  }
  async deleteShop(id: string) {
    await this.q('DELETE FROM ds_shops WHERE id = $1', [id]);
  }
  async getData(id: string) {
    const rows = await this.q('SELECT data FROM ds_shops WHERE id = $1', [id]);
    return (rows[0]?.data as ShopData | undefined) ?? null;
  }
  async saveData(id: string, data: ShopData, patch: Partial<ShopRecord>) {
    const { sets, values } = this.patchSql(patch, 3);
    await this.q(`UPDATE ds_shops SET data = $2${sets.length ? ', ' + sets.join(', ') : ''} WHERE id = $1`, [id, JSON.stringify(data), ...values]);
  }
  async claimSend(shopId: string, msgId: string) {
    const rows = await this.q(
      `INSERT INTO ds_crm_sent (shop_id, msg_id, result) VALUES ($1, $2, $3)
       ON CONFLICT (shop_id, msg_id) DO NOTHING RETURNING msg_id`,
      [shopId, msgId, JSON.stringify({ id: msgId, status: 'sending', sent_via: 'api' })],
    );
    return rows.length === 1;
  }
  async setSendResult(shopId: string, result: SendResult) {
    await this.q(
      `INSERT INTO ds_crm_sent (shop_id, msg_id, result) VALUES ($1, $2, $3)
       ON CONFLICT (shop_id, msg_id) DO UPDATE SET result = EXCLUDED.result, updated_at = now()`,
      [shopId, result.id, JSON.stringify(result)],
    );
  }
  async listSendResults(shopId: string) {
    const rows = await this.q('SELECT result FROM ds_crm_sent WHERE shop_id = $1', [shopId]);
    return rows.map((r) => r.result as SendResult);
  }
}

/* ------------------------------- factory ------------------------------- */

let store: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  if (store) return store;
  store = (async () => {
    const url = process.env.DATABASE_URL;
    if (url) {
      const pg = await import('pg');
      const Pool = (pg.default ?? pg).Pool;
      const needsSsl = !/localhost|127\.0\.0\.1/.test(url) && !/sslmode=disable/.test(url);
      const pool = new Pool({ connectionString: url, max: 3, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
      return new PgStore(pool as unknown as PgPool);
    }
    const onVercel = Boolean(process.env.VERCEL);
    const dir = process.env.DATA_DIR || (onVercel ? '/tmp/dukaan-saathi' : path.join(process.cwd(), 'data'));
    return new FileStore(dir, !onVercel);
  })();
  return store;
}
