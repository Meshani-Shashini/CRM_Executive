export interface StageVisit {
  recordId: string;
  stageName: string;
  enteredAt: string;
  exitedAt?: string | null;
  targetDays?: number;
}

export interface DurationStats {
  sampleCount: number;
  averageDays?: number;
  medianDays?: number;
}

export interface StageDurationSummary {
  stages: Array<DurationStats & { stageName: string; stagnantCount: number }>;
  transitions: Array<DurationStats & { fromStage: string; toStage: string }>;
  stagnantCount: number;
}

export function summarizeDurations(values: number[]): DurationStats {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { sampleCount: 0 };
  const middle = Math.floor(sorted.length / 2);
  const medianDays = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    sampleCount: sorted.length,
    averageDays: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    medianDays,
  };
}

export function summarizeStageVisits(visits: StageVisit[], now = Date.now()): StageDurationSummary {
  const validVisits = visits.flatMap((visit) => {
    const enteredAt = Date.parse(visit.enteredAt);
    const exitedAt = visit.exitedAt ? Date.parse(visit.exitedAt) : Number.NaN;
    if (!Number.isFinite(enteredAt)) return [];
    const end = Number.isFinite(exitedAt) ? exitedAt : now;
    if (end < enteredAt) return [];
    return [{ ...visit, enteredAtMilliseconds: enteredAt, durationDays: (end - enteredAt) / 86400000 }];
  });
  const byStage = new Map<string, number[]>();
  const stagnantByStage = new Map<string, Set<string>>();
  const byRecord = new Map<string, typeof validVisits>();
  for (const visit of validVisits) {
    const durations = byStage.get(visit.stageName) ?? [];
    durations.push(visit.durationDays);
    byStage.set(visit.stageName, durations);
    if (!visit.exitedAt && visit.targetDays && visit.durationDays > visit.targetDays) {
      const stagnant = stagnantByStage.get(visit.stageName) ?? new Set<string>();
      stagnant.add(visit.recordId);
      stagnantByStage.set(visit.stageName, stagnant);
    }
    const recordVisits = byRecord.get(visit.recordId) ?? [];
    recordVisits.push(visit);
    byRecord.set(visit.recordId, recordVisits);
  }
  const transitionSamples = new Map<string, { fromStage: string; toStage: string; values: number[] }>();
  for (const recordVisits of byRecord.values()) {
    recordVisits.sort((a, b) => a.enteredAtMilliseconds - b.enteredAtMilliseconds);
    for (let index = 0; index < recordVisits.length - 1; index += 1) {
      const current = recordVisits[index];
      const next = recordVisits[index + 1];
      const days = (next.enteredAtMilliseconds - current.enteredAtMilliseconds) / 86400000;
      if (days < 0) continue;
      const key = `${current.stageName}\0${next.stageName}`;
      const sample = transitionSamples.get(key) ?? {
        fromStage: current.stageName,
        toStage: next.stageName,
        values: [],
      };
      sample.values.push(days);
      transitionSamples.set(key, sample);
    }
  }
  const stages = [...byStage].map(([stageName, durations]) => ({
    stageName,
    ...summarizeDurations(durations),
    stagnantCount: stagnantByStage.get(stageName)?.size ?? 0,
  }));
  const transitions = [...transitionSamples.values()].map(({ fromStage, toStage, values }) => ({
    fromStage,
    toStage,
    ...summarizeDurations(values),
  }));
  return {
    stages,
    transitions,
    stagnantCount: [...stagnantByStage.values()].reduce((total, records) => total + records.size, 0),
  };
}