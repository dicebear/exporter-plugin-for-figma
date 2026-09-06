import type { FillTarget } from '@shared/messages';

/** The selected targets a job can fill, locked layers left out. */
export function usableTargets(targets: FillTarget[]): FillTarget[] {
  return targets.filter((target) => !target.locked);
}
