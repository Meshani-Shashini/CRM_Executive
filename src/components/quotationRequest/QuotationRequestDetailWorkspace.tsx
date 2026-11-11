import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Copy, Printer, TriangleAlert } from 'lucide-react';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import PageToolbar from '../ui/PageToolbar';
import TableShell from '../table/TableShell';
import { useApp } from '../../store/AppContext';
import type {
  QuotationRequest, QuotationRequestLine, QuotationRequestLineStatus, QuotationRequestQuote,
  QuotationSection,
} from '../../types';
import { formatAmount } from '../../utils/currency';
import { formatDate } from '../../utils/date';
import { dashboardHref } from '../../utils/navigation';
import { printDocument } from '../../utils/print';
import {
  canTransitionQuotationRequestStatus, quotationLineRowActions, quotationRequestStatusOptions,
} from '../../utils/quotationRequestStatus';
import {
  deriveRequestStatus, deriveSectionStatus, formatQuotationLineActivity,
  formatQuotationLineReference, getQuotationLineDisplayStatus, quotationLineStatusCellText,
} from '../../utils/quotationRequests';
import {
  calculateIndicativePremium, compareOptionCoverage, isQuoteExpiring, quotationInterestBreakdown,
  quotationRateFromPremium, selectBestQuote,
} from '../../utils/quotationRequestDashboard';

type Props = {
  request: QuotationRequest;
  onBack: () => void;
  backHref?: string;
  backLabel?: string;
};

type ViewMode = 'dashboard' | 'formal';
type SectionTab = 'all' | string;
type OptionTab = 'compare' | string;
type QuoteDraft = { premium: string; validUntil: string };

function lineQuote(line: QuotationRequestLine, optionId: string): QuotationRequestQuote | undefined {
  return line.quotes.find((quote) => quote.optionId === optionId)
    ?? (optionId === 'base' && line.quotedPremium !== undefined
      ? {
        optionId,
        premium: line.quotedPremium,
        currency: line.quotedCurrency ?? 'MVR',
        ...(line.validUntil ? { validUntil: line.validUntil } : {}),
      }
      : undefined);
}

function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabs: string[], selected: string, setSelected: (tab: string) => void) {
  const index = tabs.indexOf(selected);
  const next = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    ? (index + 1) % tabs.length
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      ? (index - 1 + tabs.length) % tabs.length
      : -1;
  if (next >= 0) {
    event.preventDefault();
    setSelected(tabs[next]);
    document.getElementById(`qrs-tab-${tabs[next]}`)?.focus();
  }
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`glass min-w-0 rounded-xl p-3 sm:p-4 ${className}`}>{children}</section>;
}

