import { useMemo } from 'react';
import { useApp } from '../store/AppContext';
import TableShell from '../components/table/TableShell';
import { OwnerCell, StagePill, TableDateCell } from '../components/table/TableCells';
import Badge from '../components/ui/Badge';
import PageToolbar from '../components/ui/PageToolbar';
import { formatAmount } from '../utils/currency';
import { formatStaffIdentifier } from '../utils/staff';
import { buildRenewalRows, type RenewalBucket } from '../utils/renewalsData';
import { dashboardHref } from '../utils/navigation';

const GROUPS: Array<{ key: RenewalBucket; label: string }> = [
  { key: 'Overdue', label: 'Overdue' },
  { key: 'T-15', label: 'T-15 · 0–15 days' },
  { key: 'T-30', label: 'T-30 · 16–30 days' },
  { key: 'T-60', label: 'T-60 · 31–60 days' },
  { key: 'T-90', label: 'T-90 · 61–120 days' },
];

export default function RenewalsPage() {
  const { clients, deals, leads, pipelines, pipelineStages, users } = useApp();
  const rows = useMemo(() => buildRenewalRows({
    clients, deals, leads, pipelines, pipelineStages, users,
  }), [clients, deals, leads, pipelines, pipelineStages, users]);
  const staffName = (id: string) => users.find((user) => user.id === id)?.name ?? formatStaffIdentifier(id);
  const renewalCounts = [
    { label: 'Overdue', count: rows.filter((row) => row.daysUntil < 0).length, variant: 'hot' as const },
    { label: 'Due 30d', count: rows.filter((row) => row.daysUntil >= 0 && row.daysUntil <= 30).length, variant: 'warm' as const },
    { label: 'Due 60d', count: rows.filter((row) => row.daysUntil > 30 && row.daysUntil <= 60).length, variant: 'brand' as const },
    { label: 'Due 90d', count: rows.filter((row) => row.daysUntil > 60 && row.daysUntil <= 120).length, variant: 'muted' as const },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <PageToolbar name="renewals">
        {renewalCounts.map((item) => <Badge key={item.label} variant={item.variant}>{item.label} <span className="font-semibold">{item.count}</span></Badge>)}
      </PageToolbar>

      <div data-page-content="renewals" className="space-y-4">
        {rows.length === 0 && <div className="glass rounded-xl p-6 text-sm text-muted">No renewals are due within the next 120 days.</div>}
        {GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.bucket === group.key);
          if (!groupRows.length) return null;
          return (
            <section key={group.key} className="space-y-2">
              {group.key !== 'Overdue' && (
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                  {group.label}<Badge variant="warm">{groupRows.length}</Badge>
                </h2>
              )}
              <TableShell className="renewals-table-fit">
                <table className="w-full table-fixed text-left text-xs" aria-label={`${group.label} renewals`}>
                  <thead className="border-b border-ink-700 bg-ink-900/70 text-[10px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="w-[18%] px-3 py-2">Due date</th>
                      <th className="w-[20%] px-3 py-2">Client</th>
                      <th className="w-[15%] px-3 py-2">Owner</th>
                      <th className="w-[15%] px-3 py-2">Insurer</th>
                      <th className="w-[12%] px-3 py-2">Premium</th>
                      <th className="w-[12%] px-3 py-2">Stage</th>
                      <th className="w-[8%] px-3 py-2">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-800">
                    {groupRows.map((row) => (
                      <tr key={row.id} className="text-[#E1E2E5] hover:bg-ink-900/40">
                        <td data-label="Due date" className="whitespace-nowrap px-3 py-2.5">
                          <TableDateCell value={row.renewalDate} />
                          <span className="mt-0.5 block text-[10px] text-muted">{row.daysUntil < 0 ? `${Math.abs(row.daysUntil)} days overdue` : `in ${row.daysUntil} days`}</span>
                        </td>
                        <td data-label="Client" className="truncate px-3 py-2.5" title={row.client}>{row.client}</td>
                        <td data-label="Owner" className="px-3 py-2.5"><OwnerCell name={staffName(row.ownerId)} /></td>
                        <td data-label="Insurer" className="truncate px-3 py-2.5" title={row.insurer}>{row.insurer || '—'}</td>
                        <td data-label="Premium" className="whitespace-nowrap px-3 py-2.5">{row.premium === undefined ? '—' : formatAmount(row.premium, row.currency)}</td>
                        <td data-label="Stage" className="px-3 py-2.5"><StagePill stage={row.stage} outcome="neutral" truncate /></td>
                        <td data-label="Open" className="px-3 py-2.5">
                          {(row.dealId || row.leadId) ? (
                            <a className="whitespace-nowrap text-brand-300 underline-offset-2 hover:underline"
                              href={dashboardHref(row.dealId ? 'deals' : 'leads', {
                                id: row.dealId ?? row.leadId ?? '',
                                ...(row.dealId ? { view: 'inspection' } : {}),
                              })}>
                              Open deal
                            </a>
                          ) : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            </section>
          );
        })}
      </div>
    </div>
  );
}
