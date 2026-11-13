/**
 * The Dukaan Saathi API as an Express app. Used by server.ts (local / Node host) and api/index.ts (Vercel).
 *
 * - Keeps the Gemini API key on the server; AI endpoints need a logged-in user.
 * - Typed text is parsed by the deterministic parser first; Gemini is only called for voice notes,
 *   shelf photos, or when the rule-based parse is unsure. This keeps the running cost per shop low.
 * - Gemini output is cross-checked: amounts and customer ids are re-derived by our own code.
 * - Privacy: only customer ids and names go to the model, never phone numbers; logs never contain
 *   names, phone numbers, transcripts or amounts.
 */
import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { parseKhataText, KhataIntent, ParsedKhata } from '../lib/khataParser.js';
import { matchCustomer } from '../lib/customerMatch.js';
import { extractAmount } from '../lib/hindiNumbers.js';
import { rupeesToPaise } from '../lib/money.js';
import { confirmationText, ReplyLanguage } from '../lib/replies.js';
import { sanitizeDetections, stripUnitCounts } from '../lib/shelf.js';
import { adminConfigured, requireLogin, requireRole } from './auth.js';
import { registerAccountRoutes } from './accounts.js';
import { registerCrmRoutes } from './crm.js';
import { getStore } from './store.js';

dotenv.config();

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const INPUT_USD_PER_M = Number(process.env.GEMINI_INPUT_USD_PER_MTOK || 0);
const OUTPUT_USD_PER_M = Number(process.env.GEMINI_OUTPUT_USD_PER_MTOK || 0);

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '4mb' }));

const apiKey = process.env.GEMINI_API_KEY || '';
// A hard timeout so a slow model never leaves the shopkeeper staring at a spinner.
const ai = apiKey && apiKey !== 'MY_GEMINI_API_KEY' ? new GoogleGenAI({ apiKey, httpOptions: { timeout: 25_000 } }) : null;

/* ------------------------------------------------------------------ */
/* Logging without personal data                                       */
/* ------------------------------------------------------------------ */

