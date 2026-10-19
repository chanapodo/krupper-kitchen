/**
 * Spot a newer deploy while the app stays open (an installed app can live in the
 * background for days): compare the bundled version with dist/version.json.
 */
export const APP_VERSION = __APP_VERSION__;

async function latestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { version?: string }).version ?? null : null;
  } catch {
    return null;
  }
}

/** Nothing typed would be lost: no open sheet and not in the recipe editor. */
const safeToReload = () => !document.querySelector('[role="dialog"]') && !location.hash.startsWith('#/edit');

let watching = false;

export function watchForUpdates(onUpdate: () => void) {
  if (watching || !import.meta.env.PROD || APP_VERSION === 'dev') return;
  watching = true;
  let found = false;
  const check = async (resumed: boolean) => {
    if (found) {
      if (resumed && safeToReload()) location.reload();
      return;
    }
    const v = await latestVersion();
    if (!v || v === APP_VERSION) return;
    found = true;
    if (resumed && safeToReload()) location.reload();
    else onUpdate();
  };
  setTimeout(() => check(false), 3000);
  setInterval(() => check(false), 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check(true);
  });
}
