import { useState } from 'react';
import { FilePlus2, FileText } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import type {
  QuotationRequest, QuotationRequestLine, QuotationRequestQuote, QuotationSection,
} from '../../types';
import { resolveQuotationAttachmentUrl } from '../../lib/quotationAttachments';
import { formatAmount } from '../../utils/currency';
import { formatSlashDateInput } from '../../utils/date';
import {
  lowestQuotedPremiumsByComparison, quotationComparisonKey, quotationRateFromPremium,
} from '../../utils/quotationRequestDashboard';
import { formatQuotationLineReference, getQuotationLineDisplayStatus } from '../../utils/quotationRequests';

type Props = {
  requests: QuotationRequest[];
  onCreateQuotation?: (request: QuotationRequest, line: QuotationRequestLine) => void;
};

type QuoteEntry = {
  line: QuotationRequestLine;
  quote: QuotationRequestQuote;
  label: string;
  sumInsured: number;
};

function lineQuotes(section: QuotationSection, line: QuotationRequestLine): QuoteEntry[] {
  if (line.quotes.length) {
    return line.quotes.map((quote) => ({
      line,
      quote,
      label: section.data.options.find((option) => option.id === quote.optionId)?.label ?? quote.optionId,
      sumInsured: line.quotedSumInsured ?? section.data.totalSumInsured,
    }));
  }
  if (line.quotedPremium !== undefined) {
    const option = section.data.options[0];
    return [{
      line,
      quote: {
        optionId: option?.id ?? 'base',
        premium: line.quotedPremium,
        currency: line.quotedCurrency ?? 'MVR',
        ...(line.quotedRatePct !== undefined ? { ratePct: line.quotedRatePct } : {}),
        ...(line.validUntil ? { validUntil: line.validUntil } : {}),
      },
      label: option?.label ?? 'Premium',
      sumInsured: line.quotedSumInsured ?? section.data.totalSumInsured,
    }];
  }
  return [];
}

