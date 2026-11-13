import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lead, MessageTemplate, ScheduledMessage } from '../types';
import { KEYS, newId, safeGet, safeSet } from '../lib/storage';
import { defaultTemplates, dueMessages, normalizeTags, pickResult, planSchedule, renderTemplate } from '../lib/crm';
import { initialLeads } from '../utils/seedData';

export type NewLead = Pick<Lead, 'name' | 'phone' | 'tags' | 'source' | 'note' | 'consent_given_at'>;

interface ServerStatus {
  auto_send: boolean;
  results: Array<Pick<ScheduledMessage, 'id' | 'status' | 'sent_via' | 'sent_at' | 'text' | 'error'>>;
}

/**
 * Leads, templates and scheduled messages, kept in the browser and synced with the rest of the shop data.
 * In a logged-in shop it also asks the server every minute whether automatic WhatsApp sending is on and
 * which scheduled messages the server has already sent.
 */
export function useCrm(shopId: string, mode: 'shop' | 'demo') {
  const [leads, setLeads] = useState<Lead[]>(() => safeGet(KEYS.LEADS, mode === 'demo' ? initialLeads : []));
  const [templates, setTemplates] = useState<MessageTemplate[]>(
    () => safeGet<MessageTemplate[] | null>(KEYS.TEMPLATES, null) ?? defaultTemplates(shopId),
  );
  const [scheduled, setScheduled] = useState<ScheduledMessage[]>(() => safeGet(KEYS.SCHEDULED, []));
  const scheduledRef = useRef(scheduled);
  scheduledRef.current = scheduled;
  const [autoSend, setAutoSend] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => safeSet(KEYS.LEADS, leads), [leads]);
  useEffect(() => safeSet(KEYS.TEMPLATES, templates), [templates]);
  useEffect(() => safeSet(KEYS.SCHEDULED, scheduled), [scheduled]);

  // Tick every 30 s so messages move into "due" on time while the app is open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Logged-in shops: pick up what the server sent automatically.
  useEffect(() => {
    if (mode !== 'shop') return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/crm/status', { credentials: 'same-origin' });
        if (!res.ok) return;
        const body = (await res.json()) as ServerStatus;
        if (stop) return;
        setAutoSend(Boolean(body.auto_send));
        if (body.results?.length) {
          const byId = new Map(body.results.map((r) => [r.id, r]));
          const pending = scheduledRef.current.filter((m) => m.status === 'scheduled' && byId.has(m.id));
          if (!pending.length) return;
          const pendingIds = new Set(pending.map((m) => m.id));
          const sentLeadIds = new Set(pending.filter((m) => byId.get(m.id)!.status === 'sent').map((m) => m.lead_id));
          setScheduled((prev) =>
            prev.map((m) => (pendingIds.has(m.id) && m.status === 'scheduled' ? { ...m, ...pickResult(byId.get(m.id) as ScheduledMessage) } : m)),
          );
          if (sentLeadIds.size) {
            setLeads((prev) => prev.map((l) => (sentLeadIds.has(l.id) && l.status === 'new' ? { ...l, status: 'contacted' } : l)));
          }
        }
      } catch {
        // offline: try again next minute
      }
    };
    poll();
    const id = window.setInterval(poll, 60_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [mode]);

  const due = useMemo(() => dueMessages(scheduled, now), [scheduled, now]);

  /* -------------------------------- leads -------------------------------- */

  const addLead = useCallback(
    (data: NewLead) => {
      const phone = data.phone.replace(/\D/g, '').slice(-10);
      const lead: Lead = {
        id: newId('lead'),
        shop_id: shopId,
        name: data.name.trim(),
        // Same rule as customers: no number without consent.
        phone: data.consent_given_at ? phone : '',
        consent_given_at: phone && data.consent_given_at ? data.consent_given_at : null,
        tags: normalizeTags(data.tags),
        status: 'new',
        source: data.source.trim(),
        note: data.note.trim(),
        created_at: new Date().toISOString(),
      };
      setLeads((prev) => [lead, ...prev]);
      return lead;
    },
    [shopId],
  );

  const updateLead = useCallback((id: string, updates: Partial<Omit<Lead, 'id' | 'shop_id' | 'created_at'>>) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...updates };
        if (updates.tags) next.tags = normalizeTags(updates.tags);
        if (updates.phone !== undefined) next.phone = updates.phone.replace(/\D/g, '').slice(-10);
        if (!next.consent_given_at) next.phone = '';
        return next;
      }),
    );
    // Consent withdrawn: nothing more may be sent to this lead.
    if (updates.consent_given_at === null) {
      setScheduled((prev) => prev.map((m) => (m.lead_id === id && m.status === 'scheduled' ? { ...m, status: 'cancelled' } : m)));
    }
  }, []);

  /** Add tags to (or remove tags from) many leads at once. */
  const tagLeads = useCallback((ids: string[], add: string[], remove: string[] = []) => {
    const a = normalizeTags(add);
    const r = normalizeTags(remove);
    setLeads((prev) =>
      prev.map((l) => (ids.includes(l.id) ? { ...l, tags: normalizeTags([...l.tags.filter((t) => !r.includes(t)), ...a]) } : l)),
    );
  }, []);

  const deleteLead = useCallback((id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setScheduled((prev) => prev.filter((m) => m.lead_id !== id));
  }, []);

  /* ------------------------------ templates ------------------------------ */

  const saveTemplate = useCallback(
    (t: Pick<MessageTemplate, 'name' | 'body' | 'wa_template_name' | 'wa_language'> & { id?: string }) => {
      const clean = {
        name: t.name.trim(),
        body: t.body.trim(),
        wa_template_name: t.wa_template_name?.trim() || undefined,
        wa_language: t.wa_language?.trim() || undefined,
      };
      if (t.id) {
        setTemplates((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...clean } : x)));
        return t.id;
      }
      const id = newId('tpl');
      setTemplates((prev) => [...prev, { id, shop_id: shopId, created_at: new Date().toISOString(), ...clean }]);
      return id;
    },
    [shopId],
  );

  const deleteTemplate = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setScheduled((prev) => prev.map((m) => (m.template_id === id && m.status === 'scheduled' ? { ...m, status: 'cancelled' } : m)));
  }, []);

  /* ------------------------------ scheduling ------------------------------ */

  const schedule = useCallback(
    (leadIds: string[], templateId: string, sendAt: Date) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template) return { created: 0, skipped: leadIds.length };
      const plan = planSchedule({
        leads: leads.filter((l) => leadIds.includes(l.id)),
        template,
        sendAt,
        existing: scheduled,
        shopId,
        makeId: () => newId('msg'),
      });
      if (plan.created.length) setScheduled((prev) => [...prev, ...plan.created]);
      return { created: plan.created.length, skipped: plan.skipped.length };
    },
    [templates, leads, scheduled, shopId],
  );

  const cancelScheduled = useCallback((id: string) => {
    setScheduled((prev) => prev.map((m) => (m.id === id && m.status === 'scheduled' ? { ...m, status: 'cancelled' } : m)));
  }, []);

  const reschedule = useCallback((id: string, sendAt: Date) => {
    setScheduled((prev) =>
      prev.map((m) =>
        m.id === id && (m.status === 'scheduled' || m.status === 'failed')
          ? { ...m, status: 'scheduled', send_at: sendAt.toISOString(), error: undefined }
          : m,
      ),
    );
  }, []);

  /** Text for a scheduled message, filled for its lead. */
  const messageText = useCallback(
    (m: ScheduledMessage, shop: { name: string; owner: string; upi_id: string }) => {
      const lead = leads.find((l) => l.id === m.lead_id);
      const tpl = templates.find((t) => t.id === m.template_id);
      if (!lead || !tpl) return m.text ?? '';
      return renderTemplate(tpl.body, { name: lead.name, shop: shop.name, owner: shop.owner, upi: shop.upi_id });
    },
    [leads, templates],
  );

  /** The owner opened WhatsApp for this message and tapped send. */
  const markSentByLink = useCallback(
    (id: string, text: string) => {
      const sentAt = new Date().toISOString();
      const leadId = scheduled.find((m) => m.id === id)?.lead_id;
      setScheduled((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'sent', sent_via: 'link', sent_at: sentAt, text, error: undefined } : m)),
      );
      if (leadId) setLeads((prev) => prev.map((l) => (l.id === leadId && l.status === 'new' ? { ...l, status: 'contacted' } : l)));
    },
    [scheduled],
  );

  const resetCrmToDemo = useCallback(() => {
    setLeads(initialLeads);
    setTemplates(defaultTemplates(shopId));
    setScheduled([]);
  }, [shopId]);

  return {
    leads,
    templates,
    scheduled,
    due,
    now,
    autoSend,
    addLead,
    updateLead,
    tagLeads,
    deleteLead,
    saveTemplate,
    deleteTemplate,
    schedule,
    cancelScheduled,
    reschedule,
    messageText,
    markSentByLink,
    resetCrmToDemo,
  };
}
