import { useId } from 'react';
import { Info } from 'lucide-react';

export default function PageInfoButton({ description }: { description: string }) {
  const tooltipId = useId();

  return (
    <span className="group relative inline-flex shrink-0">
      <button
        type="button"
        className="rounded-full p-1 text-muted transition hover:bg-ink-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
        title={description}
        aria-label={description}
        aria-describedby={tooltipId}
      >
        <Info size={14} />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 whitespace-normal rounded-lg border border-ink-600 bg-ink-900 p-2 text-left text-xs font-normal text-white shadow-xl group-hover:block group-focus-within:block"
      >
        {description}
      </span>
    </span>
  );
}