export default function VendorQuoteComparison({ requests, onCreateQuotation }: Props) {
  const { vendors } = useApp();
  const [attachmentError, setAttachmentError] = useState('');
  const groups = requests.flatMap((request) => request.sections.flatMap((section) => {
    const lines = request.lines.filter((line) => line.sectionId === section.id
      && getQuotationLineDisplayStatus(line) === 'Quoted');
    return lines.length ? [{ request, section, lines }] : [];
  }));

  const openAttachment = async (attachment: NonNullable<QuotationRequestLine['attachments']>[number]) => {
    const target = window.open('', '_blank');
    if (target) target.opener = null;
    if (!target) {
      setAttachmentError('Allow pop-ups to open or download a quotation attachment.');
      return;
    }
    setAttachmentError('');
    try {
      target.location.href = await resolveQuotationAttachmentUrl(attachment);
    } catch (error) {
      target.close();
      setAttachmentError(error instanceof Error ? error.message : 'Could not open the quotation attachment.');
    }
  };

  return <section className="mt-4 rounded-lg border border-ink-600 bg-ink-900/30 p-3">
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-white">Side-by-side vendor quote comparison</h3>
      <p className="mt-1 text-[10px] text-muted">Lowest premium is highlighted only for matching sections, coverage options, sum insured, and currency.</p>
    </div>
    {attachmentError && <p role="alert" className="mb-2 text-xs text-hot">{attachmentError}</p>}
    {groups.length ? <div className="space-y-4">
      {groups.map(({ request, section, lines }) => {
        const entries = lines.flatMap((line) => lineQuotes(section, line));
        const lowestByKey = lowestQuotedPremiumsByComparison(entries);
        return <div key={`${request.id}-${section.id}`} className="overflow-x-auto">
          <div className="mb-2 text-xs font-medium text-white">
            {section.productCode} · {section.title}
            <span className="ml-1 font-mono text-[10px] text-muted">{request.reference}</span>
          </div>
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="text-[10px] text-muted"><tr>
              <th className="px-2 py-2 font-medium">Insurer</th>
              <th className="px-2 py-2 font-medium">Quoted premium</th>
              <th className="px-2 py-2 font-medium">Sum insured</th>
              <th className="px-2 py-2 font-medium">Rate %</th>
              <th className="px-2 py-2 font-medium">Deductibles / excess</th>
              <th className="px-2 py-2 font-medium">Validity</th>
              <th className="px-2 py-2 font-medium">Key terms</th>
              <th className="px-2 py-2 font-medium">Vendor quote documents</th>
              {onCreateQuotation && <th className="px-2 py-2 font-medium">Client quotation</th>}
            </tr></thead>
            <tbody>{lines.map((line) => {
              const vendor = vendors.find((item) => item.id === line.vendorId);
              const lineEntries = lineQuotes(section, line);
              const sumInsured = line.quotedSumInsured ?? section.data.totalSumInsured;
              const warranties = (line.insurerWarranties ?? [])
                .map((warranty) => `${warranty.title}: ${warranty.text}`)
                .filter(Boolean);
              const terms = [line.insurerTerms, ...warranties].filter(Boolean).join(' · ');
              return <tr key={line.id} className="border-t border-ink-700/70 align-top text-white">
                <td className="px-2 py-2">
                  <div className="font-medium">{vendor?.name ?? 'Unknown insurer'}</div>
                  <div className="font-mono text-[10px] text-muted">{formatQuotationLineReference(line)}</div>
                </td>
                <td className="px-2 py-2">
                  {lineEntries.length ? lineEntries.map(({ quote, label }) => {
                    const isLowest = quote.premium === lowestByKey.get(quotationComparisonKey(quote, sumInsured));
                    return <div key={quote.optionId} className={`mb-1 last:mb-0 ${isLowest ? 'rounded bg-win/10 px-1.5 py-1 font-semibold text-win' : 'text-brand-300'}`}>
                      <span className="text-[10px] text-muted">{label}: </span>
                      {formatAmount(quote.premium, quote.currency)}
                      {isLowest && <span className="ml-1 text-[10px]">· Lowest premium</span>}
                    </div>;
                  }) : <span className="text-muted">Not supplied</span>}
                </td>
                <td className="px-2 py-2 text-muted">{formatAmount(sumInsured, request.currency)}</td>
                <td className="px-2 py-2 text-muted">
                  {lineEntries.length ? lineEntries.map(({ quote, label }) => {
                    const rate = quote.ratePct ?? quotationRateFromPremium(quote.premium, sumInsured);
                    return <div key={quote.optionId}>{label}: {rate === undefined ? '—' : `${rate}%`}</div>;
                  }) : '—'}
                </td>
                <td className="max-w-48 whitespace-normal px-2 py-2 text-muted">
                  {line.insurerDeductibles?.length ? line.insurerDeductibles.join('; ') : 'Not supplied'}
                </td>
                <td className="px-2 py-2 text-muted">
                  {lineEntries.length ? lineEntries.map(({ quote }) => <div key={quote.optionId}>
                    {formatSlashDateInput(quote.validUntil ?? line.validUntil) || 'Not supplied'}
                  </div>) : formatSlashDateInput(line.validUntil) || 'Not supplied'}
                </td>
                <td className="max-w-64 whitespace-normal px-2 py-2 text-muted">{terms || 'Not supplied'}</td>
                <td className="px-2 py-2">
                  {line.attachments?.length ? line.attachments.map((attachment) => <button
                    key={attachment.id}
                    type="button"
                    className="mb-1 flex max-w-56 items-center gap-1 text-left text-brand-300 hover:text-white"
                    onClick={() => void openAttachment(attachment)}
                    title={`View or download ${attachment.name}`}
                  >
                    <FileText size={13} className="shrink-0" />
                    <span className="truncate">{attachment.name}</span>
                  </button>) : <span className="text-muted">None</span>}
                </td>
                {onCreateQuotation && <td className="px-2 py-2">
                  <button type="button" className="btn-ghost !px-2 !py-1 text-[10px]"
                    onClick={() => onCreateQuotation(request, line)}>
                    <FilePlus2 size={12} /> Create Client Quotation (QTY)
                  </button>
                </td>}
              </tr>;
            })}</tbody>
          </table>
        </div>;
      })}
    </div> : <p className="text-xs text-muted">No quoted insurer lines are available for comparison yet.</p>}
  </section>;
}
