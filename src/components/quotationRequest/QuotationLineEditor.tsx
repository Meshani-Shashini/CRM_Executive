import { useState, type FormEvent } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import Modal from '../ui/Modal';
import DateInput from '../ui/DateInput';
import { useApp } from '../../store/AppContext';
import type {
  QuotationRequest, QuotationRequestLine, QuotationRequestLineStatus, QuotationRequestQuote,
} from '../../types';
import { MAX_QUOTATION_ATTACHMENT_SIZE, resolveQuotationAttachmentUrl, uploadQuotationAttachment } from '../../lib/quotationAttachments';
import { formatAmount } from '../../utils/currency';
import { normalizeDateInput } from '../../utils/date';
import { canTransitionQuotationRequestStatus } from '../../utils/quotationRequestStatus';
import { createDealQuotationSnapshot, deriveSectionStatus, formatQuotationLineActivity, formatQuotationLineReference, quotationRateFromPremium } from '../../utils/quotationRequests';

type QuoteDraft = { premium: string; validUntil: string };
type QuoteStatus = Extract<QuotationRequestLineStatus, 'Quoted' | 'Declined'>;

function optionsForLine(request: QuotationRequest, line: QuotationRequestLine) {
  const section = request.sections.find((item) => item.id === line.sectionId);
  return section?.data.options.length ? section.data.options : [{ id: 'base', label: 'Premium', coverages: [] }];
}

function initialQuoteDrafts(request: QuotationRequest, line: QuotationRequestLine) {
  return Object.fromEntries(optionsForLine(request, line).map((option) => {
    const quote = line.quotes.find((item) => item.optionId === option.id);
    const legacy = option.id === 'base' || option.id === 'option-01';
    return [option.id, {
      premium: quote?.premium === undefined && legacy && line.quotedPremium !== undefined
        ? String(line.quotedPremium)
        : quote?.premium === undefined ? '' : String(quote.premium),
      validUntil: normalizeDateInput(quote?.validUntil ?? line.validUntil ?? ''),
    }];
  }));
}

