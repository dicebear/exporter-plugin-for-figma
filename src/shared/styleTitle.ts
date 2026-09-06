import { capitalCase } from 'change-case';

/** "big-ears-neutral" reads as "Big Ears Neutral" until the definition says otherwise. */
export function styleTitleFromName(name: string): string {
  return capitalCase(name);
}