function log(event: string, fields: Record<string, string | number | boolean | null> = {}) {
  // Only event names, sizes, durations and token counts. Never request bodies.
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

function errorKind(err: unknown): string {
  if (err && typeof err === 'object' && 'status' in err) return `status_${(err as { status: unknown }).status}`;
  return err instanceof Error ? err.name : 'unknown';
}

/* ------------------------------------------------------------------ */
/* Cost tracking                                                       */
/* ------------------------------------------------------------------ */

type UsageKind = 'voice_entry' | 'text_entry' | 'shelf_photo' | 'festival_plan';
const usage: Record<UsageKind, { calls: number; inputTokens: number; outputTokens: number; ruleOnly: number }> = {
  voice_entry: { calls: 0, inputTokens: 0, outputTokens: 0, ruleOnly: 0 },
  text_entry: { calls: 0, inputTokens: 0, outputTokens: 0, ruleOnly: 0 },
  shelf_photo: { calls: 0, inputTokens: 0, outputTokens: 0, ruleOnly: 0 },
  festival_plan: { calls: 0, inputTokens: 0, outputTokens: 0, ruleOnly: 0 },
};

function recordUsage(kind: UsageKind, meta: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined, ms: number) {
  const u = usage[kind];
  const input = meta?.promptTokenCount ?? 0;
  const output = (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
  u.calls++;
  u.inputTokens += input;
  u.outputTokens += output;
  log('gemini_call', { kind, model: MODEL, input_tokens: input, output_tokens: output, ms });
}

app.get('/api/usage', requireRole('admin'), (_req: Request, res: Response) => {
  const out = Object.fromEntries(
    Object.entries(usage).map(([kind, u]) => {
      const avgIn = u.calls ? u.inputTokens / u.calls : 0;
      const avgOut = u.calls ? u.outputTokens / u.calls : 0;
      const priced = INPUT_USD_PER_M > 0 || OUTPUT_USD_PER_M > 0;
      return [
        kind,
        {
          gemini_calls: u.calls,
          handled_without_ai: u.ruleOnly,
          avg_input_tokens: Math.round(avgIn),
          avg_output_tokens: Math.round(avgOut),
          est_usd_per_call: priced ? +((avgIn * INPUT_USD_PER_M + avgOut * OUTPUT_USD_PER_M) / 1e6).toFixed(6) : null,
        },
      ];
    }),
  );
  res.json({
    model: MODEL,
    pricing_configured: INPUT_USD_PER_M > 0 || OUTPUT_USD_PER_M > 0,
    note: 'Counts since server start. Set GEMINI_INPUT_USD_PER_MTOK / GEMINI_OUTPUT_USD_PER_MTOK to get cost estimates.',
    usage: out,
  });
});

app.get('/api/health', async (_req: Request, res: Response) => {
  const store = await getStore().catch(() => null);
  res.json({
    status: 'ok',
    ai: Boolean(ai),
    storage: store ? store.kind : 'error',
    storage_persistent: store?.persistent ?? false,
    admin_configured: adminConfigured(),
    timestamp: new Date().toISOString(),
  });
});

registerAccountRoutes(app);
registerCrmRoutes(app);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface CustomerRef {
  id: string;
  name: string;
}

/** Accept only id + name from the client and cap the list size. Phones are dropped here. */
function customerRefs(input: unknown): CustomerRef[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({ id: String(c.id ?? ''), name: String(c.name ?? '').slice(0, 80) }))
    .filter((c) => c.id && c.name)
    .slice(0, 2000);
}

function lang(input: unknown): ReplyLanguage {
  return input === 'hindi' || input === 'english' ? input : 'hinglish';
}

const INTENTS: KhataIntent[] = ['add_credit', 'add_payment', 'add_sale', 'query_balance', 'list_overdue', 'add_customer', 'summary', 'unknown'];

/**
 * Merge a Gemini parse with the deterministic parse of the same transcript.
 * Our code decides the amount (Hindi number words) and the customer id (fuzzy match against the real list).
 */
function reconcile(transcript: string, gemini: Record<string, unknown>, customers: CustomerRef[]): ParsedKhata {
  const rule = parseKhataText(transcript, customers);
  const geminiIntent = INTENTS.includes(gemini.intent as KhataIntent) ? (gemini.intent as KhataIntent) : 'unknown';
  const intent = rule.intent !== 'unknown' && rule.confidence >= 0.85 ? rule.intent : geminiIntent !== 'unknown' ? geminiIntent : rule.intent;

  const ruleAmount = extractAmount(transcript);
  const geminiAmount = typeof gemini.amount === 'number' && gemini.amount > 0 ? rupeesToPaise(gemini.amount) : null;
  const amount_paise = ruleAmount ? rupeesToPaise(ruleAmount.value) : geminiAmount;

  let matched_customer_id = rule.matched_customer_id;
  let candidates = rule.candidate_customer_ids;
  if (!matched_customer_id && typeof gemini.customer_name === 'string' && gemini.customer_name) {
    const m = matchCustomer(gemini.customer_name, customers);
    if (m.best) matched_customer_id = m.best.customer.id;
    if (m.candidates.length) candidates = m.candidates.map((c) => c.customer.id);
  }
  const needsCustomer = intent === 'add_credit' || intent === 'add_payment' || intent === 'query_balance';
  const matched = customers.find((c) => c.id === matched_customer_id) ?? null;
  const spoken = matched?.name ?? (typeof gemini.customer_name === 'string' && gemini.customer_name ? gemini.customer_name : rule.customer_name);

  let question: string | null = null;
  if (intent === 'unknown') question = rule.clarification_question;
  else if ((intent === 'add_credit' || intent === 'add_payment' || intent === 'add_sale') && amount_paise === null) question = 'Kitne rupaye? Rashi dobara boliye.';
  else if (needsCustomer && !matched) {
    const first = customers.find((c) => c.id === candidates[0]);
    question = first ? `Kya aapka matlab ${first.name} hai?` : `"${spoken}" naam ka grahak nahi mila. Naya grahak banayein ya list se chunein.`;
  }

  const geminiConfidence = typeof gemini.confidence === 'number' ? gemini.confidence : 0.7;
  return {
    transcript,
    intent,
    customer_name: spoken,
    matched_customer_id: needsCustomer ? matched?.id ?? null : null,
    candidate_customer_ids: candidates,
    amount_paise,
    items_note: rule.items_note ?? (typeof gemini.items_note === 'string' ? gemini.items_note : null),
    confidence: Math.round(Math.min(geminiConfidence, needsCustomer && !matched ? 0.5 : 1) * 100) / 100,
    needs_clarification: question !== null,
    clarification_question: question,
  };
}

function withReply(p: ParsedKhata, customers: CustomerRef[], language: ReplyLanguage, isDemo: boolean) {
  const name = customers.find((c) => c.id === p.matched_customer_id)?.name ?? null;
  return { ...p, bot_reply_text: confirmationText(p, name, language), isDemo };
}

/* ------------------------------------------------------------------ */
/* 1. Voice / text khata entry                                         */
/* ------------------------------------------------------------------ */

app.post('/api/gemini/parse-khata', requireLogin, async (req: Request, res: Response) => {
  const started = Date.now();
  const { text, audioBase64, audioMimeType } = req.body ?? {};
  const customers = customerRefs(req.body?.customers);
  const language = lang(req.body?.language);
  const typed = typeof text === 'string' ? text.slice(0, 500) : '';

  if (!typed && !audioBase64) return res.status(400).json({ error: 'text or audioBase64 required' });

  // Typed text, or the browser's live transcript of a voice note: rule-based first. If that is confident
  // we answer instantly and skip Gemini (fast and free); Gemini only handles the unclear cases.
  const rule = typed ? parseKhataText(typed, customers) : null;
  // Known intent + amount is enough: an unclear customer name is fixed on the confirm card, not by the AI.
  const money = rule && (rule.intent === 'add_credit' || rule.intent === 'add_payment' || rule.intent === 'add_sale');
  const ruleIsConfident = rule && rule.intent !== 'unknown' && (!money || rule.amount_paise !== null);
  if (!ai || (rule && ruleIsConfident)) {
    if (rule) {
      usage[audioBase64 ? 'voice_entry' : 'text_entry'].ruleOnly++;
      log('parse_rule_only', { has_audio: Boolean(audioBase64), ms: Date.now() - started });
      return res.json(withReply(rule, customers, language, !ai));
    }
    return res.json(withReply(parseKhataText('', customers), customers, language, true));
  }

  const kind: UsageKind = audioBase64 ? 'voice_entry' : 'text_entry';
  try {
    const customerList = customers.map((c) => `${c.id}: ${c.name}`).join('\n') || 'None';
    const systemInstruction = `You parse Indian kirana shopkeeper voice notes and messages about udhaar (credit), payments and sales.
Speech may be Hindi, English or Hinglish, noisy, with fillers.
Examples:
- "Sharma ji ko 500 udhaar, saman ka" -> add_credit, customer "Sharma ji", amount 500, note "saman"
- "Gupta ji ne 300 diye" -> add_payment, customer "Gupta ji", amount 300
- "aaj 2000 ki bikri hui" -> add_sale, amount 2000
- "Verma ji ka kitna baaki hai?" -> query_balance
- "Kis kis ka udhaar baaki hai?" -> list_overdue
Hindi numbers: sau=100, hazaar=1000, dedh sau=150, dhai sau=250, saade teen sau=350, paune do sau=175.
Pick the customer from this list (id: name) when the spoken name clearly refers to one; otherwise leave matched_customer_id empty:
${customerList}
Write the transcript exactly as spoken (Latin or Devanagari script). Do not invent amounts.`;

    const parts: Array<Record<string, unknown>> = audioBase64
      ? [
          { inlineData: { mimeType: typeof audioMimeType === 'string' ? audioMimeType : 'audio/webm', data: String(audioBase64) } },
          { text: 'Transcribe this voice note, then extract the ledger entry.' },
        ]
      : [{ text: `Message: ${typed}` }];

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: { parts },
      config: {
        httpOptions: { timeout: 15_000 },
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            intent: { type: Type.STRING, enum: INTENTS },
            customer_name: { type: Type.STRING },
            matched_customer_id: { type: Type.STRING, nullable: true },
            amount: { type: Type.NUMBER, nullable: true },
            items_note: { type: Type.STRING, nullable: true },
            confidence: { type: Type.NUMBER },
          },
          required: ['transcript', 'intent', 'confidence'],
        },
      },
    });
    recordUsage(kind, response.usageMetadata, Date.now() - started);

    const gemini = JSON.parse(response.text || '{}') as Record<string, unknown>;
    const transcript = typeof gemini.transcript === 'string' && gemini.transcript ? gemini.transcript : typed;
    return res.json(withReply(reconcile(transcript, gemini, customers), customers, language, false));
  } catch (err) {
    log('gemini_error', { kind, error: errorKind(err), ms: Date.now() - started });
    const fallback = parseKhataText(typed, customers);
    return res.json(withReply(fallback, customers, language, true));
  }
});