export default function QuotationLineEditor({
  request, line, initialStatus, onClose,
}: {
  request: QuotationRequest;
  line: QuotationRequestLine;
  initialStatus?: QuoteStatus;
  onClose: () => void;
}) {
  const {
    quotationRequests, setQuotationRequests, deals, setDeals, vendors, setActivities, user, viewAsRole,
  } = useApp();
  const section = request.sections.find((item) => item.id === line.sectionId);
  const options = optionsForLine(request, line);
  const [status, setStatus] = useState<QuoteStatus>(initialStatus ?? (line.status === 'Declined' ? 'Declined' : 'Quoted'));
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, QuoteDraft>>(() => initialQuoteDrafts(request, line));
  const [quoteCurrency, setQuoteCurrency] = useState<'MVR' | 'USD'>(
    line.quotes[0]?.currency ?? line.quotedCurrency ?? request.currency,
  );
  const [sumInsured, setSumInsured] = useState(String(
    line.quotedSumInsured ?? section?.data.totalSumInsured ?? 0,
  ));
  const [deductibles, setDeductibles] = useState((line.insurerDeductibles ?? []).join('\n'));
  const [terms, setTerms] = useState(line.insurerTerms ?? '');
  const [reference, setReference] = useState(line.insurerQuoteRef ?? '');
  const [declineReason, setDeclineReason] = useState(line.declineReason ?? '');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  const deal = deals.find((item) => item.id === request.dealId);
  const role = viewAsRole ?? user.role;
  const canEdit = user.role === 'admin' || role === 'admin' || role === 'sales' || deal?.ownerId === user.id;
  const canManageAllStatuses = user.role === 'admin' || role === 'admin' || deal?.ownerId === user.id;
  const insurer = vendors.find((item) => item.id === line.vendorId);

  const openAttachment = async (attachment: NonNullable<QuotationRequestLine['attachments']>[number]) => {
    const target = window.open('', '_blank');
    if (target) target.opener = null;
    if (!target) {
      setAttachmentError('Allow pop-ups to open or download this quotation attachment.');
      return;
    }
    setAttachmentError('');
    try {
      const url = await resolveQuotationAttachmentUrl(attachment);
      target.location.href = url;
    } catch (attachmentOpenError) {
      target.close();
      setAttachmentError(attachmentOpenError instanceof Error
        ? attachmentOpenError.message
        : 'Could not open the quotation attachment.');
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (!canEdit) {
      setError('You are not authorized to update this insurer quote.');
      return;
    }
    if (fileError) {
      setError(fileError);
      return;
    }
    const currentRequest = quotationRequests.find((item) => item.id === request.id);
    const currentLine = currentRequest?.lines.find((item) => item.id === line.id);
    if (!currentRequest || !currentLine) {
      setError('This quotation line is no longer available.');
      return;
    }
    if (currentLine.status !== status
      && !canTransitionQuotationRequestStatus(currentLine.status, status, role, canManageAllStatuses)) {
      setError('You are not allowed to make this quote status transition.');
      return;
    }
    const insuredAmount = Number(sumInsured);
    if (status === 'Quoted' && (!Number.isFinite(insuredAmount) || insuredAmount <= 0)) {
      setError('Enter a positive quoted sum insured.');
      return;
    }
    if (status === 'Quoted' && options.some((option) => {
      const draft = quoteDrafts[option.id];
      return !draft?.premium || !Number.isFinite(Number(draft.premium)) || Number(draft.premium) <= 0
        || !normalizeDateInput(draft.validUntil);
    })) {
      setError('Enter a positive premium and valid quote date for every option.');
      return;
    }
    if (status === 'Declined' && !declineReason.trim()) {
      setError('Enter the insurer decline reason.');
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    let uploadedAttachments: NonNullable<QuotationRequestLine['attachments']> = [];
    try {
      for (const file of pendingFiles) {
        uploadedAttachments = [
          ...uploadedAttachments,
          await uploadQuotationAttachment(file, request.id, line.id),
        ];
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload the quotation attachment.');
      setSaving(false);
      return;
    }
    setFileError('');
    const quotes: QuotationRequestQuote[] = status === 'Quoted'
      ? options.map((option) => {
        const draft = quoteDrafts[option.id];
        const premium = Number(draft.premium);
        const ratePct = quotationRateFromPremium(premium, insuredAmount);
        return {
          optionId: option.id,
          premium,
          currency: quoteCurrency,
          ...(ratePct === undefined ? {} : { ratePct }),
          validUntil: draft.validUntil,
        };
      })
      : currentLine.quotes;
    const primaryQuote = quotes[0];
    const statusChanged = currentLine.status !== status;
    const updatedLine: QuotationRequestLine = {
      ...currentLine,
      status,
      ...(status === 'Quoted' ? {
        quotes,
        quotedSumInsured: insuredAmount,
        quotedPremium: primaryQuote?.premium,
        quotedCurrency: primaryQuote?.currency,
        quotedRatePct: primaryQuote?.ratePct,
        ...(primaryQuote?.validUntil ? { validUntil: primaryQuote.validUntil } : {}),
      } : {}),
      insurerDeductibles: deductibles.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      insurerTerms: terms.trim(),
      insurerQuoteRef: reference.trim(),
      attachments: [...(currentLine.attachments ?? []), ...uploadedAttachments],
      ...(status === 'Declined' ? { declineReason: declineReason.trim() } : {}),
      ...(status === 'Quoted' ? { respondedAt: now } : {}),
      statusHistory: statusChanged ? [...currentLine.statusHistory, {
        fromStatus: currentLine.status,
        toStatus: status,
        changedAt: now,
        changedBy: user.id,
        ...(status === 'Declined' ? { reason: declineReason.trim() } : {}),
      }] : currentLine.statusHistory,
    };
    const updatedLines = currentRequest.lines.map((item) =>
      item.id === currentLine.id ? updatedLine : item,
    );
    const updatedRequest: QuotationRequest = {
      ...currentRequest,
      updatedAt: now,
      lines: updatedLines,
      sections: currentRequest.sections.map((item) => ({
        ...item,
        status: deriveSectionStatus(item.id, updatedLines),
      })),
    };
    setQuotationRequests((current) => current.map((item) =>
      item.id === updatedRequest.id ? updatedRequest : item,
    ));
    setDeals((current) => current.map((item) => item.id === updatedRequest.dealId
      ? {
        ...item,
        quotationSnapshot: createDealQuotationSnapshot(
          updatedRequest,
          updatedLine,
          insurer?.name ?? 'Unknown insurer',
          now,
        ),
      }
      : item));
    const ratePct = primaryQuote?.ratePct;
    const quoteDetail = status === 'Quoted'
      ? `${formatAmount(primaryQuote?.premium ?? 0, primaryQuote?.currency ?? quoteCurrency)}`
        + `${ratePct === undefined ? '' : ` · ${ratePct}%`}`
        + ` · Sum insured ${formatAmount(insuredAmount, currentRequest.currency)}`
        + `${reference.trim() ? ` · Ref ${reference.trim()}` : ''}`
      : `Declined${declineReason.trim() ? ` · ${declineReason.trim()}` : ''}`;
    setActivities((current) => [{
      id: `qrs-quote-${crypto.randomUUID()}`,
      clientId: updatedRequest.clientId,
      leadId: updatedRequest.leadId,
      dealId: updatedRequest.dealId,
      insurer: insurer?.name,
      type: 'quote',
      title: formatQuotationLineActivity(
        formatQuotationLineReference(updatedLine),
        status === 'Quoted' ? 'Carrier quote recorded' : 'Carrier quote declined',
      ),
      description: formatQuotationLineActivity(
        formatQuotationLineReference(updatedLine),
        `${insurer?.name ?? 'Insurer'}: ${quoteDetail}.`,
      ),
      date: now,
      createdAt: now,
      userId: user.id,
      actorName: user.name,
    }, ...current]);
    setSaving(false);
    onClose();
  };

  return <Modal
    open
    onClose={onClose}
    title={`${line.status === 'Quoted' ? 'Update Quote' : 'Record Vendor Quote'} · ${line.reference}`}
    subtitle={`${insurer?.name ?? 'Insurer'} · ${section?.title ?? 'Insurance section'}`}
    size="lg"
    footer={<>
      <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="submit" form="quotation-line-editor-form" className="btn-primary" disabled={saving}>
        {saving ? 'Saving…' : status === 'Quoted' ? 'Save Quote' : 'Save Decline'}
      </button>
    </>}
  >
    <form id="quotation-line-editor-form" onSubmit={save} className="space-y-4">
      <label className="block text-xs text-muted">Status *
        <select className="input mt-1" value={status} onChange={(event) => setStatus(event.target.value as QuoteStatus)}>
          <option value="Quoted" disabled={status !== 'Quoted'
            && !canTransitionQuotationRequestStatus(line.status, 'Quoted', role, canManageAllStatuses)}>Quoted</option>
          <option value="Declined" disabled={status !== 'Declined'
            && !canTransitionQuotationRequestStatus(line.status, 'Declined', role, canManageAllStatuses)}>Declined</option>
        </select>
      </label>
      {status === 'Declined' && <label className="block text-xs text-muted">Decline reason *
        <textarea className="input mt-1 min-h-20" required value={declineReason}
          onChange={(event) => setDeclineReason(event.target.value)} />
      </label>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted">Quoted sum insured {status === 'Quoted' ? '*' : ''}
          <input className="input mt-1" type="number" min="0.01" step="0.01" required={status === 'Quoted'}
            value={sumInsured} onChange={(event) => setSumInsured(event.target.value)} />
        </label>
        <label className="block text-xs text-muted">Quote currency *
          <select className="input mt-1" value={quoteCurrency}
            onChange={(event) => setQuoteCurrency(event.target.value as 'MVR' | 'USD')}>
            <option value="MVR">MVR</option><option value="USD">USD</option>
          </select>
        </label>
      </div>
      {options.map((option) => {
        const draft = quoteDrafts[option.id] ?? { premium: '', validUntil: '' };
        const rate = quotationRateFromPremium(Number(draft.premium), Number(sumInsured));
        return <fieldset key={option.id} className="grid gap-3 rounded-xl border border-ink-600 p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs text-brand-300">{option.label}</legend>
          <label className="block text-xs text-muted">Quoted premium {status === 'Quoted' ? '*' : ''}
            <input className="input mt-1" type="number" min="0.01" step="0.01"
              required={status === 'Quoted'} value={draft.premium}
              onChange={(event) => setQuoteDrafts((current) => ({
                ...current,
                [option.id]: { ...draft, premium: event.target.value },
              }))} />
          </label>
          <label className="block text-xs text-muted">Derived rate %
            <input className="input mt-1" value={rate === undefined ? '' : String(rate)} readOnly />
          </label>
          <label className="block text-xs text-muted sm:col-span-2">Quote validity date (DD-MMM-YYYY) {status === 'Quoted' ? '*' : ''}
            <DateInput className="input mt-1" required={status === 'Quoted'} value={draft.validUntil}
              onIsoChange={(validUntil) => setQuoteDrafts((current) => ({
                ...current,
                [option.id]: { ...draft, validUntil },
              }))} aria-label={`${option.label} validity date`} />
          </label>
        </fieldset>;
      })}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted">Deductibles / excess (one per line)
          <textarea className="input mt-1 min-h-20" value={deductibles}
            onChange={(event) => setDeductibles(event.target.value)} />
        </label>
        <label className="block text-xs text-muted">Coverage terms / conditions
          <textarea className="input mt-1 min-h-20" value={terms}
            onChange={(event) => setTerms(event.target.value)} />
        </label>
      </div>
      <label className="block text-xs text-muted">Insurer reference number
        <input className="input mt-1" value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>
      <section className="space-y-2 rounded-xl border border-ink-600 p-3">
        <h4 className="text-xs font-medium text-white">Quote documents</h4>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ink-600 p-3 text-xs text-muted hover:text-white">
          <Paperclip size={14} /> Add PDF or document (up to 8 MB each)
          <input className="sr-only" type="file" multiple
            onChange={(event) => {
              const addedFiles = Array.from(event.target.files ?? []);
              const oversized = addedFiles.find((file) => file.size > MAX_QUOTATION_ATTACHMENT_SIZE);
              if (oversized) setFileError(`${oversized.name} exceeds the 8 MB attachment limit.`);
              else {
                setFileError('');
                setPendingFiles((current) => [...current, ...addedFiles]);
              }
              event.target.value = '';
            }} />
        </label>
        {pendingFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-muted">{file.name}</span>
          <button type="button" className="btn-ghost !px-1 !py-1" aria-label={`Remove ${file.name}`}
            onClick={() => {
              setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
              setFileError('');
            }}>
            <X size={12} />
          </button>
        </div>)}
        {(line.attachments ?? []).map((attachment) => <button key={attachment.id} type="button"
          className="flex w-full items-center gap-2 text-left text-xs text-brand-300 hover:text-white"
          onClick={() => void openAttachment(attachment)}>
          <FileText size={13} /><span className="truncate">{attachment.name}</span>
          <span className="ml-auto shrink-0 text-muted">View / download</span>
        </button>)}
        {attachmentError && <p role="alert" className="text-xs text-hot">{attachmentError}</p>}
        {fileError && <p role="alert" className="text-xs text-hot">{fileError}</p>}
      </section>
      {error && <p role="alert" className="text-sm text-hot">{error}</p>}
    </form>
  </Modal>;
}
