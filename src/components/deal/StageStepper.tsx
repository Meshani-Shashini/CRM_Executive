import { Check, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { PipelineStage } from '../../types';
import { getStageSlaElapsedDays, isLostPipelineStage, isStageSlaOverdue } from '../../utils/stageSla';

export type DealStageStatus = 'open' | 'won' | 'lost';

interface StageStepperProps {
  pipelineStages: PipelineStage[];
  currentStageId?: string;
  dealStatus: DealStageStatus;
  lossReason?: string;
  stageEnteredAt?: string;
  now?: number;
  canEdit: boolean;
  onSelect: (stage: PipelineStage) => void;
}

export default function StageStepper({
  pipelineStages,
  currentStageId,
  dealStatus,
  lossReason,
  stageEnteredAt,
  now = Date.now(),
  canEdit,
  onSelect,
}: StageStepperProps) {
  const stages = pipelineStages
    .filter((stage) => !isLostPipelineStage(stage))
    .sort((left, right) => left.stageOrder - right.stageOrder);
  const lostStage = pipelineStages.find((stage) => isLostPipelineStage(stage));
  if (lostStage) stages.push(lostStage);
  const currentStage = pipelineStages.find((stage) => stage.id === currentStageId);
  const progressStages = stages.filter((stage) => !isLostPipelineStage(stage));
  const currentIndex = progressStages.findIndex((stage) => stage.id === currentStageId);
  const elapsedDays = getStageSlaElapsedDays(stageEnteredAt, now);
  const targetDays = currentStage?.stagnationDaysThreshold ?? 0;
  const overdue = dealStatus === 'open' && isStageSlaOverdue(stageEnteredAt, targetDays, now);

  const handleKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '.deal-stage-stepper__button:not(:disabled)',
    )];
    const currentButtonIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentButtonIndex < 0 || !buttons.length) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    buttons[(currentButtonIndex + direction + buttons.length) % buttons.length]?.focus();
  };

  const activeStageLine = currentStage && dealStatus === 'open'
    ? `Win ${currentStage.winProbabilityPct}% · ${elapsedDays === null ? '—' : elapsedDays}${targetDays > 0 ? `/${targetDays}d` : 'd'} in stage`
    : dealStatus === 'lost' ? 'Win 0%' : undefined;

  return (
    <div className="deal-stage-stepper-container min-w-0 w-full">
      <ol
        className="deal-stage-stepper"
        role="list"
        aria-label="Deal pipeline stages"
        onKeyDown={handleKeyDown}
      >
        {stages.map((stage, index) => {
          const isLost = isLostPipelineStage(stage);
          const isCurrent = stage.id === currentStageId && !isLost;
          const isWon = dealStatus === 'won';
          const isComplete = isWon || (dealStatus === 'open' && currentIndex >= 0 && index < currentIndex);
          const state = isLost
            ? dealStatus === 'lost'
              ? 'lost-closed'
              : dealStatus === 'won'
                ? 'lost-won'
                : 'lost-open'
            : dealStatus === 'lost'
              ? 'dimmed'
              : isComplete
                ? 'complete'
                : isCurrent
                  ? 'current'
                  : 'upcoming';
          const label = stage.shortLabel || stage.name;
          const tooltip = stage.purpose ? `${stage.name} · ${stage.purpose}` : stage.name;
          const disabled = !canEdit || dealStatus !== 'open' || (isCurrent && !isLost);

          return (
            <li className={`deal-stage-stepper__step is-${state}`} key={stage.id}>
              <button
                type="button"
                className="deal-stage-stepper__button"
                onClick={() => onSelect(stage)}
                disabled={disabled || (isLost && dealStatus !== 'open')}
                aria-current={(isCurrent && dealStatus === 'open') || (isLost && dealStatus === 'lost') ? 'step' : undefined}
                aria-label={`${stage.name}${stage.purpose ? `; ${stage.purpose}` : ''}${isCurrent ? '; current stage' : isLost && dealStatus === 'lost' ? '; lost stage' : ''}`}
                title={tooltip}
              >
                <span className="deal-stage-stepper__node" aria-hidden="true">
                  {state === 'complete'
                    ? <Check size={14} strokeWidth={3} />
                    : isLost
                      ? <X size={14} strokeWidth={2.5} />
                      : index + 1}
                </span>
                <span className="deal-stage-stepper__text">
                  <span className="deal-stage-stepper__label">{label}</span>
                  {isLost && <span className="deal-stage-stepper__probability">0%</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {activeStageLine && <p className={`deal-stage-stepper__summary${overdue ? ' is-overdue' : ''}`} aria-live="polite">
        {activeStageLine}
      </p>}
      {dealStatus === 'lost' && <p className="deal-stage-stepper__lost" role="status">Lost: {lossReason || 'Reason not recorded'}</p>}
    </div>
  );
}
