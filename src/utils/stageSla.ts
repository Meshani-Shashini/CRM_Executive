import type { PipelineStage } from '../types';

type StageStatus = Pick<PipelineStage, 'name' | 'isClosedWon' | 'isClosedLost'>;

function hasStageFlags(stage: StageStatus) {
  return stage.isClosedWon !== undefined || stage.isClosedLost !== undefined;
}

export function isWonPipelineStage(stage: StageStatus | string) {
  if (typeof stage !== 'string' && hasStageFlags(stage)) return stage.isClosedWon === true;
  const name = typeof stage === 'string' ? stage : stage.name;
  const normalized = name.toLowerCase();
  return ['policy bound', 'immediate cover', 'policy issued', 'renewed', 'bound', 'won']
    .some((terminal) => normalized.includes(terminal));
}

export function isLostPipelineStage(stage: StageStatus | string) {
  if (typeof stage !== 'string' && hasStageFlags(stage)) return stage.isClosedLost === true;
  const name = typeof stage === 'string' ? stage : stage.name;
  const normalized = name.toLowerCase();
  return normalized.includes('lost') || normalized.includes('declined');
}

export function isTerminalDealStage(
  stageName: string,
  disposition?: 'won' | 'lost',
  stage?: StageStatus,
) {
  return disposition !== undefined || (stage
    ? isWonPipelineStage(stage) || isLostPipelineStage(stage)
    : isWonPipelineStage(stageName) || isLostPipelineStage(stageName));
}

export function isStageSlaOverdue(enteredAt: string | undefined, targetDays: number, now = Date.now()) {
  if (!enteredAt || targetDays <= 0) return false;
  const enteredAtTime = Date.parse(enteredAt);
  return Number.isFinite(enteredAtTime) && now - enteredAtTime > targetDays * 86400000;
}

export function getStageSlaElapsedDays(enteredAt: string | undefined, now = Date.now()) {
  if (!enteredAt) return null;
  const enteredAtTime = Date.parse(enteredAt);
  return Number.isFinite(enteredAtTime)
    ? Math.max(0, Math.floor((now - enteredAtTime) / 86400000))
    : null;
}
