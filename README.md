# Dukaan Saathi

A WhatsApp-style web app for small Indian kirana shops. The owner records udhaar (credit), payments and sales by
voice or text in Hindi, English or Hinglish, sends UPI payment reminders through WhatsApp, checks shelf gaps
from a photo, and sees a simple daily dashboard.

**Status:** a working prototype following *Dukaan Saathi: App Build Spec* (10 Nov 2026). Phase 1 is done in
code; from Phase 2 there is now email login, per-shop data on the server and an admin dashboard (built on
Express + Postgres instead of the FastAPI the spec suggests, so the existing TypeScript code is reused).
The WhatsApp chat inside the app is a simulation; reminders open real WhatsApp and the owner taps send.

## Logins

| Who | Where | How |
| --- | --- | --- |
| Shop owner (vendor) | `/` | Email + password. Sign up on the login screen, or the admin creates the account. Each shop's khata is saved on the server and only that shop can read it. |
| Platform admin | `/admin` | `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables (never stored in code). Creates, edits, suspends and deletes vendors, resets passwords, sets plans, sees platform totals and AI usage. |
| Demo | `/` → "Bina login demo dekhein" | Sample data in this browser only; AI features are off. |

The admin sees shop-level totals only — never a shop's customer names, phone numbers or per-customer
balances (spec, DPDP section). There is a test for this.

## Run it

```bash
npm install
cp .env.example .env      # optional: add GEMINI_API_KEY for voice notes and shelf photos
npm run dev               # http://localhost:3000
```

Without a Gemini key the app still works: typed entries go through the rule-based parser, and shelf photos
return a clearly marked demo result. Voice notes need the key; without it the browser's own speech
recognition transcript is used when the browser has one.

| Command | What it does |
| --- | --- |
| `npm run dev` | Express server + Vite dev server |
| `npm run build` then `npm start` | Production build served by the same server |
| `npm test` | 81 tests (CRM tags, templates, scheduling and one-time sending, parser, matching, ledger maths, reminders, receipts, credit limit, reminder day, statement links, shelf rules, migration, login, admin privacy, vendor isolation) |
| `npm run eval` | Parser accuracy on the 50 utterances in `eval/utterances.json` |
| `npm run eval:voice -- <folder>` | Accuracy on real recordings (see `eval/README.md`) |
| `npm run lint` | TypeScript check |

## How the spec maps to the code

### Core flows

| Spec | Where | Notes |
| --- | --- | --- |
| Voice udhaar entry, "Sahi hai?" before saving | `src/components/assistant/AssistantChat.tsx` | Every credit, payment or sale shows a card. Only "Haan, sahi hai" saves. "Badlo" lets the owner change customer (fuzzy suggestions first, or a new customer), amount, type and note. Unsure parses open in edit mode, and the save button stays disabled until a customer and amount are set. |
| Hindi number words ("paanch sau" → 500) | `src/lib/hindiNumbers.ts` | sau / hazaar / lakh, dedh, dhai, saade, sawa, paune, Devanagari words and digits, ₹ and "rupaye", "1.5k". Quantities ("2 kilo") and phone numbers are never read as money. Ambiguous words ("do", "saath", "ek") only count before a multiplier. |
| Customer name matching ("Sharma ji" → right record) | `src/lib/customerMatch.ts` | Jaro-Winkler on phonetic keys, Devanagari transliteration, honorifics ignored, relation words ("chachi") weighted. Unknown names are never forced onto a customer; two close matches are flagged as ambiguous. |
| Payment reminder, nothing sent automatically | `src/components/reminders/RemindersScreen.tsx`, `src/lib/reminders.ts` | Message in Hinglish, Hindi or English, three tones, saved as per-shop settings. Opens a prefilled `wa.me` link; the owner taps send in WhatsApp. The log records `link_opened_at`, not "sent". |
| Shelf photo: gaps and low stock, no unit counts | `src/lib/shelf.ts`, `src/components/stock/StockScreen.tsx` | The prompt forbids counts and `sanitizeDetections` strips any count that comes back ("sirf 2 packet bache" → "thoda hi stock"). The catalog stores a status (ok / low / out / unknown), never a number. Scan history, comparison with the previous scan, reorder list, CSV export and WhatsApp order to the supplier. |
| Daily dashboard | `src/components/home/HomeDashboard.tsx`, `src/lib/ledger.ts` | Sales, money pending, money recovered, new udhaar, low-stock items, overdue customers, top products and top customers (7 days), 7-day chart. All numbers come from the same functions over the transaction log. |
| Saathi chat with language toggle | `AssistantChat.tsx`, `Header.tsx` | Also answers balance questions, "kis kis ka baaki hai" and "aaj ka hisaab". |

### Data model (`src/types/index.ts`)

Matches the spec table. Amounts are integer **paise** everywhere (`amount_paise`, `mrp_paise`); rupees only
appear at the edges (input boxes, display, UPI links). Every record has `shop_id`. Customer has
`consent_given_at`; Transaction has `confirmed_at` and `type` credit / payment / sale; Product has `aliases`
and `low_stock_threshold`; ShelfScan has `image_ref` and `detected_items`; Reminder has `link_opened_at`.
Customer balance is derived from the transaction log rather than stored, so it cannot drift.
Data saved by the older prototype (rupee amounts) is migrated once on load (`src/lib/storage.ts`).

### Privacy and consent (DPDP)

| Spec rule | How it is handled |
| --- | --- |
| Consent before storing a phone number, with the date | Add-customer and "+ Number jodein" forms require a consent tick; `consent_given_at` is saved. A phone number without consent is dropped. Consent can be withdrawn (the number is deleted, the khata stays). |
| Tell the shop what the data is for | Onboarding notice and Settings: udhaar tracking and payment reminders only. |
| Export or delete a customer's data | Khata → customer → "Grahak ka data export" (JSON) / "Data delete karein" (customer, transactions and reminders). |
| Balances visible only to the owning shop | Each shop logs in; the API only returns a shop's own data (tested). |
| Admin panel shows aggregates only | `/admin` stores and shows per-shop totals computed on sync; customer lists are never returned to the admin. |
| No names or phone numbers in server logs | The server logs JSON events with sizes, timings and token counts only. Request bodies are never logged. |
| Reminders contain only amount, shop name and UPI link | Templates are fixed code (no AI), with no customer name; a test checks every language and tone. |

Also: phone numbers are never sent to Gemini (only customer ids and names), and the privacy notice says so.
This is a product requirement, not legal advice; get a lawyer to review it before a real pilot.

### AI cost

`server.ts` calls Gemini only for voice notes, shelf photos, the festival planner, and typed text that the
rule-based parser is unsure about. Daily summaries and reminders no longer use AI. Gemini output is
cross-checked: the amount and customer id are re-derived by our own code. `GET /api/usage` shows token use
per voice entry and per shelf photo, and a cost estimate if you set the price env vars (see `.env.example`).

## Trust and collection features

| Feature | Where | How it works |
| --- | --- | --- |
| Customer statement link | Khata → customer → "Grahak ka khata link" | A read-only page (`/s/<token>`) where the customer sees their own entries and balance, with a UPI pay button. Only that customer's data is returned, never phone numbers. The owner can turn the link off or make a new one; old links then stop working. Needs a login (the khata must be on the server). |
| Receipt after each entry | Khata → customer → tick "Har entry ke baad WhatsApp receipt"; then a "Receipt bhejein" button after every saved entry (Khata and chat) | Short WhatsApp message with the entry, the new balance, the shop name and the statement link if there is one. Only for customers with a phone saved with consent who agreed to receipts; the owner taps send. |
| Credit-limit suggestion | Khata → customer → "Udhaar ki seema" | Suggests a limit from the biggest balance the customer built up and fully repaid, scaled by the Bharosa score. The owner sets the real limit; above it the app warns but still lets the owner save. |
| Best reminder day | Reminders | The weekday each customer usually pays on (at least 3 payments and a clear favourite), plus the shop-wide pattern. Customers whose day is today or tomorrow are marked. |
| Offline queue | Everywhere (logged-in shops) | Entries are saved on the phone first. Without signal the header shows "Offline • phone par saved"; changes upload when the network returns (also retried every 30 s and on the next app start). A service worker lets the app open with no signal. Logging out with unsent changes asks for confirmation. |

Logic lives in `src/lib/customerInsights.ts`, `src/lib/statement.ts` and `src/lib/reminders.ts`, with tests in `tests/features.test.ts` and `tests/server.test.ts`.

Limits: offline sync is "last save wins" for the whole khata. If two phones edit the same shop offline at the same time, the later upload replaces the earlier one. One phone per shop is fine.

## Leads CRM (tags, templates, scheduled messages)

Sidebar / bottom bar → **Leads**. For finding new customers and following up with them.

| Step | What the owner does |
| --- | --- |
| Add a lead | "Naya lead": name, WhatsApp number, source, note, tags. A number is saved only with the consent tick ("is vyakti ne message lene ke liye haan kaha hai"). |
| Tag leads | Type tags in the form (Enter or comma), tap "+ tag" on any lead, or select many leads and use "Tag lagayein / Tag hatayein". Tap tags at the top to filter (several tags = leads with all of them). |
| Templates | "Templates" tab: four starter templates, add or edit your own. Placeholders `{name}`, `{shop}`, `{owner}`, `{upi}` are filled per lead, with a live preview. |
| Schedule | Pick one lead ("Schedule") or select many → "Template schedule karein" → choose the template → choose the time (quick picks like "Kal subah 10 baje" or any date and time). One message is created per lead; leads without number/consent are skipped and shown. |
| Sending | **Default (no setup):** at the chosen time the message moves to "Abhi bhejein" (badge on the Leads tab, optional browser notification); one tap opens WhatsApp with the text filled in and the owner taps send. **Automatic:** set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp Cloud API) and the server sends at the time by itself. |
| Track | "Scheduled" tab: due now, upcoming (change time or cancel), history (sent / failed / cancelled). A lead becomes "Baat hui" after the first message goes out; the status can be changed any time. |

Automatic sending, details:

- `npm start` / `npm run dev`: the server checks every minute by itself.
- Vercel: call `GET /api/cron/send-due` every minute with `Authorization: Bearer $CRON_SECRET` (Vercel Cron on a Pro plan, or any external cron service; Hobby plans only allow daily cron jobs).
- WhatsApp only allows free text to people who messaged the shop in the last 24 hours. For everyone else create a template in Meta Business Manager, get it approved, and enter its name and language in the app's template ("WhatsApp approved template"); `{{1}}` in it is filled with the lead's first name.
- Each message is recorded in a separate send log before it is sent, so it is never sent twice (two cron runs, or a phone uploading an older copy). Messages more than 24 hours late are not sent automatically; the owner can send them by hand.
- Logs contain counts only, never names, numbers or message text.

Code: `src/lib/crm.ts` (logic), `src/hooks/useCrm.ts`, `src/components/crm/CrmScreen.tsx`, `src/server/crm.ts` (status, cron, Cloud API), tests in `tests/crm.test.ts`.

## Before making claims (pitch checklist)

- **Voice accuracy is not measured yet.** The 100% figure is on 50 typed utterances written by the developer. Record 50 real voice notes in noisy shops and run `npm run eval:voice` before saying how well voice works.
- **Reminders are not automatic.** Every reminder and receipt opens WhatsApp and the owner taps send. Some competitors send automatically. Automatic sending needs the WhatsApp Cloud API and Meta approval, so say "one-tap reminders", not "automatic reminders".
- **Languages:** Hindi, English and Hinglish only.
- **Competitor features have not been checked first-hand.** Don't claim to be better than Khatabook or OkCredit on a feature without checking it.
- **Not built yet (later):** more Indian languages, GST billing, WhatsApp PDF bills, automatic WhatsApp sending.

## Acceptance criteria

| Criterion | Status |
| --- | --- |
| "Sharma ji ko 500 udhaar" creates a 500 credit only after the owner confirms | ✅ Done; unit test plus browser check |
| Wrong customer name or amount can be corrected before saving | ✅ Done; browser check (₹150 edited to ₹175, ₹175 saved) |
| Reminder opens WhatsApp with amount and UPI link; nothing sent until the owner taps send | ✅ Done; prefilled `wa.me` link, tested |
| Shelf photo flags low or missing items, never exact counts | ✅ Done; prompt rule plus sanitiser plus tests |
| Dashboard totals match the transaction log for the same date range | ✅ Done; property test over 20 random logs |
| Admin panel shows no names, phones or individual balances | ✅ Done; `/admin` shows shop-level totals only, checked by an end-to-end test |
| Voice accuracy measured on 50 real noisy recordings, as a percentage | ⏳ Harness ready (`npm run eval:voice`); needs real recordings |

Parser accuracy on the 50-utterance set is 100%. Those utterances were written while building the parser, so
treat the figure as a regression baseline, not field accuracy (see `eval/README.md`).

## Build phases

1. **Harden the prototype** — done in code: number parsing, fuzzy matching, 50-utterance eval, paise data
   model, consent, deterministic reminders, count-free shelf results. Still to do: test with real shopkeepers
   and run the real-recording voice eval.
2. **Backend** — done in a first version: Express API (`src/server/`), Postgres or JSON-file storage,
   email login, per-shop data, AI calls on the server behind login. Not done: Google login, a Hindi
   speech-to-text provider (still Gemini), choosing final hosting.
3. **WhatsApp Cloud API** — not started (needs a backend and Meta approval).
4. **Reminders** — templates, per-shop settings and manual send are done; automatic sending waits for
   Phase 3 and the owner's approval.
5. **Shelf scanner and reorder** — history, comparison and reorder export exist in the prototype.
6. **Dashboard and admin** — dashboard with Aaj / 7 / 30 din / Sab filter, top products and customers,
   repayment speed; admin dashboard with vendor management and platform totals. Not built: trends, slow
   products, supplier spend.

Not in scope (spec): in-app payments, GST invoicing, multi-shop chains, exact inventory counts, automatic
WhatsApp sending before Cloud API approval. Open questions: pricing, speech-to-text provider, database and
hosting, data retention, competitor features (not checked).

## Deploy on Vercel

The API runs as one Vercel function (`api/index.ts`, routed by `vercel.json`); the React app is the static build.

1. **Database:** Vercel → your project → Storage → create a **Neon** (Postgres) database and connect it.
   This sets `DATABASE_URL`. The table is created automatically on first use.
2. **Environment variables** (Project → Settings → Environment Variables), then redeploy:
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — your admin login for `/admin`
   - `SESSION_SECRET` — a long random string
   - `GEMINI_API_KEY` — needed for voice notes and shelf photos
3. Open `https://<your-site>/admin`, log in, and create vendors (or let shops sign up).

Without `DATABASE_URL` the API still runs but stores data in `/tmp`, which Vercel wipes; the admin dashboard
shows a warning. Without `GEMINI_API_KEY` shelf photos show a clear error instead of fake results.

Locally: `cp .env.example .env`, fill in the values, `npm run dev`. Data goes to `./data/` (git-ignored)
unless `DATABASE_URL` is set.