/* ------------------------------------------------------------------ */
/* 2. Shelf photo: gaps and low stock, never unit counts                */
/* ------------------------------------------------------------------ */

app.post('/api/gemini/analyze-shelf', requireLogin, async (req: Request, res: Response) => {
  const started = Date.now();
  const { imageBase64, imageMimeType = 'image/jpeg', previousScanSummary } = req.body ?? {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

  const catalog = Array.isArray(req.body?.catalog)
    ? (req.body.catalog as Array<Record<string, unknown>>).slice(0, 300).map((p) => ({
        id: String(p.id ?? ''),
        name: String(p.name ?? ''),
        aliases: Array.isArray(p.aliases) ? p.aliases.map(String).slice(0, 5) : [],
      }))
    : [];

  if (!ai) {
    return res.status(503).json({ error: 'AI_NOT_CONFIGURED', message: 'Shelf photo ke liye server par GEMINI_API_KEY set karein.' });
  }

  try {
    const catalogList = catalog.map((p) => `${p.id}: ${p.name}${p.aliases.length ? ` (${p.aliases.join(', ')})` : ''}`).join('\n');
    const systemInstruction = `You inspect photos of Indian kirana shop shelves.
RULE: report shelf gaps and low stock from how full each facing looks. NEVER state a number of units, packets or pieces.
Use status: "out" = empty gap where the product belongs, "low" = sparse facing, "ok" = full facing, "unknown" = cannot tell.
Notes must describe space ("right half of the row is empty"), not counts.
Match products to this catalog (id: name) when you can, else matched_sku = null:
${catalogList || 'No catalog provided'}
Previous scan summary: ${typeof previousScanSummary === 'string' ? stripUnitCounts(previousScanSummary.slice(0, 500)) : 'none'}.
Set image_quality_warning if the photo is dark, blurry or badly angled.`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType: String(imageMimeType), data: String(imageBase64) } },
          { text: 'Find gaps and low stock on this shelf.' },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            image_quality_warning: { type: Type.STRING, nullable: true },
            overall_notes: { type: Type.STRING },
            products: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  matched_sku: { type: Type.STRING, nullable: true },
                  status: { type: Type.STRING, enum: ['ok', 'low', 'out', 'unknown'] },
                  confidence: { type: Type.NUMBER },
                  note: { type: Type.STRING },
                  box_2d: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                },
                required: ['name', 'status', 'confidence', 'note'],
              },
            },
          },
          required: ['overall_notes', 'products'],
        },
      },
    });
    recordUsage('shelf_photo', response.usageMetadata, Date.now() - started);

    const result = JSON.parse(response.text || '{}') as Record<string, unknown>;
    const validSkus = new Set(catalog.map((p) => p.id));
    const products = sanitizeDetections(result.products).map((p) => ({
      ...p,
      matched_sku: p.matched_sku && validSkus.has(p.matched_sku) ? p.matched_sku : null,
    }));
    return res.json({
      image_quality_warning: typeof result.image_quality_warning === 'string' ? stripUnitCounts(result.image_quality_warning) : null,
      overall_notes: stripUnitCounts(String(result.overall_notes ?? '')),
      products,
      isDemo: false,
    });
  } catch (err) {
    log('gemini_error', { kind: 'shelf_photo', error: errorKind(err), ms: Date.now() - started });
    return res.status(502).json({ error: 'AI_FAILED', message: 'Photo analyse nahi ho payi. Thodi der baad dobara koshish karein.' });
  }
});

