import type { Lead, LeadStageHistoryRecord, LeadStageTransition } from '../types';

export const LEAD_ACTIVE_STAGES = [
  'Lead Identified',
  'Contact Made',
  'Key Person Identified',
  'Intro Email Sent',
  'Meetings Ongoing',
] as const;

export const LEAD_TERMINAL_STAGES = ['Converted to deal', 'Lost'] as const;
export const LEAD_LIFECYCLE_STAGES = [...LEAD_ACTIVE_STAGES, ...LEAD_TERMINAL_STAGES] as const;

export type LeadLifecycleStage = (typeof LEAD_LIFECYCLE_STAGES)[number];

export function isLeadLifecycleStage(stage: string): stage is LeadLifecycleStage {
  return (LEAD_LIFECYCLE_STAGES as readonly string[]).includes(stage);
}

export function parseLeadStageTransition(title: string) {
  const match = /^Lead stage changed:\s*(.*?)\s*→\s*(.*?)\s*$/.exec(title);
  if (!match || !isLeadLifecycleStage(match[1]) || !isLeadLifecycleStage(match[2])) return undefined;
  return { from: match[1], to: match[2] };
}

export function appendLeadStageTransition(lead: Lead, toStage: string, enteredAt: string): LeadStageTransition[] {
  if (!isLeadLifecycleStage(toStage)) throw new Error(`Unknown lead lifecycle stage: ${toStage}.`);
  const enteredAtMilliseconds = Date.parse(enteredAt);
  const fromStage = lifecycleStageForLead(lead);
  if (!Number.isFinite(enteredAtMilliseconds)) throw new Error('Lead stage transition timestamp is invalid.');
  if (fromStage === toStage) return [...(lead.stageHistory ?? [])];

  const previousEntry = lead.stageHistory?.[lead.stageHistory.length - 1];
  const previousAt = Date.parse(
    (previousEntry && transitionTimestamp(previousEntry))
      ?? lead.stage_changed_at
      ?? lead.stageChangedAt
      ?? lead.routedAt
      ?? lead.createdAt
      ?? enteredAt,
  );
  if (!Number.isFinite(previousAt) || enteredAtMilliseconds < previousAt) {
    throw new Error('Lead stage transition timestamp must not precede the current stage start.');
  }
  return [
    ...(lead.stageHistory ?? []),
    {
      fromStage,
      toStage,
      enteredAt,
      entered_at: enteredAt,
      durationDays: (enteredAtMilliseconds - previousAt) / 86400000,
    },
  ];
}

function validTimestamp(...values: (string | undefined)[]): string | undefined {
  return values.find((value) => Boolean(value && Number.isFinite(Date.parse(value))));
}

function transitionTimestamp(transition: LeadStageTransition): string | undefined {
  return validTimestamp(
    transition.enteredAt,
    transition.entered_at,
    transition.timestamp,
    transition.created_at,
    transition.date,
  );
}

export function buildLeadStageHistoryRecords(leads: Lead[]): LeadStageHistoryRecord[] {
  return leads.flatMap((lead) => {
    const transitions = (lead.stageHistory ?? []).flatMap((transition) => {
      const enteredAt = transitionTimestamp(transition);
      return enteredAt && isLeadLifecycleStage(transition.fromStage) && isLeadLifecycleStage(transition.toStage)
        ? [{ ...transition, enteredAt }]
        : [];
    });
    const currentStage = lifecycleStageForLead(lead, Boolean(lead.dealId));
    const firstTransition = transitions[0];
    const inferredStart = firstTransition
      && Number.isFinite(firstTransition.durationDays)
      && firstTransition.durationDays >= 0
      ? new Date(Date.parse(firstTransition.enteredAt) - firstTransition.durationDays * 86400000).toISOString()
      : undefined;
    const startAt = transitions.length
      ? validTimestamp(
        lead.createdAt,
        lead.created_at,
        lead.startDate,
        lead.start_date,
        inferredStart,
        lead.routedAt,
        lead.stage_changed_at,
        lead.stageChangedAt,
        firstTransition?.enteredAt,
      )
      : currentStage === 'Lead Identified'
        ? validTimestamp(lead.createdAt, lead.created_at, lead.startDate, lead.start_date, lead.routedAt, lead.stage_changed_at, lead.stageChangedAt)
        : validTimestamp(lead.stage_changed_at, lead.stageChangedAt, lead.routedAt, lead.createdAt, lead.created_at, lead.startDate, lead.start_date);
    if (!startAt) return [];

    const entries: { stage: string; enteredAt: string }[] = [];
    const initialStage = firstTransition?.fromStage ?? currentStage;
    entries.push({ stage: initialStage, enteredAt: startAt });
    for (const transition of transitions) {
      if (Date.parse(transition.enteredAt) < Date.parse(entries[entries.length - 1].enteredAt)) continue;
      if (entries[entries.length - 1].stage === transition.toStage) continue;
      entries.push({ stage: transition.toStage, enteredAt: transition.enteredAt });
    }

    if (entries[entries.length - 1].stage !== currentStage) {
      const currentEnteredAt = validTimestamp(
        lead.stage_changed_at,
        lead.stageChangedAt,
        lead.routedAt,
        entries[entries.length - 1].enteredAt,
      ) as string;
      if (Date.parse(currentEnteredAt) >= Date.parse(entries[entries.length - 1].enteredAt)) {
        entries.push({ stage: currentStage, enteredAt: currentEnteredAt });
      }
    }

    return entries.map((entry, index) => {
      const next = entries[index + 1];
      const isTerminal = !next && isTerminalLeadStage(currentStage) && entry.stage === currentStage;
      const durationDays = next
        ? Math.max(0, (Date.parse(next.enteredAt) - Date.parse(entry.enteredAt)) / 86400000)
        : undefined;
      return {
        id: `${lead.id}:stage:${index}`,
        lead_id: lead.id,
        stage: entry.stage,
        entered_at: entry.enteredAt,
        ...(next
          ? { exited_at: next.enteredAt, duration_days: durationDays }
          : isTerminal
            ? { exited_at: entry.enteredAt, duration_days: 0 }
            : {}),
        is_current: !next,
      };
    });
  });
}

