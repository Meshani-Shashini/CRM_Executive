import type { Activity, Client, Deal, Lead, PipelineStage, StageHistoryAudit } from '../types';
import { buildLeadStageHistoryRecords, isLeadLifecycleStage } from './leadLifecycle';
import { isTerminalDealStage } from './stageSla';
import { normalizeDateInput } from './date';

const DAY_MS = 86400000;
const DEFAULT_LEAD_STAGE_SLA_DAYS: Partial<Record<string, number>> = {
  'Lead Identified': 3,
  'Contact Made': 5,
  'Key Person Identified': 5,
  'Intro Email Sent': 7,
  'Meetings Ongoing': 10,
};

export type CalendarEventKind = 'activity' | 'meeting' | 'deal' | 'lead' | 'renewal' | 'sla';

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  client: string;
  kind: CalendarEventKind;
  category: 'activity' | 'deal' | 'lead' | 'renewal' | 'sla';
  ownerId: string;
  pipelineId?: string;
  target: { route: 'leads' | 'deals' | 'clients'; id: string };
}

export interface CalendarData {
  activities: Activity[];
  clients: Client[];
  deals: Deal[];
  leads: Lead[];
  pipelineStages: PipelineStage[];
  stageHistory: StageHistoryAudit[];
}

function storedDate(value?: string) {
  if (!value) return '';
  return normalizeDateInput(value.slice(0, 10));
}

function dateAfter(value: string, days: number) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp + days * DAY_MS).toISOString().slice(0, 10)
    : '';
}

function targetForClient(client: Client, data: CalendarData) {
  const deal = data.deals.find((item) => item.clientId === client.id || item.client === client.name);
  if (deal) return { route: 'deals' as const, id: deal.id };
  const lead = data.leads.find((item) => item.clientId === client.id || item.client === client.name);
  return lead
    ? { route: 'leads' as const, id: lead.id }
    : { route: 'clients' as const, id: client.id };
}

export function buildCalendarEvents(data: CalendarData): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const add = (event: CalendarEvent) => {
    if (event.date) events.push(event);
  };

  for (const activity of data.activities) {
    if (!activity.dueDate || activity.done) continue;
    const deal = activity.dealId ? data.deals.find((item) => item.id === activity.dealId) : undefined;
    const lead = activity.leadId ? data.leads.find((item) => item.id === activity.leadId) : undefined;
    const client = data.clients.find((item) => item.id === activity.clientId);
    const category = activity.type === 'meeting' ? 'meeting' : 'activity';
    const target = deal
      ? { route: 'deals' as const, id: deal.id }
      : lead
        ? { route: 'leads' as const, id: lead.id }
        : client
          ? targetForClient(client, data)
          : undefined;
    if (!target) continue;
    add({
      id: `activity:${activity.id}`,
      date: storedDate(activity.dueDate),
      title: activity.title,
      client: deal?.client ?? lead?.client ?? client?.name ?? '',
      kind: category,
      category: 'activity',
      ownerId: 'assigneeId' in activity && typeof activity.assigneeId === 'string'
        ? activity.assigneeId
        : activity.userId,
      pipelineId: deal?.pipelineId ?? lead?.pipelineId,
      target,
    });
  }

  for (const deal of data.deals) {
    const clientName = deal.client;
    add({
      id: `deal-close:${deal.id}`,
      date: storedDate(deal.closeDate),
      title: `Expected close · ${deal.product}`,
      client: clientName,
      kind: 'deal',
      category: 'deal',
      ownerId: deal.ownerId,
      pipelineId: deal.pipelineId,
      target: { route: 'deals', id: deal.id },
    });
    const expiryDates = new Set([deal.renewalExpiry, deal.policyExpiry].map(storedDate).filter(Boolean));
    for (const [index, date] of [...expiryDates].entries()) {
      add({
        id: `deal-renewal:${deal.id}:${index}`,
        date,
        title: `Policy renewal · ${deal.product}`,
        client: clientName,
        kind: 'renewal',
        category: 'renewal',
        ownerId: deal.ownerId,
        pipelineId: deal.pipelineId,
        target: { route: 'deals', id: deal.id },
      });
    }

    const stage = data.pipelineStages.find((item) =>
      item.pipelineId === deal.pipelineId && item.name === deal.stage);
    const currentAudit = data.stageHistory.find((item) =>
      item.dealId === deal.id && item.exitedAt === null && item.toStageId === stage?.id);
    const enteredAt = currentAudit?.enteredAt ?? deal.stageChangedAt ?? deal.createdAt;
    if (stage?.stagnationDaysThreshold && stage.stagnationDaysThreshold > 0
      && !isTerminalDealStage(deal.stage, deal.disposition, stage) && enteredAt) {
      add({
        id: `deal-sla:${deal.id}`,
        date: dateAfter(enteredAt, stage.stagnationDaysThreshold),
        title: `Deal SLA · ${deal.stage}`,
        client: clientName,
        kind: 'sla',
        category: 'sla',
        ownerId: deal.ownerId,
        pipelineId: deal.pipelineId,
        target: { route: 'deals', id: deal.id },
      });
    }
  }

  for (const lead of data.leads) {
    add({
      id: `lead-close:${lead.id}`,
      date: storedDate(lead.closeDate),
      title: `Expected close · ${lead.title ?? lead.client}`,
      client: lead.client,
      kind: 'lead',
      category: 'lead',
      ownerId: lead.ownerId,
      pipelineId: lead.pipelineId,
      target: { route: 'leads', id: lead.id },
    });
    add({
      id: `lead-renewal:${lead.id}`,
      date: storedDate(lead.renewalDate),
      title: `Policy renewal · ${lead.title ?? lead.client}`,
      client: lead.client,
      kind: 'renewal',
      category: 'renewal',
      ownerId: lead.ownerId,
      pipelineId: lead.pipelineId,
      target: { route: 'leads', id: lead.id },
    });

    if (isLeadLifecycleStage(lead.funnelStage)) {
      const currentStage = buildLeadStageHistoryRecords([lead]).find((record) =>
        record.is_current && record.stage === lead.funnelStage);
      const enteredAt = currentStage?.entered_at
        ?? lead.stage_changed_at
        ?? lead.stageChangedAt
        ?? lead.routedAt
        ?? lead.createdAt
        ?? lead.created_at
        ?? lead.startDate
        ?? lead.start_date;
      const targetDays = DEFAULT_LEAD_STAGE_SLA_DAYS[lead.funnelStage];
      if (enteredAt && typeof targetDays === 'number' && targetDays > 0) {
        add({
          id: `lead-sla:${lead.id}`,
          date: dateAfter(enteredAt, targetDays),
          title: `Lead SLA · ${lead.funnelStage}`,
          client: lead.client,
          kind: 'sla',
          category: 'sla',
          ownerId: lead.ownerId,
          pipelineId: lead.pipelineId,
          target: { route: 'leads', id: lead.id },
        });
      }
    }
  }

  for (const client of data.clients) {
    const target = targetForClient(client, data);
    const relatedDeal = target.route === 'deals' ? data.deals.find((deal) => deal.id === target.id) : undefined;
    const relatedLead = target.route === 'leads' ? data.leads.find((lead) => lead.id === target.id) : undefined;
    add({
      id: `client-renewal:${client.id}`,
      date: storedDate(client.expiry),
      title: `Policy expiry · ${client.name}`,
      client: client.name,
      kind: 'renewal',
      category: 'renewal',
      ownerId: client.ownerId,
      pipelineId: relatedDeal?.pipelineId ?? relatedLead?.pipelineId,
      target,
    });
  }

  return events.sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));
}