/* ------------------------------------------------------------------ */
/* 3. Festival stock planner (no customer data involved)               */
/* ------------------------------------------------------------------ */

app.post('/api/gemini/festival-stock', requireLogin, async (req: Request, res: Response) => {
  const started = Date.now();
  const festival = typeof req.body?.festival === 'string' ? req.body.festival.slice(0, 40) : 'Diwali';
  if (!ai) return res.json(demoFestivalStock(festival));

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Suggest 8 kirana grocery items an Indian neighbourhood shop should stock up on before ${festival}.
For each: why demand rises, an approximate demand change (e.g. "+70%") and a suggested extra order size. Be realistic.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            festival: { type: Type.STRING },
            summary: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  demandSurge: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  recommendedQty: { type: Type.STRING },
                },
                required: ['name', 'category', 'demandSurge', 'reason'],
              },
            },
          },
          required: ['festival', 'summary', 'items'],
        },
      },
    });
    recordUsage('festival_plan', response.usageMetadata, Date.now() - started);
    return res.json({ ...JSON.parse(response.text || '{}'), isDemo: false });
  } catch (err) {
    log('gemini_error', { kind: 'festival_plan', error: errorKind(err), ms: Date.now() - started });
    return res.json(demoFestivalStock(festival));
  }
});

/* ------------------------------------------------------------------ */
/* Demo data used when no API key is configured                         */
/* ------------------------------------------------------------------ */

