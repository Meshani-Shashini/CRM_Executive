export function isTerminalDealStage(stageName: string, disposition?: 'won' | 'lost') {
  const stage = stageName.toLowerCase();
  return disposition !== undefined || ['lost', 'declined', 'bound', 'won', 'renewed', 'immediate cover', 'policy issued']
    .some((terminal) => stage.includes(terminal));
}

export function isStageSlaOverdue(enteredAt: string | undefined, targetDays: number, now = Date.now()) {
  if (!enteredAt || targetDays <= 0) return false;
  const enteredAtTime = Date.parse(enteredAt);
  return Number.isFinite(enteredAtTime) && now - enteredAtTime >= targetDays * 86400000;
}

export function getStageSlaElapsedDays(enteredAt: string | undefined, now = Date.now()) {
  if (!enteredAt) return null;
  const enteredAtTime = Date.parse(enteredAt);
  return Number.isFinite(enteredAtTime)
    ? Math.max(0, Math.floor((now - enteredAtTime) / 86400000))
    : null;
}
