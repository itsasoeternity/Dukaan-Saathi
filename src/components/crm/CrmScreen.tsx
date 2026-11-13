import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  CalendarClock,
  Check,
  CheckCircle2,
  FileText,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Tag,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Lead, LeadStatus, MessageTemplate, ScheduledMessage, ShopProfile } from '../../types';
import {
  allTags,
  canMessage,
  filterByTags,
  LEAD_STATUS_LABEL,
  LEAD_STATUSES,
  normalizeTags,
  PLACEHOLDERS,
  quickTimes,
  renderTemplate,
  toLocalInput,
  upcomingMessages,
} from '../../lib/crm';
import { createWhatsAppUrl } from '../../lib/reminders';
import type { NewLead, useCrm } from '../../hooks/useCrm';

type Crm = ReturnType<typeof useCrm>;

interface CrmScreenProps {
  profile: ShopProfile;
  crm: Crm;
}

type Section = 'leads' | 'templates' | 'scheduled';

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: 'bg-sky-100 text-sky-800',
  contacted: 'bg-amber-100 text-amber-800',
  interested: 'bg-violet-100 text-violet-800',
  converted: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-gray-200 text-gray-600',
};

const TAG_COLORS = [
  'bg-emerald-50 text-emerald-800 border-emerald-200',
  'bg-indigo-50 text-indigo-800 border-indigo-200',
  'bg-amber-50 text-amber-900 border-amber-200',
  'bg-rose-50 text-rose-800 border-rose-200',
  'bg-cyan-50 text-cyan-800 border-cyan-200',
  'bg-purple-50 text-purple-800 border-purple-200',
];
function tagColor(tag: string) {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

const card = 'bg-white rounded-3xl border border-emerald-100 shadow-xs';
const input =
  'w-full px-3 py-2.5 rounded-xl border border-emerald-100 bg-[#F8FCFA] text-sm text-[#123D31] focus:outline-none focus:ring-2 focus:ring-[#25D366]/40';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-[#0B3D2E] font-extrabold text-xs shadow-xs active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none';
const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-100 bg-white hover:bg-emerald-50 text-[#123D31] font-bold text-xs transition-all disabled:opacity-40 disabled:pointer-events-none';

export const CrmScreen: React.FC<CrmScreenProps> = ({ profile, crm }) => {
  const [section, setSection] = useState<Section>('leads');
  const [scheduleFor, setScheduleFor] = useState<string[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Notify the owner when a message becomes due while the app is open (manual-send mode only).
  const lastDue = useRef(crm.due.length);
  useEffect(() => {
    if (!crm.autoSend && crm.due.length > lastDue.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Dukaan Saathi', { body: `${crm.due.length} message bhejne ka time ho gaya`, icon: '/icon.svg' });
      } catch {
        // some browsers only allow notifications from a service worker
      }
    }
    lastDue.current = crm.due.length;
  }, [crm.due.length, crm.autoSend]);

  const upcoming = useMemo(() => upcomingMessages(crm.scheduled, crm.now), [crm.scheduled, crm.now]);

  const tabs: Array<{ id: Section; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'leads', label: 'Leads', icon: Users, badge: crm.leads.length },
    { id: 'templates', label: 'Templates', icon: FileText, badge: crm.templates.length },
    { id: 'scheduled', label: 'Scheduled', icon: CalendarClock, badge: crm.due.length + upcoming.length },
  ];

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-24 lg:pb-12">
      {/* Banner */}
      <div className="bg-gradient-to-r from-[#0B3D2E] to-[#1F7A5C] text-white p-5 rounded-3xl shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-[#25D366]" />
          <h2 className="text-xl font-black tracking-tight">Leads CRM</h2>
        </div>
        <p className="text-xs text-emerald-200 leading-relaxed">
          Naye grahak (leads) jodein, unhe tag dein, template chunein aur time set karein — message usi time par jayega.
        </p>
        <p className="mt-2 text-[11px] font-bold flex items-center gap-1.5">
          {crm.autoSend ? (
            <>
              <Zap className="w-3.5 h-3.5 text-[#25D366]" />
              <span className="text-[#25D366]">Auto-send chalu: server time par WhatsApp se khud bhejega.</span>
            </>
          ) : (
            <>
              <AlarmClock className="w-3.5 h-3.5 text-[#F5A623]" />
              <span className="text-amber-200">
                Time hone par message "Abhi bhejein" mein aayega; ek tap mein WhatsApp khulega aur aap send dabayenge.
              </span>
            </>
          )}
        </p>
      </div>

      {/* Due now banner (visible from every section) */}
      {crm.due.length > 0 && section !== 'scheduled' && (
        <button
          onClick={() => setSection('scheduled')}
          className="w-full p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 flex items-center justify-between text-left"
        >
          <span className="text-sm font-extrabold text-amber-900 flex items-center gap-2">
            <AlarmClock className="w-5 h-5" />
            {crm.due.length} message bhejne ka time ho gaya
          </span>
          <span className="text-xs font-bold text-amber-800">{crm.autoSend ? 'Dekhein' : 'Abhi bhejein →'}</span>
        </button>
      )}

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = section === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap transition-all ${
                active ? 'bg-[#0B3D2E] text-white shadow-sm' : 'bg-white text-[#5F7A6E] border border-emerald-100 hover:bg-emerald-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {Boolean(t.badge) && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-[#25D366] text-[#0B3D2E]' : 'bg-emerald-50 text-emerald-800'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {section === 'leads' && <LeadsSection crm={crm} onSchedule={setScheduleFor} onToast={setToast} />}
      {section === 'templates' && <TemplatesSection crm={crm} profile={profile} />}
      {section === 'scheduled' && <ScheduledSection crm={crm} profile={profile} upcoming={upcoming} />}

      {scheduleFor && (
        <ScheduleModal
          crm={crm}
          profile={profile}
          leadIds={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onDone={(msg) => {
            setScheduleFor(null);
            setToast(msg);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl bg-[#0B3D2E] text-white text-sm font-bold shadow-lg flex items-center gap-2 max-w-[90vw]">
          <CheckCircle2 className="w-4 h-4 text-[#25D366] shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
};

/* ================================== Leads ================================== */

function TagChip({ tag, onRemove, active, onClick }: { tag: string; onRemove?: () => void; active?: boolean; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${
        active ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]' : tagColor(tag)
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      #{tag}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-60 hover:opacity-100"
          aria-label={`Remove tag ${tag}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/** Text box that adds tags on Enter or comma, with suggestions from tags already in use. */
function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (tags: string[]) => void; suggestions: string[] }) {
  const [draft, setDraft] = useState('');
  const commit = (text = draft) => {
    const next = normalizeTags([...value, ...normalizeTags(text)]);
    onChange(next);
    setDraft('');
  };
  const open = suggestions.filter((s) => !value.includes(s) && (!draft || s.includes(draft.toLowerCase()))).slice(0, 8);
  return (
    <div>
      <div className={`${input} flex flex-wrap gap-1.5 items-center`}>
        {value.map((t) => (
          <TagChip key={t} tag={t} onRemove={() => onChange(value.filter((x) => x !== t))} />
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',')) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft && commit()}
          placeholder={value.length ? '' : 'jaise: vip, diwali, home delivery'}
          className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm"
        />
      </div>
      {open.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {open.map((s) => (
            <button key={s} type="button" onClick={() => commit(s)} className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-dashed border-emerald-300 text-emerald-800 hover:bg-emerald-50">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadForm({ crm, onClose, onSaved }: { crm: Crm; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const [form, setForm] = useState<{ name: string; phone: string; consent: boolean; tags: string[]; source: string; note: string }>({
    name: '',
    phone: '',
    consent: false,
    tags: [],
    source: '',
    note: '',
  });
  const suggestions = useMemo(() => allTags(crm.leads).map((t) => t.tag), [crm.leads]);
  const digits = form.phone.replace(/\D/g, '');
  const phoneBad = digits.length > 0 && !canMessage({ phone: digits, consent_given_at: 'x' });
  const valid = form.name.trim() && !phoneBad && (!digits || form.consent);

  const save = () => {
    if (!valid) return;
    const data: NewLead = {
      name: form.name,
      phone: digits,
      consent_given_at: digits && form.consent ? new Date().toISOString() : null,
      tags: form.tags,
      source: form.source,
      note: form.note,
    };
    onSaved(crm.addLead(data));
  };

  return (
    <div className={`${card} p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-[#123D31] flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#1F7A5C]" /> Naya lead
        </h3>
        <button onClick={onClose} className="text-[#5F7A6E] hover:text-[#123D31]" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-bold text-[#5F7A6E]">Naam *</span>
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-[#5F7A6E]">WhatsApp number</span>
          <input className={input} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98XXXXXXXX" />
          {phoneBad && <span className="text-[11px] text-rose-600 font-bold">10 ank ka mobile number daaliye</span>}
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-[#5F7A6E]">Kahan se aaya (source)</span>
          <input className={input} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Walk-in, pamphlet, referral..." />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-[#5F7A6E]">Note</span>
          <input className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
      </div>
      <div>
        <span className="text-[11px] font-bold text-[#5F7A6E] flex items-center gap-1">
          <Tag className="w-3 h-3" /> Tags (Enter ya comma se jodein)
        </span>
        <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} suggestions={suggestions} />
      </div>
      {digits && (
        <label className="flex items-start gap-2 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 cursor-pointer">
          <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5 accent-[#1F7A5C]" />
          <span className="text-xs text-[#123D31]">
            <ShieldCheck className="w-3.5 h-3.5 inline text-[#1F7A5C] mr-1" />
            Is vyakti ne number save karne aur dukaan se WhatsApp message lene ke liye <b>haan</b> kaha hai.
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={btnGhost}>
          Cancel
        </button>
        <button onClick={save} disabled={!valid} className={btnPrimary}>
          <Check className="w-4 h-4" /> Lead save karein
        </button>
      </div>
    </div>
  );
}

function LeadsSection({ crm, onSchedule, onToast }: { crm: Crm; onSchedule: (ids: string[]) => void; onToast: (m: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkTag, setBulkTag] = useState('');
  const [tagging, setTagging] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');

  const tags = useMemo(() => allTags(crm.leads), [crm.leads]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filterByTags(crm.leads, tagFilter).filter(
      (l) =>
        (statusFilter === 'all' || l.status === statusFilter) &&
        (!q || l.name.toLowerCase().includes(q) || l.phone.includes(q) || l.note.toLowerCase().includes(q)),
    );
  }, [crm.leads, tagFilter, statusFilter, query]);

  const scheduledCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of crm.scheduled) if (s.status === 'scheduled') m.set(s.lead_id, (m.get(s.lead_id) ?? 0) + 1);
    return m;
  }, [crm.scheduled]);

  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.includes(l.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="space-y-4">
      {adding ? (
        <LeadForm
          crm={crm}
          onClose={() => setAdding(false)}
          onSaved={(lead) => {
            setAdding(false);
            onToast(`${lead.name} jod diya gaya`);
          }}
        />
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#5F7A6E] absolute left-3 top-1/2 -translate-y-1/2" />
            <input className={`${input} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Naam, number ya note search karein..." />
          </div>
          <select className={`${input} sm:w-44`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}>
            <option value="all">Sab status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button onClick={() => setAdding(true)} className={btnPrimary}>
            <Plus className="w-4 h-4" /> Naya lead
          </button>
        </div>
      )}

      {/* Tag filter */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-[#5F7A6E] mr-1">Tag se chhantein:</span>
          {tags.map(({ tag, count }) => (
            <TagChip
              key={tag}
              tag={`${tag} (${count})`}
              active={tagFilter.includes(tag)}
              onClick={() => setTagFilter((f) => (f.includes(tag) ? f.filter((x) => x !== tag) : [...f, tag]))}
            />
          ))}
          {tagFilter.length > 0 && (
            <button onClick={() => setTagFilter([])} className="text-[11px] font-bold text-rose-600 ml-1">
              Filter hatayein
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="sticky top-16 z-20 p-3 rounded-2xl bg-[#DDF3E7] border border-emerald-300 flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-[#0B3D2E]">{selected.length} chune gaye</span>
          <button onClick={() => onSchedule(selected)} className={btnPrimary}>
            <CalendarClock className="w-4 h-4" /> Template schedule karein
          </button>
          <div className="flex items-center gap-1">
            <input
              className="px-2 py-1.5 rounded-lg border border-emerald-200 text-xs w-32 bg-white"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              placeholder="tag likhein"
            />
            <button
              className={btnGhost}
              disabled={!normalizeTags(bulkTag).length}
              onClick={() => {
                crm.tagLeads(selected, normalizeTags(bulkTag));
                onToast(`${selected.length} leads ko tag laga diya`);
                setBulkTag('');
              }}
            >
              <Tag className="w-3.5 h-3.5" /> Tag lagayein
            </button>
            <button
              className={btnGhost}
              disabled={!normalizeTags(bulkTag).length}
              onClick={() => {
                crm.tagLeads(selected, [], normalizeTags(bulkTag));
                setBulkTag('');
              }}
            >
              Tag hatayein
            </button>
          </div>
          <button onClick={() => setSelected([])} className="text-xs font-bold text-[#5F7A6E] ml-auto">
            Chunav hatayein
          </button>
        </div>
      )}

      {/* List */}
      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-emerald-50 bg-[#F8FCFA]">
          <input
            type="checkbox"
            className="accent-[#1F7A5C]"
            checked={allVisibleSelected}
            onChange={() =>
              setSelected((s) => (allVisibleSelected ? s.filter((id) => !visible.some((l) => l.id === id)) : [...new Set([...s, ...visible.map((l) => l.id)])]))
            }
            aria-label="Select all"
          />
          <span className="text-xs font-bold text-[#5F7A6E]">
            {visible.length} leads {tagFilter.length > 0 && `• ${tagFilter.map((t) => '#' + t).join(' + ')}`}
          </span>
        </div>

        {visible.length === 0 && (
          <div className="p-10 text-center text-sm text-[#5F7A6E]">
            {crm.leads.length === 0 ? 'Abhi koi lead nahi. "Naya lead" dabakar pehla lead jodein.' : 'Is filter mein koi lead nahi.'}
          </div>
        )}

        <ul className="divide-y divide-emerald-50">
          {visible.map((lead) => {
            const ok = canMessage(lead);
            const pending = scheduledCount.get(lead.id) ?? 0;
            return (
              <li key={lead.id} className="px-4 py-3 flex gap-3 items-start">
                <input type="checkbox" className="mt-1 accent-[#1F7A5C]" checked={selected.includes(lead.id)} onChange={() => toggle(lead.id)} aria-label={`Select ${lead.name}`} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-[#123D31]">{lead.name}</span>
                    <select
                      value={lead.status}
                      onChange={(e) => crm.updateLead(lead.id, { status: e.target.value as LeadStatus })}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-0 ${STATUS_STYLE[lead.status]}`}
                    >
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {LEAD_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    {pending > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" /> {pending} scheduled
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#5F7A6E]">
                    {ok ? `+91 ${lead.phone}` : <span className="text-rose-600 font-bold">Number/consent nahi — message nahi ja sakta</span>}
                    {lead.source && ` • ${lead.source}`}
                    {lead.note && ` • ${lead.note}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lead.tags.map((t) => (
                      <TagChip key={t} tag={t} onRemove={() => crm.updateLead(lead.id, { tags: lead.tags.filter((x) => x !== t) })} />
                    ))}
                    {tagging === lead.id ? (
                      <input
                        autoFocus
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            crm.updateLead(lead.id, { tags: [...lead.tags, ...normalizeTags(tagDraft)] });
                            setTagDraft('');
                            setTagging(null);
                          } else if (e.key === 'Escape') setTagging(null);
                        }}
                        onBlur={() => {
                          if (tagDraft.trim()) crm.updateLead(lead.id, { tags: [...lead.tags, ...normalizeTags(tagDraft)] });
                          setTagDraft('');
                          setTagging(null);
                        }}
                        list="crm-tag-list"
                        placeholder="tag + Enter"
                        className="px-2 py-0.5 rounded-full border border-emerald-300 text-[11px] w-28 outline-none"
                      />
                    ) : (
                      <button onClick={() => setTagging(lead.id)} className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-dashed border-emerald-300 text-emerald-800 hover:bg-emerald-50">
                        + tag
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                  <button onClick={() => onSchedule([lead.id])} disabled={!ok} className={btnGhost} title={ok ? 'Message schedule karein' : 'Pehle number aur consent jodein'}>
                    <Send className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Schedule</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`${lead.name} ko mita dein? Iske scheduled message bhi hat jayenge.`)) crm.deleteLead(lead.id);
                    }}
                    className={`${btnGhost} text-rose-600`}
                    aria-label="Delete lead"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <datalist id="crm-tag-list">
          {tags.map((t) => (
            <option key={t.tag} value={t.tag} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

/* ================================ Templates ================================ */

function TemplatesSection({ crm, profile }: { crm: Crm; profile: ShopProfile }) {
  const [editing, setEditing] = useState<Partial<MessageTemplate> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const sampleName = crm.leads[0]?.name ?? 'Neha';
  const preview = (body: string) => renderTemplate(body, { name: sampleName, shop: profile.name, owner: profile.owner, upi: profile.upi_id });

  const insert = (ph: string) => {
    if (!editing) return;
    const el = bodyRef.current;
    const body = editing.body ?? '';
    const at = el ? el.selectionStart : body.length;
    setEditing({ ...editing, body: body.slice(0, at) + ph + body.slice(at) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + ph.length, at + ph.length);
    });
  };

  const inUse = (id: string) => crm.scheduled.filter((m) => m.template_id === id && m.status === 'scheduled').length;

  return (
    <div className="space-y-4">
      {editing ? (
        <div className={`${card} p-5 space-y-3`}>
          <h3 className="text-sm font-extrabold text-[#123D31]">{editing.id ? 'Template badlein' : 'Naya template'}</h3>
          <label className="block">
            <span className="text-[11px] font-bold text-[#5F7A6E]">Template ka naam *</span>
            <input className={input} value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="jaise: Diwali offer" />
          </label>
          <div>
            <span className="text-[11px] font-bold text-[#5F7A6E]">Message *</span>
            <textarea ref={bodyRef} rows={5} maxLength={2000} className={input} value={editing.body ?? ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-[11px] text-[#5F7A6E]">Jodein:</span>
              {PLACEHOLDERS.map((p) => (
                <button key={p} type="button" onClick={() => insert(p)} className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {p}
                </button>
              ))}
            </div>
          </div>
          {editing.body && (
            <div className="p-3 rounded-2xl bg-[#E7FFDB] border border-[#c8f0b4]">
              <span className="text-[10px] font-bold text-[#1F7A5C] block mb-1">Preview ({sampleName} ke liye)</span>
              <p className="text-sm text-[#123D31] whitespace-pre-wrap">{preview(editing.body)}</p>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer font-bold text-[#5F7A6E]">Auto-send ke liye: WhatsApp approved template (optional)</summary>
            <p className="text-[11px] text-[#5F7A6E] mt-2">
              WhatsApp Business API se khud bhejne par, jo log 24 ghante mein aapko message nahi kar chuke, unhe sirf Meta se approved template hi ja sakta hai.
              Us template ka naam aur bhasha code yahan likhein; {'{{1}}'} mein lead ka naam bhara jayega.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input className={input} value={editing.wa_template_name ?? ''} onChange={(e) => setEditing({ ...editing, wa_template_name: e.target.value })} placeholder="template_name" />
              <input className={input} value={editing.wa_language ?? ''} onChange={(e) => setEditing({ ...editing, wa_language: e.target.value })} placeholder="hi / en" />
            </div>
          </details>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className={btnGhost}>
              Cancel
            </button>
            <button
              disabled={!editing.name?.trim() || !editing.body?.trim()}
              onClick={() => {
                crm.saveTemplate({
                  id: editing.id,
                  name: editing.name!,
                  body: editing.body!,
                  wa_template_name: editing.wa_template_name,
                  wa_language: editing.wa_language,
                });
                setEditing(null);
              }}
              className={btnPrimary}
            >
              <Check className="w-4 h-4" /> Save
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing({ name: '', body: 'Namaste {name} ji, ' })} className={btnPrimary}>
          <Plus className="w-4 h-4" /> Naya template
        </button>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {crm.templates.map((t) => (
          <div key={t.id} className={`${card} p-4 flex flex-col gap-2`}>
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold text-[#123D31] truncate">{t.name}</h4>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setEditing(t)} className={btnGhost} aria-label="Edit template">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const n = inUse(t.id);
                    if (confirm(n ? `Is template ke ${n} scheduled message cancel ho jayenge. Mitayein?` : 'Template mitayein?')) crm.deleteTemplate(t.id);
                  }}
                  className={`${btnGhost} text-rose-600`}
                  aria-label="Delete template"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p className="text-xs text-[#5F7A6E] whitespace-pre-wrap line-clamp-4">{preview(t.body)}</p>
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {t.wa_template_name && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">WA: {t.wa_template_name}</span>}
              {inUse(t.id) > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{inUse(t.id)} scheduled</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== Schedule modal ============================== */

function ScheduleModal({
  crm,
  profile,
  leadIds,
  onClose,
  onDone,
}: {
  crm: Crm;
  profile: ShopProfile;
  leadIds: string[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const leads = crm.leads.filter((l) => leadIds.includes(l.id));
  const reachable = leads.filter(canMessage);
  const [templateId, setTemplateId] = useState(crm.templates[0]?.id ?? '');
  const quick = useMemo(() => quickTimes(), []);
  const [when, setWhen] = useState(() => toLocalInput(quick[0]?.at ?? new Date(Date.now() + 3600_000)));
  const sendAt = new Date(when);
  const timeValid = !Number.isNaN(sendAt.getTime());
  const isPast = timeValid && sendAt.getTime() < Date.now() - 60_000;
  const tpl = crm.templates.find((t) => t.id === templateId);
  const sample = reachable[0] ?? leads[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-[#123D31] flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#1F7A5C]" /> Message schedule karein
          </h3>
          <button onClick={onClose} aria-label="Close">
            <X className="w-5 h-5 text-[#5F7A6E]" />
          </button>
        </div>

        {/* Recipients */}
        <div className="p-3 rounded-2xl bg-[#F8FCFA] border border-emerald-100 text-xs">
          <b className="text-[#123D31]">
            {reachable.length} {reachable.length === 1 ? 'lead' : 'leads'} ko jayega
          </b>
          <span className="text-[#5F7A6E]">: {reachable.slice(0, 4).map((l) => l.name).join(', ')}{reachable.length > 4 ? ` +${reachable.length - 4}` : ''}</span>
          {leads.length > reachable.length && (
            <p className="text-rose-600 font-bold mt-1">{leads.length - reachable.length} ke paas number/consent nahi hai, unhe nahi jayega.</p>
          )}
        </div>

        {/* 1. Template */}
        <div>
          <span className="text-xs font-extrabold text-[#123D31] block mb-2">1. Template chunein</span>
          {crm.templates.length === 0 ? (
            <p className="text-xs text-rose-600">Pehle Templates mein ek template banayein.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {crm.templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`text-left p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    templateId === t.id ? 'bg-[#DDF3E7] border-emerald-400 ring-1 ring-emerald-300 text-[#0B3D2E]' : 'bg-white border-emerald-100 text-[#5F7A6E] hover:bg-emerald-50'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {tpl && sample && (
            <div className="mt-2 p-3 rounded-2xl bg-[#E7FFDB] border border-[#c8f0b4]">
              <span className="text-[10px] font-bold text-[#1F7A5C] block mb-1">{sample.name} ko aisa dikhega</span>
              <p className="text-sm text-[#123D31] whitespace-pre-wrap">
                {renderTemplate(tpl.body, { name: sample.name, shop: profile.name, owner: profile.owner, upi: profile.upi_id })}
              </p>
            </div>
          )}
        </div>

        {/* 2. Time */}
        <div>
          <span className="text-xs font-extrabold text-[#123D31] block mb-2">2. Kab bhejna hai</span>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {quick.map((q) => (
              <button
                key={q.label}
                onClick={() => setWhen(toLocalInput(q.at))}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-full border ${
                  when === toLocalInput(q.at) ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]' : 'bg-white text-[#123D31] border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <input type="datetime-local" className={input} value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
          {timeValid && <p className="text-[11px] text-[#5F7A6E] mt-1">{formatWhen(sendAt.toISOString())}</p>}
          {isPast && <p className="text-[11px] text-amber-700 font-bold mt-1">Yeh time nikal chuka hai — message turant "Abhi bhejein" mein aa jayega.</p>}
        </div>

        <button
          disabled={!tpl || !timeValid || reachable.length === 0}
          onClick={() => {
            const r = crm.schedule(reachable.map((l) => l.id), templateId, sendAt);
            onDone(
              r.created
                ? `${r.created} message ${formatWhen(sendAt.toISOString())} ke liye schedule ho gaye${r.skipped ? ` (${r.skipped} pehle se the)` : ''}`
                : 'Yeh message pehle se schedule hai',
            );
          }}
          className={`${btnPrimary} w-full py-3 text-sm`}
        >
          <CalendarClock className="w-4 h-4" /> Schedule karein
        </button>
      </div>
    </div>
  );
}

/* ================================ Scheduled ================================ */

function ScheduledSection({ crm, profile, upcoming }: { crm: Crm; profile: ShopProfile; upcoming: ScheduledMessage[] }) {
  const [editing, setEditing] = useState<{ id: string; when: string } | null>(null);
  const leadName = (id: string) => crm.leads.find((l) => l.id === id)?.name ?? '(lead mita diya)';
  const tplName = (id: string) => crm.templates.find((t) => t.id === id)?.name ?? '(template mita diya)';
  const history = useMemo(
    () =>
      crm.scheduled
        .filter((m) => m.status !== 'scheduled')
        .sort((a, b) => (b.sent_at ?? b.send_at).localeCompare(a.sent_at ?? a.send_at))
        .slice(0, 50),
    [crm.scheduled],
  );
  const notifSupported = typeof Notification !== 'undefined';
  const [notif, setNotif] = useState(notifSupported ? Notification.permission : 'denied');

  const sendNow = (m: ScheduledMessage) => {
    const lead = crm.leads.find((l) => l.id === m.lead_id);
    if (!lead) return;
    const text = crm.messageText(m, profile);
    const url = createWhatsAppUrl(lead.phone, text);
    if (!url) return;
    window.open(url, '_blank', 'noopener');
    crm.markSentByLink(m.id, text);
  };

  const Row = ({ m, children }: { m: ScheduledMessage; children?: React.ReactNode }) => (
    <li className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-[#123D31] truncate">
          {leadName(m.lead_id)} <span className="text-[#5F7A6E] font-bold">• {tplName(m.template_id)}</span>
        </p>
        <p className="text-[11px] text-[#5F7A6E]">
          {formatWhen(m.send_at)}
          {m.status === 'sent' && m.sent_at && ` • bheja ${formatWhen(m.sent_at)} (${m.sent_via === 'api' ? 'auto' : 'WhatsApp se'})`}
          {m.error && <span className="text-rose-600 font-bold"> • {m.error}</span>}
        </p>
      </div>
      {children && <div className="flex flex-wrap gap-1.5 shrink-0">{children}</div>}
    </li>
  );

  return (
    <div className="space-y-5">
      {!crm.autoSend && notifSupported && notif === 'default' && (
        <button onClick={() => Notification.requestPermission().then(setNotif)} className={btnGhost}>
          <AlarmClock className="w-4 h-4" /> Time hone par notification chalu karein
        </button>
      )}

      {/* Due now */}
      <div className={`${card} overflow-hidden`}>
        <h3 className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-amber-900 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <AlarmClock className="w-4 h-4" /> Abhi bhejein ({crm.due.length})
        </h3>
        {crm.due.length === 0 ? (
          <p className="p-5 text-xs text-[#5F7A6E]">Abhi koi message baaki nahi.</p>
        ) : (
          <ul className="divide-y divide-emerald-50">
            {crm.due.map((m) => (
              <Row key={m.id} m={m}>
                {crm.autoSend && crm.now.getTime() - new Date(m.send_at).getTime() < 10 * 60_000 ? (
                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> Server bhej raha hai...
                  </span>
                ) : (
                  <button onClick={() => sendNow(m)} className={btnPrimary}>
                    <Send className="w-3.5 h-3.5" /> WhatsApp kholein
                  </button>
                )}
                <button onClick={() => crm.cancelScheduled(m.id)} className={btnGhost}>
                  Cancel
                </button>
              </Row>
            ))}
          </ul>
        )}
      </div>

      {/* Upcoming */}
      <div className={`${card} overflow-hidden`}>
        <h3 className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-[#123D31] bg-[#F8FCFA] border-b border-emerald-50 flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[#1F7A5C]" /> Aane wale ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <p className="p-5 text-xs text-[#5F7A6E]">Koi message schedule nahi. Leads mein se chunkar "Schedule" dabayein.</p>
        ) : (
          <ul className="divide-y divide-emerald-50">
            {upcoming.map((m) => (
              <Row key={m.id} m={m}>
                {editing?.id === m.id ? (
                  <>
                    <input type="datetime-local" className="px-2 py-1.5 rounded-lg border border-emerald-200 text-xs" value={editing.when} onChange={(e) => setEditing({ id: m.id, when: e.target.value })} />
                    <button
                      className={btnPrimary}
                      onClick={() => {
                        const d = new Date(editing.when);
                        if (!Number.isNaN(d.getTime())) crm.reschedule(m.id, d);
                        setEditing(null);
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditing({ id: m.id, when: toLocalInput(new Date(m.send_at)) })} className={btnGhost}>
                    <Pencil className="w-3.5 h-3.5" /> Time badlein
                  </button>
                )}
                <button onClick={() => crm.cancelScheduled(m.id)} className={btnGhost}>
                  Cancel
                </button>
              </Row>
            ))}
          </ul>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className={`${card} overflow-hidden`}>
          <h3 className="px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-[#5F7A6E] border-b border-emerald-50">History</h3>
          <ul className="divide-y divide-emerald-50">
            {history.map((m) => (
              <Row key={m.id} m={m}>
                {m.status === 'sent' && (
                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Bheja
                  </span>
                )}
                {m.status === 'cancelled' && <span className="text-[11px] font-bold text-gray-500">Cancelled</span>}
                {m.status === 'failed' && (
                  <>
                    <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> Nahi gaya
                    </span>
                    <button onClick={() => sendNow(m)} className={btnGhost}>
                      <Send className="w-3.5 h-3.5" /> Khud bhejein
                    </button>
                  </>
                )}
              </Row>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