export default function QuotationRequestDetailWorkspace({ request, onBack, backHref, backLabel = 'QRS list' }: Props) {
  const {
    clients, deals, leads, vendors, products, company, user, viewAsRole,
    quotationRequests, setQuotationRequests, setActivities,
  } = useApp();
  const [view, setView] = useState<ViewMode>('dashboard');
  const [sectionTab, setSectionTab] = useState<SectionTab>('all');
  const [optionTab, setOptionTab] = useState<OptionTab>('compare');
  const [lineEditor, setLineEditor] = useState<QuotationRequestLine | null>(null);
  const [lineStatus, setLineStatus] = useState<QuotationRequestLineStatus>('Requested');
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, QuoteDraft>>({});
  const [quoteCurrency, setQuoteCurrency] = useState<'MVR' | 'USD'>(request.currency);
  const [quoteReference, setQuoteReference] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [lineRemarks, setLineRemarks] = useState('');
  const [lineError, setLineError] = useState('');
  const [expiringWithinDays, setExpiringWithinDays] = useState(30);
  const [printVendorId, setPrintVendorId] = useState('');
  const [printTarget, setPrintTarget] = useState<{ vendorId?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const role = viewAsRole ?? user.role;
  const deal = deals.find((item) => item.id === request.dealId);
  const lead = leads.find((item) => item.id === request.leadId)
    ?? leads.find((item) => item.dealId === request.dealId);
  const client = clients.find((item) => item.id === request.clientId)
    ?? clients.find((item) => item.id === deal?.clientId)
    ?? clients.find((item) => item.id === lead?.clientId);
  const canEdit = user.role === 'admin' || role === 'admin' || role === 'sales'
    || deal?.ownerId === user.id;
  const hasSentLine = request.lines.some((line) => line.status === 'Sent' || Boolean(line.sentAt));
  const activePrintVendorId = printTarget?.vendorId ?? (view === 'formal' ? printVendorId : '');
  const linesForView = request.lines.filter((line) =>
    !activePrintVendorId || line.vendorId === activePrintVendorId,
  );
  const sectionsForView = request.sections.filter((section) =>
    linesForView.some((line) => line.sectionId === section.id),
  );
  const printableVendor = vendors.find((vendor) => vendor.id === activePrintVendorId);
  const allInsurers = [...new Set(request.lines.map((line) => line.vendorId))]
    .map((vendorId) => vendors.find((vendor) => vendor.id === vendorId))
    .filter((vendor): vendor is NonNullable<typeof vendor> => Boolean(vendor));
  const hasEligibleQuotedSection = request.lines.some((line) => {
    if (getQuotationLineDisplayStatus(line) !== 'Quoted') return false;
    const section = request.sections.find((item) => item.id === line.sectionId);
    if (!section || section.status !== 'Active') return false;
    return line.quotes.some((quote) => quote.premium > 0
      && (!quote.validUntil || Date.parse(`${quote.validUntil.slice(0, 10)}T23:59:59.999Z`) >= Date.now()));
  });

  useEffect(() => {
    if (!printTarget) return;
    const timer = window.setTimeout(() => printDocument('print-qrs-formal-slip'), 100);
    const clear = () => setPrintTarget(null);
    window.addEventListener('afterprint', clear, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', clear);
    };
  }, [printTarget]);

  const activeSection = request.sections.find((section) => sectionTab === section.id);
  const sectionsToShow = activeSection ? [activeSection] : request.sections;
  const totalSumInsured = request.sections.reduce((sum, section) => sum + section.data.totalSumInsured, 0);
  const lineCounts = request.lines.reduce<Record<QuotationRequestLineStatus, number>>((counts, line) => {
    counts[getQuotationLineDisplayStatus(line)] += 1;
    return counts;
  }, { Requested: 0, Sent: 0, Quoted: 0, Declined: 0, Expired: 0, Cancelled: 0 });
  const activeLines = request.lines.filter((line) => getQuotationLineDisplayStatus(line) !== 'Cancelled');
  const quotedLines = activeLines.filter((line) => getQuotationLineDisplayStatus(line) === 'Quoted').length;
  const activeSections = request.sections.filter((section) => deriveSectionStatus(section.id, request.lines) === 'Active').length;
  const filteredLines = useMemo(() => request.lines.filter((line) =>
    sectionTab === 'all' || line.sectionId === sectionTab,
  ), [request.lines, sectionTab]);

  const openLineEditor = (line: QuotationRequestLine, initialStatus = line.status) => {
    const section = request.sections.find((item) => item.id === line.sectionId);
    const options = section?.data.options.length ? section.data.options : [{ id: 'base', label: 'Premium' }];
    setLineEditor(line);
    setLineStatus(initialStatus);
    setQuoteCurrency(line.quotes[0]?.currency ?? line.quotedCurrency ?? request.currency);
    setQuoteDrafts(Object.fromEntries(options.map((option) => {
      const quote = lineQuote(line, option.id);
      return [option.id, {
        premium: quote ? String(quote.premium) : '',
        validUntil: quote?.validUntil ?? line.validUntil ?? '',
      }];
    })));
    setQuoteReference(line.insurerQuoteRef ?? '');
    setDeclineReason(line.declineReason ?? '');
    setLineRemarks(line.remarks);
    setLineError('');
  };

  const saveLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lineEditor) return;
    const currentRequest = quotationRequests.find((item) => item.id === request.id);
    const line = currentRequest?.lines.find((item) => item.id === lineEditor.id);
    if (!currentRequest || !line) {
      setLineError('This quotation line is no longer available.');
      return;
    }
    const currentDeal = deals.find((item) => item.id === currentRequest.dealId);
    const isDealOwner = currentDeal?.ownerId === user.id;
    const authorized = user.role === 'admin' || role === 'admin' || role === 'sales' || isDealOwner;
    if (!authorized) {
      setLineError('You are not authorized to update this quotation line.');
      return;
    }
    const canManageAllStatuses = user.role === 'admin' || role === 'admin' || isDealOwner;
    if (line.status !== lineStatus
      && !canTransitionQuotationRequestStatus(line.status, lineStatus, role, canManageAllStatuses)) {
      setLineError('You are not allowed to make this line status transition.');
      return;
    }
    const section = currentRequest.sections.find((item) => item.id === line.sectionId);
    const options = section?.data.options.length ? section.data.options : [{ id: 'base', label: 'Premium' }];
    const now = new Date().toISOString();
    let quotes = line.quotes;
    if (lineStatus === 'Quoted') {
      const missingQuote = options.find((option) => {
        const draft = quoteDrafts[option.id];
        return !draft?.premium || !Number.isFinite(Number(draft.premium)) || Number(draft.premium) <= 0
          || !draft.validUntil || !Number.isFinite(Date.parse(`${draft.validUntil}T00:00:00`));
      });
      if (missingQuote) {
        setLineError(`Enter a positive premium and valid-until date for ${missingQuote.label}.`);
        return;
      }
      quotes = options.map((option) => ({
        optionId: option.id,
        premium: Number(quoteDrafts[option.id].premium),
        currency: quoteCurrency,
        validUntil: quoteDrafts[option.id].validUntil,
      }));
    }
    if (lineStatus === 'Declined' && !declineReason.trim()) {
      setLineError('Enter the insurer decline reason before marking this line Declined.');
      return;
    }
    const statusChanged = line.status !== lineStatus;
    const nextLine: QuotationRequestLine = {
      ...line,
      status: lineStatus,
      quotes,
      ...(lineStatus === 'Sent' ? { sentAt: line.sentAt ?? now } : {}),
      ...(lineStatus === 'Quoted' || lineStatus === 'Declined' ? { respondedAt: now } : {}),
      ...(lineStatus === 'Declined' ? { declineReason: declineReason.trim() } : {}),
      ...(lineStatus === 'Quoted' ? {
        quotedPremium: quotes[0]?.premium,
        quotedCurrency: quoteCurrency,
        ...(quotes[0]?.validUntil ? { validUntil: quotes[0].validUntil } : {}),
      } : {}),
      ...(quoteReference.trim() ? { insurerQuoteRef: quoteReference.trim() } : {}),
      remarks: lineRemarks.trim(),
      statusHistory: statusChanged ? [...line.statusHistory, {
        fromStatus: line.status,
        toStatus: lineStatus,
        changedAt: now,
        changedBy: user.id,
        ...(lineStatus === 'Declined' ? { reason: declineReason.trim() } : {}),
      }] : line.statusHistory,
    };
    const nextRequest: QuotationRequest = {
      ...currentRequest,
      updatedAt: now,
      lines: currentRequest.lines.map((item) => item.id === line.id ? nextLine : item),
      sections: currentRequest.sections.map((item) => ({
        ...item,
        status: deriveSectionStatus(item.id, currentRequest.lines.map((current) =>
          current.id === line.id ? nextLine : current,
        )),
      })),
    };
    setQuotationRequests((current) => current.map((item) => item.id === nextRequest.id ? nextRequest : item));
    if (statusChanged || lineStatus === 'Quoted') {
      setActivities((current) => [{
        id: `qrs-line-${crypto.randomUUID()}`,
        clientId: '',
        leadId: nextRequest.leadId,
        dealId: nextRequest.dealId,
        insurer: vendors.find((vendor) => vendor.id === line.vendorId)?.name,
        type: 'note',
        title: formatQuotationLineActivity(
          formatQuotationLineReference(line),
          statusChanged ? 'Quotation request line status changed' : 'Carrier quotation logged',
        ),
        description: formatQuotationLineActivity(
          formatQuotationLineReference(line),
          `${line.status} → ${lineStatus}${lineStatus === 'Quoted' ? ` · ${quotes.length} option quote${quotes.length === 1 ? '' : 's'} logged` : ''}${lineStatus === 'Declined' ? ` · ${declineReason.trim()}` : ''}`,
        ),
        date: now,
        createdAt: now,
        userId: user.id,
        actorName: user.name,
      }, ...current]);
    }
    setLineEditor(null);
  };

  const updateTargetRate = (sectionId: string, value: number) => {
    if (!canEdit || hasSentLine) return;
    const section = request.sections.find((item) => item.id === sectionId);
    const bounds = products.find((item) => item.code === section?.productCode)?.targetRateBounds;
    if (!bounds || !Number.isFinite(value)) return;
    const boundedValue = Math.min(bounds.hardMaxPct, Math.max(bounds.hardMinPct, value));
    const now = new Date().toISOString();
    setQuotationRequests((current) => current.map((item) => item.id === request.id ? {
      ...item,
      updatedAt: now,
      sections: item.sections.map((section) => section.id === sectionId
        ? { ...section, data: { ...section.data, targetRatePct: boundedValue } }
        : section),
    } : item));
  };

  const copyBrief = async () => {
    const brief = [
      `${request.reference} · Issued ${formatDate(request.issuedAt)}`,
      `Insured: ${request.insuredName}`,
      request.riskLocation && `Risk location: ${request.riskLocation}`,
      request.territorialLimits && `Territorial limits: ${request.territorialLimits}`,
      `Deal: ${deal?.client ?? request.dealId} · ${deal?.product ?? ''}`,
      lead?.title && `Lead: ${lead.title}`,
      `Total sum insured: ${formatAmount(totalSumInsured, request.currency)}`,
      ...request.sections.map((section) =>
        `${String(section.no).padStart(2, '0')}. ${section.title} — ${formatAmount(section.data.totalSumInsured, request.currency)}`,
      ),
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(brief);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const setTargetSection = (tab: string) => setSectionTab(tab);
  const tabs = ['all', ...request.sections.map((section) => section.id)];
  const selectedLine = lineEditor;
  const selectedSection = selectedLine && request.sections.find((section) => section.id === selectedLine.sectionId);
  const quoteOptions = selectedSection?.data.options.length
    ? selectedSection.data.options
    : [{ id: 'base', label: 'Premium' }];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageToolbar name="qrs-detail">
        {backHref
          ? <a className="btn-ghost !px-2 !py-1.5 text-xs" href={backHref}><ArrowLeft size={14} /> {backLabel}</a>
          : <button type="button" className="btn-ghost !px-2 !py-1.5 text-xs" onClick={onBack}><ArrowLeft size={14} /> {backLabel}</button>}
        <div className="flex min-w-0 flex-1 items-center gap-1" role="tablist" aria-label="Quotation slip view">
          {(['dashboard', 'formal'] as const).map((mode) => <button
            key={mode}
            id={`qrs-view-${mode}`}
            type="button"
            role="tab"
            aria-selected={view === mode}
            tabIndex={view === mode ? 0 : -1}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${view === mode ? 'bg-ink-700 text-white' : 'text-muted hover:bg-ink-800 hover:text-white'}`}
            onClick={() => setView(mode)}
            onKeyDown={(event) => tabKeyDown(event, ['dashboard', 'formal'], view, (next) => setView(next as ViewMode))}
          >{mode === 'dashboard' ? 'Dashboard' : 'Formal slip'}</button>)}
        </div>
        {view === 'formal' && allInsurers.length > 0 && <select className="input !w-auto max-w-48 !py-1.5 !text-xs" aria-label="Print slip for insurer" value={printVendorId} onChange={(event) => setPrintVendorId(event.target.value)}>
          <option value="">All insurers</option>
          {allInsurers.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
        </select>}
        <button type="button" className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => {
          setView('formal');
          setPrintTarget({ ...(printVendorId ? { vendorId: printVendorId } : {}) });
        }}><Printer size={14} /> Print / Save PDF</button>
        <button type="button" className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => { void copyBrief(); }}><Copy size={14} /> {copied ? 'Copied' : 'Copy brief'}</button>
      </PageToolbar>

      {view === 'dashboard' ? <>
        <Card className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h1 className="text-lg font-semibold text-white">{request.insuredName || client?.name || 'Insured not specified'}</h1>
                <p className="mt-1 text-xs text-muted">{request.reference} · Issued {formatDate(request.issuedAt)}</p></div>
              <Badge compact variant={deriveRequestStatus(request.lines) === 'Quoted' ? 'win' : deriveRequestStatus(request.lines) === 'Cancelled' ? 'muted' : 'brand'}>{deriveRequestStatus(request.lines)}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              {request.riskLocation && <Fact label="Risk location" value={request.riskLocation} />}
              {request.territorialLimits && <Fact label="Territorial limits" value={request.territorialLimits} />}
              {request.businessActivity && <Fact label="Business activity" value={request.businessActivity} />}
              {request.additionalActivity && <Fact label="Additional activity" value={request.additionalActivity} />}
              {request.occupation && <Fact label="Occupation" value={request.occupation} />}
              {request.periodOfInsurance && <Fact label="Period of insurance" value={request.periodOfInsurance} />}
              {deal?.product && <Fact label="Deal product" value={deal.product} />}
              {lead?.title && <Fact label="Lead" value={lead.title} />}
              {lead?.contact && <Fact label="Lead contact" value={lead.contact} />}
              {client?.accountStatus && <Fact label="Client status" value={client.accountStatus} />}
              {client?.contactPerson && <Fact label="Client contact" value={client.contactPerson} />}
              {client?.email && <Fact label="Client email" value={client.email} />}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-ink-900/40 p-3">
            <Fact label="Broker in charge" value={request.preparedBy || 'Not specified'} />
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">Checked by</span>
              {request.checkedBy
                ? <Badge compact variant="win">{request.checkedBy}</Badge>
                : <Badge compact variant="warm">Not checked</Badge>}
            </div>
            {request.sections.some((section) => section.data.targetRatePct !== undefined) && <div className="border-t border-ink-700 pt-3">
              <div className="text-[10px] uppercase tracking-wide text-muted">Indicative target rate</div>
              {request.sections.filter((section) => section.data.targetRatePct !== undefined).map((section) => {
                const estimate = calculateIndicativePremium(section.data.totalSumInsured, section.data.targetRatePct!);
                return <div key={section.id} className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-white">{section.title} · {section.data.targetRatePct}%</span>
                  <span className="text-brand-300">{estimate ? formatAmount(estimate.annual, request.currency) : '—'}</span>
                </div>;
              })}
              <p className="mt-2 text-[10px] text-warm">Indicative, not a quotation</p>
            </div>}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Total sum insured" value={formatAmount(totalSumInsured, request.currency)} detail={`${request.sections.length} product section${request.sections.length === 1 ? '' : 's'}`} />
          <Kpi label="Active sections" value={String(activeSections)} detail={`${request.sections.length - activeSections} cancelled`} />
          <Kpi label="Quotes received" value={`${quotedLines} / ${activeLines.length}`} detail="Quoted lines / active insurer lines asked" />
          <Kpi label="Lines by status" value={`${lineCounts.Requested} / ${lineCounts.Sent} / ${lineCounts.Quoted} / ${lineCounts.Declined}`} detail="Requested / Sent / Quoted / Declined" />
        </div>

        <div className="flex max-w-full gap-1 overflow-x-auto border-b border-ink-700" role="tablist" aria-label="Quotation sections">
          <SectionTabButton id="all" label={`All covers (${request.sections.length})`} selected={sectionTab} setSelected={setTargetSection} onKeyDown={(event) => tabKeyDown(event, tabs, sectionTab, setTargetSection)} />
          {request.sections.map((section) => <SectionTabButton
            key={section.id}
            id={section.id}
            label={`${String(section.no).padStart(2, '0')} · ${section.title}`}
            badge={section.data.options.length ? `${section.data.options.length} Opts` : undefined}
            selected={sectionTab}
            setSelected={setTargetSection}
            onKeyDown={(event) => tabKeyDown(event, tabs, sectionTab, setTargetSection)}
            muted={deriveSectionStatus(section.id, request.lines) === 'Cancelled'}
          />)}
        </div>

        {!request.lines.length && <Card><p className="text-sm text-muted">No insurer lines are attached to this slip yet.</p></Card>}
        {sectionsToShow.map((section) => <SectionDashboard
          key={section.id}
          request={request}
          section={section}
          lines={request.lines.filter((line) => line.sectionId === section.id)}
          canEdit={canEdit}
          hasSentLine={hasSentLine}
          currency={request.currency}
          clauses={company.quotationClauses[section.productCode] ?? company.quotationClauses.default}
          product={products.find((item) => item.code === section.productCode)}
          optionTab={optionTab}
          setOptionTab={setOptionTab}
          onTargetRateChange={updateTargetRate}
        />)}

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="text-sm font-semibold text-white">Carrier quotes ledger</h2><p className="text-[10px] text-muted">One row per insurer line · quotes expire alert window: {expiringWithinDays} days</p></div>
            <select className="input !w-auto !py-1.5 !text-xs" aria-label="Quote expiry warning window" value={expiringWithinDays} onChange={(event) => setExpiringWithinDays(Number(event.target.value))}>
              {[7, 14, 30, 60].map((days) => <option key={days} value={days}>{days} days</option>)}
            </select>
          </div>
          <TableShell className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-ink-900/60 text-[10px] text-muted"><tr>
                {['Line / insurer', 'Underwriter contact', 'Section / product', 'Option', 'Status', 'Premium', 'Derived rate', 'Validity', 'Deductible / notes', 'Insurer ref', 'Action'].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}
              </tr></thead>
              <tbody>{filteredLines.map((line) => {
                const section = request.sections.find((item) => item.id === line.sectionId);
                const vendor = vendors.find((item) => item.id === line.vendorId);
                const contact = vendor?.contacts?.find((item) =>
                  item.name.trim() || item.email.trim() || item.phone.trim(),
                );
                const options = section?.data.options.length ? section.data.options : [{ id: 'base', label: 'Premium' }];
                const quotes = options
                  .map((option) => ({ option, quote: lineQuote(line, option.id) }))
                  .filter((item): item is { option: typeof options[number]; quote: QuotationRequestQuote } => Boolean(item.quote));
                const bestByOption = new Set(quotes.filter(({ option, quote }) => {
                  const sameCurrency = request.lines.flatMap((candidateLine) => {
                    if (candidateLine.sectionId !== section?.id) return [];
                    const candidateQuote = lineQuote(candidateLine, option.id);
                    return candidateQuote?.currency === quote?.currency ? [{ line: candidateLine, quote: candidateQuote }] : [];
                  });
                  return selectBestQuote(sameCurrency)?.line.id === line.id;
                }).map(({ option }) => option.id));
                const displayStatus = getQuotationLineDisplayStatus(line);
                const statusCellText = quotationLineStatusCellText(line);
                const rowActions = quotationLineRowActions(
                  displayStatus,
                  line.status,
                  role,
                  user.role === 'admin' || role === 'admin' || deal?.ownerId === user.id,
                );
                const statusCellFallback = statusCellText ?? 'Quote details unavailable';
                const cancelled = displayStatus === 'Cancelled' || section?.status === 'Cancelled';
                return <tr key={line.id} className={`border-t border-ink-700/60 ${cancelled ? 'text-muted opacity-60' : 'text-white'}`}>
                  <td className="px-2 py-2"><span className="font-mono text-brand-300">{formatQuotationLineReference(line)}</span><div>{vendor?.name ?? 'Unknown insurer'}</div></td>
                  <td className="px-2 py-2 text-muted">{contact ? <>{contact.name}<div>{contact.email || contact.phone}</div></> : '—'}</td>
                  <td className="px-2 py-2">{section?.title ?? 'Section unavailable'}<div className="text-muted">{section?.productCode}</div></td>
                  <td className="px-2 py-2">{quotes.length ? quotes.map(({ option }) => <div key={option.id} className="flex items-center gap-1">{option.label}{bestByOption.has(option.id) && <Badge compact variant="win">Best</Badge>}</div>) : section?.data.options.map((option) => <div key={option.id}>{option.label}</div>) ?? 'Standard'}</td>
                  <td className="px-2 py-2"><Badge compact variant={displayStatus === 'Quoted' ? 'win' : displayStatus === 'Declined' ? 'warm' : displayStatus === 'Cancelled' || cancelled ? 'muted' : 'brand'}>{displayStatus}</Badge></td>
                  <td className="px-2 py-2">{quotes.length ? quotes.map(({ option, quote }) => <div key={option.id} className={bestByOption.has(option.id) ? 'font-semibold text-win' : 'text-brand-300'}>{formatAmount(quote.premium, quote.currency)}{bestByOption.has(option.id) ? ' · Best' : ''}</div>) : statusCellText ?? statusCellFallback}</td>
                  <td className="px-2 py-2">{quotes.length ? quotes.map(({ option, quote }) => {
                    const rate = quotationRateFromPremium(quote.premium, section?.data.totalSumInsured ?? 0);
                    return <div key={option.id} className="text-muted">{rate === undefined ? 'Rate unavailable' : `${rate.toFixed(2)}%`}</div>;
                  }) : statusCellText ?? statusCellFallback}</td>
                  <td className="px-2 py-2">{quotes.length ? quotes.map(({ option, quote }) => <div key={option.id} className={isQuoteExpiring(quote.validUntil, new Date(), expiringWithinDays) ? 'text-warm' : 'text-muted'}>
                    {quote.validUntil ? formatDate(quote.validUntil) : 'Validity unavailable'}{isQuoteExpiring(quote.validUntil, new Date(), expiringWithinDays) && <TriangleAlert className="ml-1 inline" size={12} aria-label="Expiring soon" />}
                  </div>) : statusCellText ?? statusCellFallback}</td>
                  <td className="max-w-40 whitespace-normal px-2 py-2 text-muted">{displayStatus === 'Quoted'
                    ? [...(line.insurerDeductibles ?? []), line.remarks].filter(Boolean).join(' · ') || 'No deductible/notes supplied'
                    : statusCellFallback}</td>
                  <td className="px-2 py-2 text-muted">{displayStatus === 'Quoted' ? line.insurerQuoteRef || 'No insurer reference' : statusCellFallback}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {rowActions.map((action) => {
                        const actionLabels = {
                          send: 'Send',
                          cancel: 'Cancel',
                          'log-quote': 'Log carrier quotation',
                          decline: 'Decline',
                          'edit-quote': 'Edit quote',
                          reopen: 'Reopen',
                        } as const;
                        const targetStatus = action === 'send' ? 'Sent'
                          : action === 'cancel' ? 'Cancelled'
                            : action === 'decline' ? 'Declined'
                              : action === 'reopen' ? 'Requested'
                                : 'Quoted';
                        return <button key={action} type="button" className="btn-ghost !px-2 !py-1 text-[10px]"
                          disabled={!canEdit} title={!canEdit ? 'You are not authorized to update this line.' : undefined}
                          onClick={() => openLineEditor(line, targetStatus)}>
                          {actionLabels[action]}
                        </button>;
                      })}
                    </div>
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </TableShell>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">{filteredLines.length} insurer line{filteredLines.length === 1 ? '' : 's'} shown</p>
            {canEdit && <button type="button" className="btn-primary !px-3 !py-1.5 text-xs"
              disabled={!hasEligibleQuotedSection}
              title={!hasEligibleQuotedSection ? 'Log at least one carrier quotation first' : 'Create client quotation'}
              onClick={() => {
                if (!hasEligibleQuotedSection) return;
                window.location.hash = dashboardHref('quotations', {
                  dealId: request.dealId,
                  requestId: request.id,
                  create: '1',
                });
              }}>Create client quotation</button>}
          </div>
        </Card>
      </> : <FormalSlip request={request} sections={sectionsForView} lines={linesForView} vendorName={(id) => vendors.find((vendor) => vendor.id === id)?.name ?? 'Unknown insurer'} company={company} clientName={client?.name} leadName={lead?.title} printableVendor={printableVendor} />}

      <Modal open={Boolean(lineEditor)} onClose={() => setLineEditor(null)}
        title={`${lineEditor?.status === 'Quoted' || lineStatus === 'Quoted' ? 'Carrier quotation' : 'Update insurer line'} · ${lineEditor?.reference ?? ''}`}
        subtitle={`${vendors.find((vendor) => vendor.id === lineEditor?.vendorId)?.name ?? 'Insurer'} · ${selectedSection?.title ?? ''}`} size="md" footer={<>
        <button type="button" className="btn-ghost" onClick={() => setLineEditor(null)}>Cancel</button>
        <button type="submit" form="qrs-detail-line-form" className="btn-primary">Save line</button>
      </>}>
        {lineEditor && <form id="qrs-detail-line-form" onSubmit={saveLine} className="space-y-3">
          <Field label="Status *"><select className="input" value={lineStatus} onChange={(event) => setLineStatus(event.target.value as QuotationRequestLineStatus)}>
            {quotationRequestStatusOptions(lineEditor.status, role, user.role === 'admin' || role === 'admin' || deal?.ownerId === user.id)
              .map(({ status, label, disabled }) => <option key={status} value={status} disabled={disabled}>{label}</option>)}
          </select></Field>
          {lineStatus === 'Quoted' && <>
            <Field label="Currency *"><select className="input" value={quoteCurrency} onChange={(event) => setQuoteCurrency(event.target.value as 'MVR' | 'USD')}><option value="MVR">MVR</option><option value="USD">USD</option></select></Field>
            {quoteOptions.map((option) => <fieldset key={option.id} className="grid grid-cols-1 gap-3 rounded-lg border border-ink-600 p-3 sm:grid-cols-2">
              <legend className="px-1 text-xs text-brand-300">{option.label}</legend>
              <Field label="Premium *"><input className="input" type="number" min="0.01" step="0.01" required value={quoteDrafts[option.id]?.premium ?? ''} onChange={(event) => setQuoteDrafts((current) => ({ ...current, [option.id]: { premium: event.target.value, validUntil: current[option.id]?.validUntil ?? '' } }))} /></Field>
              <Field label="Valid until *"><input className="input" type="date" required value={quoteDrafts[option.id]?.validUntil ?? ''} onChange={(event) => setQuoteDrafts((current) => ({ ...current, [option.id]: { premium: current[option.id]?.premium ?? '', validUntil: event.target.value } }))} /></Field>
            </fieldset>)}
            <Field label="Insurer quote reference"><input className="input" value={quoteReference} onChange={(event) => setQuoteReference(event.target.value)} /></Field>
          </>}
          {lineStatus === 'Declined' && <Field label="Decline reason *"><textarea className="input min-h-20" required value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} /></Field>}
          <Field label="Remarks"><textarea className="input min-h-16" value={lineRemarks} onChange={(event) => setLineRemarks(event.target.value)} /></Field>
          {lineError && <p role="alert" className="text-sm text-hot">{lineError}</p>}
        </form>}
      </Modal>

    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className="mt-0.5 break-words text-white">{value}</div></div>;
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="!p-3"><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className="mt-1 text-sm font-semibold text-white">{value}</div><div className="mt-1 text-[10px] text-muted">{detail}</div></Card>;
}

function SectionTabButton({
  id, label, badge, selected, setSelected, onKeyDown, muted = false,
}: {
  id: string;
  label: string;
  badge?: string;
  selected: string;
  setSelected: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  muted?: boolean;
}) {
  const active = selected === id;
  return <button id={`qrs-tab-${id}`} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
    className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs ${active ? 'border-brand-400 text-white' : 'border-transparent text-muted hover:text-white'} ${muted ? 'opacity-50' : ''}`}
    onClick={() => setSelected(id)} onKeyDown={onKeyDown}>
    {label}{badge && <Badge compact variant="muted">{badge}</Badge>}
  </button>;
}

function SectionDashboard({
  request, section, lines, canEdit, hasSentLine, currency, clauses, product, optionTab, setOptionTab, onTargetRateChange,
}: {
  request: QuotationRequest;
  section: QuotationSection;
  lines: QuotationRequestLine[];
  canEdit: boolean;
  hasSentLine: boolean;
  currency: 'MVR' | 'USD';
  clauses: { perils: string[]; exclusions: string[]; warranties: Array<{ title: string; text: string }> };
  product: ReturnType<typeof useApp>['products'][number] | undefined;
  optionTab: string;
  setOptionTab: (tab: string) => void;
  onTargetRateChange: (sectionId: string, value: number) => void;
}) {
  const breakdown = quotationInterestBreakdown(section);
  const cancelled = deriveSectionStatus(section.id, request.lines) === 'Cancelled';
  const options = section.data.options;
  const optionTabs = ['compare', ...options.map((option) => option.id)];
  const activeOptionTab = optionTabs.includes(optionTab) ? optionTab : 'compare';
  const bounds = product?.targetRateBounds;
  const targetRate = section.data.targetRatePct;
  const calculator = targetRate === undefined ? undefined : calculateIndicativePremium(section.data.totalSumInsured, targetRate);
  const optionComparison = compareOptionCoverage(options[0], options[1]);
  return <Card className={cancelled ? 'opacity-60' : ''}>
    <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-white">{String(section.no).padStart(2, '0')} · {section.title}</h2>
        <Badge compact variant={cancelled ? 'muted' : 'brand'}>{cancelled ? 'Cancelled' : 'Active'}</Badge>
        {options.length > 0 && <Badge compact variant="muted">{options.length} Opts</Badge>}</div>
        <p className="mt-1 text-xs text-muted">{section.productCode} · {lines.length} insurer line{lines.length === 1 ? '' : 's'} · Total {formatAmount(section.data.totalSumInsured, currency)}</p></div>
    </header>

    {breakdown.rows.length > 0 && <div className="mb-4">
      <h3 className="mb-2 text-xs font-semibold text-white">Insured interests</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-72 text-left text-xs">
          <thead className="text-[10px] text-muted"><tr><th className="py-1">Interest</th><th className="py-1 text-right">Sum insured</th><th className="py-1 text-right">Weight</th></tr></thead>
          <tbody>{breakdown.rows.map((row, index) => <tr key={`${row.interest}-${index}`} className="border-t border-ink-700/60">
            <td className="py-1.5 text-white">{row.interest || 'Unnamed interest'}</td>
            <td className="py-1.5 text-right text-white">{formatAmount(row.sumInsured, currency)}</td>
            <td className="py-1.5 text-right text-muted">{row.weightPct.toFixed(1)}%</td>
          </tr>)}
            <tr className="border-t border-ink-600 font-semibold"><td className="py-1.5 text-white">Subtotal</td><td className="py-1.5 text-right text-white">{formatAmount(breakdown.subtotal, currency)}</td><td className="py-1.5 text-right text-muted">{section.data.totalSumInsured > 0 ? `${(breakdown.subtotal / section.data.totalSumInsured * 100).toFixed(1)}%` : '—'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>}

    {section.data.businessInterruption && <div className="mb-4 rounded-lg border border-ink-600 bg-ink-900/40 p-3">
      <h3 className="text-xs font-semibold text-white">Business interruption</h3>
      <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <Fact label="Basis" value={section.data.materialInfo['Indemnity basis'] || 'Gross profit'} />
        <Fact label="Sum insured" value={formatAmount(section.data.businessInterruption.grossProfit, currency)} />
        <Fact label="Indemnity period" value={`${section.data.businessInterruption.indemnityMonths} months`} />
      </div>
    </div>}

    {section.data.options.length > 0 && <div className="mb-4">
      <div className="mb-2 flex gap-1" role="tablist" aria-label={`${section.title} options`}>
        {optionTabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeOptionTab === tab}
          tabIndex={activeOptionTab === tab ? 0 : -1}
          className={`rounded-md px-2.5 py-1.5 text-xs ${activeOptionTab === tab ? 'bg-ink-700 text-white' : 'text-muted hover:bg-ink-800 hover:text-white'}`}
          onClick={() => setOptionTab(tab)}
          onKeyDown={(event) => tabKeyDown(event, optionTabs, activeOptionTab, setOptionTab)}>
          {tab === 'compare' ? 'Comparison' : options.find((option) => option.id === tab)?.label ?? tab}
        </button>)}
      </div>
      {activeOptionTab === 'compare' && options.length >= 2 ? <div className="overflow-x-auto">
        <table className="w-full min-w-80 text-left text-xs">
          <thead className="text-[10px] text-muted"><tr><th className="py-1">Coverage head</th><th className="py-1 text-right">{options[0].label}</th><th className="py-1 text-right">{options[1].label}</th><th className="py-1 text-right">Variance</th></tr></thead>
          <tbody>{optionComparison.rows.map((row) => <tr key={row.name} className="border-t border-ink-700/60">
            <td className="py-1.5 text-white">{row.name}</td><td className="py-1.5 text-right text-muted">{formatAmount(row.firstLimit, currency)}</td>
            <td className="py-1.5 text-right text-muted">{formatAmount(row.secondLimit, currency)}</td>
            <td className={`py-1.5 text-right ${row.variance >= 0 ? 'text-win' : 'text-warm'}`}>{row.variance >= 0 ? '+' : ''}{formatAmount(row.variance, currency)}{row.variancePct === undefined ? '' : ` · ${row.variancePct >= 0 ? '+' : ''}${row.variancePct.toFixed(1)}%`}</td>
          </tr>)}<tr className="border-t border-ink-600 font-semibold"><td className="py-1.5 text-white">Total</td><td className="py-1.5 text-right text-white">{formatAmount(optionComparison.firstTotal, currency)}</td><td className="py-1.5 text-right text-white">{formatAmount(optionComparison.secondTotal, currency)}</td><td className="py-1.5 text-right text-muted">{formatAmount(optionComparison.secondTotal - optionComparison.firstTotal, currency)}</td></tr></tbody>
        </table>
      </div> : options.filter((option) => activeOptionTab === 'compare' || option.id === activeOptionTab).map((option) => <div key={option.id} className="overflow-x-auto">
        <table className="w-full min-w-72 text-left text-xs">
          <thead className="text-[10px] text-muted"><tr><th className="py-1">Coverage head</th><th className="py-1 text-right">Limit</th></tr></thead>
          <tbody>{option.coverages.map((coverage) => <tr key={coverage.name} className="border-t border-ink-700/60"><td className="py-1.5 text-white">{coverage.name}</td><td className="py-1.5 text-right text-white">{formatAmount(coverage.limit, currency)}</td></tr>)}</tbody>
        </table>
      </div>)}
    </div>}

    {targetRate !== undefined && <div className="mb-4 rounded-lg border border-ink-600 bg-ink-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold text-white">Indicative target premium</h3>
        <Badge compact variant="warm">Indicative, not a quotation</Badge></div>
      {bounds && calculator ? <>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="block text-xs text-muted">Rate % · soft {bounds.softMinPct}–{bounds.softMaxPct}%
            <input className="mt-2 w-full accent-brand-400" type="range" min={bounds.hardMinPct} max={bounds.hardMaxPct} step="0.01" value={Math.min(bounds.hardMaxPct, Math.max(bounds.hardMinPct, targetRate))}
              aria-label={`${section.title} indicative rate`}
              disabled={!canEdit || hasSentLine || cancelled}
              onChange={(event) => onTargetRateChange(section.id, Number(event.target.value))} />
          </label>
          <label className="block text-xs text-muted">Target rate %
            <input className="input mt-1" type="number" min={bounds.hardMinPct} max={bounds.hardMaxPct} step="0.01" value={targetRate}
              disabled={!canEdit || hasSentLine || cancelled}
              onChange={(event) => onTargetRateChange(section.id, Number(event.target.value))} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <Fact label="Annual" value={formatAmount(calculator.annual, currency)} />
          <Fact label="Monthly pro-rata" value={formatAmount(calculator.monthly, currency)} />
          <Fact label="Daily pro-rata" value={formatAmount(calculator.daily, currency)} />
        </div>
        {hasSentLine && <p className="mt-2 text-[10px] text-muted">Target rate is locked after a line has been sent.</p>}
      </> : <p className="mt-2 text-xs text-muted">Configure hard and soft target-rate bounds for this product in System Settings to enable the calculator.</p>}
    </div>}

    {section.data.deductibles.length > 0 && <div className="mb-3 rounded-lg border border-warm/30 bg-warm/10 p-3">
      <h3 className="text-xs font-semibold text-warm">Deductibles</h3>
      <ul className="mt-1 list-inside list-disc text-xs text-white">{section.data.deductibles.filter(Boolean).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
    </div>}
    {section.data.extensions.length > 0 && <div className="mb-3">
      <h3 className="text-xs font-semibold text-white">Extensions</h3>
      <ul className="mt-1 grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-2">
        {section.data.extensions.map((extension, index) => <li key={`${extension.name}-${index}`}>{extension.name}{extension.limit ? ` · ${extension.limit}` : ''}</li>)}
      </ul>
    </div>}
    {section.data.template !== 'property' && Object.entries(section.data.materialInfo).some(([, value]) => value) && <div className="mb-3">
      <h3 className="text-xs font-semibold text-white">Material information</h3>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{Object.entries(section.data.materialInfo).filter(([, value]) => value).map(([key, value]) => <Fact key={key} label={key} value={value} />)}</div>
    </div>}
    <div className="grid grid-cols-1 gap-3 border-t border-ink-700 pt-3 md:grid-cols-2">
      <div><h3 className="text-xs font-semibold text-white">Clause library</h3>
        {clauses.perils.length || clauses.exclusions.length || clauses.warranties.length
          ? <ul className="mt-1 space-y-1 text-xs text-muted">
            {[...clauses.perils, ...clauses.exclusions, ...clauses.warranties.map((item) => `${item.title}: ${item.text}`)].map((clause, index) => <li key={`${section.id}-clause-${index}`}><span className="mr-1 text-win">✓</span>{clause}</li>)}
          </ul>
          : <p className="mt-1 text-xs text-muted">No clauses configured for this product.</p>}
      </div>
      <div className="rounded-lg border border-ink-600 bg-ink-900/30 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted">Combined section total</div>
        <div className="mt-1 text-sm font-semibold text-white">{formatAmount(section.data.totalSumInsured, currency)}</div>
        {section.status === 'Cancelled' && <Badge compact variant="muted">Cancelled section · section number retained</Badge>}
      </div>
    </div>
  </Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-xs text-muted">{label}</span>{children}</label>;
}

function FormalSlip({
  request, sections, lines, vendorName, company, clientName, leadName, printableVendor,
}: {
  request: QuotationRequest;
  sections: QuotationSection[];
  lines: QuotationRequestLine[];
  vendorName: (id: string) => string;
  company: ReturnType<typeof useApp>['company'];
  clientName?: string;
  leadName?: string;
  printableVendor?: ReturnType<typeof useApp>['vendors'][number];
}) {
  const coverNames = sections.map((section) => section.title);
  return <article className="qrs-formal-slip glass min-w-0 rounded-xl p-4 sm:p-6">
    <header className="flex flex-col justify-between gap-4 border-b border-ink-600 pb-4 sm:flex-row">
      <div><h1 className="text-base font-semibold text-white">{company.name || 'Insurance Broker'}</h1>
        {company.legalName && <p className="mt-1 text-xs text-muted">{company.legalName}</p>}
        {company.address && <p className="text-xs text-muted">{company.address}</p>}
        {(company.email || company.phone) && <p className="text-xs text-muted">{[company.email, company.phone].filter(Boolean).join(' · ')}</p>}</div>
      <div className="sm:text-right"><h2 className="text-lg font-semibold text-white">Quotation Request Slip</h2>
        <p className="mt-1 font-mono text-sm text-brand-300">{request.reference}</p>
        <p className="text-xs text-muted">Issued {formatDate(request.issuedAt)}</p>
        {printableVendor && <p className="text-xs text-muted">For {printableVendor.name}</p>}</div>
    </header>
    <section className="my-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
      <Fact label="Insured" value={request.insuredName || clientName || '—'} />
      {clientName && <Fact label="Client" value={clientName} />}
      {leadName && <Fact label="Lead" value={leadName} />}
      {request.businessActivity && <Fact label="Business activity" value={request.businessActivity} />}
      {request.additionalActivity && <Fact label="Additional activity" value={request.additionalActivity} />}
      {request.riskLocation && <Fact label="Risk location" value={request.riskLocation} />}
      {request.territorialLimits && <Fact label="Territorial limits" value={request.territorialLimits} />}
      {request.occupation && <Fact label="Occupation" value={request.occupation} />}
      <Fact label="Period of insurance" value={request.periodOfInsurance || 'TBA'} />
      <Fact label="Required by" value={formatDate(request.requiredBy)} />
      {request.currency && <Fact label="Currency" value={request.currency} />}
    </section>
    <section className="mb-4">
      <h2 className="text-sm font-semibold text-white">Insurance types requested</h2>
      <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted">
        {sections.map((section) => <li key={section.id}>{section.title} ({section.productCode}) · {deriveSectionStatus(section.id, request.lines)}</li>)}
      </ol>
    </section>
    {sections.map((section) => {
      const sectionLines = lines.filter((line) => line.sectionId === section.id);
      return <section key={section.id} className={`mb-3 rounded-lg border border-ink-600 p-3 ${deriveSectionStatus(section.id, request.lines) === 'Cancelled' ? 'opacity-60' : ''}`}>
        <h2 className="text-sm font-semibold text-white">{String(section.no).padStart(2, '0')} · {section.title}</h2>
        <p className="mt-1 text-xs text-muted">{section.productCode} · Sum insured {formatAmount(section.data.totalSumInsured, request.currency)}</p>
        {section.data.interests.map((interest, index) => <p key={`${section.id}-interest-${index}`} className="mt-1 text-xs text-muted">{interest.interest}: {formatAmount(interest.sumInsured, request.currency)}</p>)}
        {section.data.businessInterruption && <p className="mt-1 text-xs text-muted">Business interruption — gross profit {formatAmount(section.data.businessInterruption.grossProfit, request.currency)} · indemnity {section.data.businessInterruption.indemnityMonths} months</p>}
        {section.data.options.map((option) => <div key={option.id} className="mt-2 text-xs text-muted"><strong className="text-white">{option.label}</strong>
          {option.coverages.map((coverage) => <p key={coverage.name}>{coverage.name}: {formatAmount(coverage.limit, request.currency)}</p>)}</div>)}
        {Object.entries(section.data.materialInfo).filter(([, value]) => value).map(([key, value]) => <p key={key} className="mt-1 text-xs text-muted">{key}: {value}</p>)}
        {section.data.deductibles.length > 0 && <p className="mt-1 text-xs text-muted">Deductibles: {section.data.deductibles.filter(Boolean).join('; ')}</p>}
        {section.data.extensions.length > 0 && <p className="mt-1 text-xs text-muted">Extensions: {section.data.extensions.map((extension) => `${extension.name}${extension.limit ? ` (${extension.limit})` : ''}`).join('; ')}</p>}
        <p className="mt-2 text-xs text-muted">Insurers: {sectionLines.map((line) => `${vendorName(line.vendorId)} (${line.reference})`).join(', ') || 'No insurer line'}</p>
      </section>;
    })}
    {request.notes && <p className="my-3 text-xs text-muted"><strong className="text-white">Notes:</strong> {request.notes}</p>}
    <footer className="mt-8 grid grid-cols-1 gap-6 border-t border-ink-600 pt-4 text-xs sm:grid-cols-2">
      <div><span className="text-muted">Prepared by</span><p className="mt-2 font-medium text-white">{request.preparedBy || '____________________________'}</p></div>
      <div><span className="text-muted">Checked by</span><p className="mt-2 font-medium text-white">{request.checkedBy || '____________________________'}</p></div>
    </footer>
    {coverNames.length === 0 && <p className="text-sm text-muted">No active sections to display.</p>}
  </article>;
}