export function hydrateLeadStageHistory(
  leads: Lead[],
  records: LeadStageHistoryRecord[],
): Lead[] {
  const recordsByLead = new Map<string, LeadStageHistoryRecord[]>();
  for (const record of records) {
    if (!isLeadLifecycleStage(record.stage) || !Number.isFinite(Date.parse(record.entered_at))) continue;
    const leadId = record.lead_id || record.leadId;
    if (!leadId) continue;
    const leadRecords = recordsByLead.get(leadId) ?? [];
    leadRecords.push(record);
    recordsByLead.set(leadId, leadRecords);
  }

  return leads.map((lead) => {
    const entries = recordsByLead.get(lead.id)?.slice().sort((left, right) =>
      Date.parse(left.entered_at) - Date.parse(right.entered_at));
    if (!entries?.length) return lead;
    return {
      ...lead,
      stageHistory: entries.slice(1).map((entry, index) => ({
        fromStage: entries[index].stage,
        toStage: entry.stage,
        enteredAt: entry.entered_at,
        entered_at: entry.entered_at,
        durationDays: Math.max(0, (Date.parse(entry.entered_at) - Date.parse(entries[index].entered_at)) / 86400000),
      })),
    };
  });
}

export function buildLeadTelemetryStages(lead: Lead, now = new Date()): Array<LeadStageHistoryRecord & {
  active: boolean;
  completed: boolean;
  duration_days: number;
}> {
  const terminal = isTerminalLeadStage(lifecycleStageForLead(lead, Boolean(lead.dealId)));
  const nowMilliseconds = now.getTime();
  return buildLeadStageHistoryRecords([lead]).map((record) => {
    const enteredAt = Date.parse(record.entered_at);
    const completed = Boolean(record.exited_at) || (terminal && record.stage === lifecycleStageForLead(lead, Boolean(lead.dealId)));
    const durationDays = record.exited_at
      ? Math.max(0, (Date.parse(record.exited_at) - enteredAt) / 86400000)
      : terminal
        ? 0
        : Math.max(0, (nowMilliseconds - enteredAt) / 86400000);
    return {
      ...record,
      active: !completed && record.is_current,
      completed,
      duration_days: durationDays,
    };
  });
}

export function lifecycleStageForName(stageName: string): LeadLifecycleStage {
  const stage = stageName.trim().toLowerCase();
  if (stage.includes('lost') || stage.includes('declined')) return 'Lost';
  if (stage.includes('converted to deal')) return 'Converted to deal';
  if (stage.includes('qualified') || stage.includes('bound') || stage.includes('won')
    || stage.includes('meeting') || stage.includes('negotiat') || stage.includes('underwriter')) return 'Meetings Ongoing';
  if (stage.includes('intro') || stage.includes('email') || stage.includes('quoted')) return 'Intro Email Sent';
  if (stage.includes('key person') || stage.includes('comparative') || stage.includes('presentation')
    || stage.includes('quote comparison') || stage.includes('lob scoping') || stage.includes('l2:')) {
    return 'Key Person Identified';
  }
  if (stage.includes('contact') || stage.includes('market') || stage.includes('tender')
    || stage.includes('slip') || stage.includes('kyc') || stage.includes('l1:')) return 'Contact Made';
  return 'Lead Identified';
}

export function lifecycleStageForLead(
  lead: Pick<Lead, 'funnelStage' | 'disposition'>,
  hasLinkedDeal = false,
): LeadLifecycleStage {
  if (lead.disposition === 'lost') return 'Lost';
  if (lead.disposition === 'converted') return 'Converted to deal';
  const stage = lifecycleStageForName(lead.funnelStage);
  if (stage === 'Lost') return 'Lost';
  if (hasLinkedDeal) return 'Converted to deal';
  return stage;
}

export function isTerminalLeadStage(stage: LeadLifecycleStage) {
  return (LEAD_TERMINAL_STAGES as readonly string[]).includes(stage);
}