function demoFestivalStock(festival: string) {
  const items: Record<string, Array<Record<string, string>>> = {
    Diwali: [
      { name: 'Mustard / Refined Oil', category: 'Cooking Oil', demandSurge: '+100%', reason: 'Festive frying and sweets', recommendedQty: '2x usual order' },
      { name: 'Sugar 5kg', category: 'Staples', demandSurge: '+90%', reason: 'Home sweet making', recommendedQty: '2x usual order' },
      { name: 'Ghee 1L', category: 'Dairy', demandSurge: '+120%', reason: 'Diyas, prasad and sweets', recommendedQty: '2x usual order' },
      { name: 'Atta 10kg', category: 'Flour', demandSurge: '+50%', reason: 'Puri and guests', recommendedQty: '1.5x usual order' },
      { name: 'Soan Papdi / gift sweets', category: 'Sweets', demandSurge: '+200%', reason: 'Gifting', recommendedQty: 'Small trial stock' },
      { name: 'Dry fruits', category: 'Dry Fruits', demandSurge: '+150%', reason: 'Gifting and sweets', recommendedQty: 'Small trial stock' },
      { name: 'Tea 500g', category: 'Beverages', demandSurge: '+40%', reason: 'Guests at home', recommendedQty: '1.5x usual order' },
      { name: 'Garam masala & spices', category: 'Spices', demandSurge: '+60%', reason: 'Festive cooking', recommendedQty: '1.5x usual order' },
    ],
  };
  return {
    festival,
    summary: '',
    items: items[festival] ?? items.Diwali,
    isDemo: true,
  };
}

/* ------------------------------------------------------------------ */

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  log('request_error', { error: errorKind(err) });
  res.status(400).json({ error: 'Bad request' });
});


export default app;
