/**
 * Selection events the plugin's own work causes are held back: an import
 * changes pages and the selection itself, a generate job selects what it
 * created. Whoever holds a suppression releases it, and the last release
 * schedules one report of where the selection ended up.
 */

let holders = 0;
let report: () => void = () => {};

/** Called once at startup with the way to schedule a selection report. */
export function onSelectionChange(handler: () => void): void {
  report = handler;
}

/** True while some task holds a suppression. */
export function selectionEventsSuppressed(): boolean {
  return holders > 0;
}

/** Holds selection events back until the returned function is called. */
export function suppressSelectionEvents(): () => void {
  holders++;

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    holders--;

    if (holders === 0) {
      report();
    }
  };
}

export async function withoutSelectionEvents<T>(fn: () => Promise<T>): Promise<T> {
  const release = suppressSelectionEvents();

  try {
    return await fn();
  } finally {
    release();
  }
}
