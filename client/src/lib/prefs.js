/* Display preferences kept in this browser: dark mode and bigger text (Profile menu). */
const KEY = 'nm.display';
export function getPrefs() {
  try { return { dark: false, big: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { dark: false, big: false }; }
}
/** Apply to the page: <html data-theme="dark"> and <html class="big-text">. */
export function applyPrefs(p = getPrefs()) {
  const h = document.documentElement;
  h.dataset.theme = p.dark ? 'dark' : 'light';
  h.classList.toggle('big-text', !!p.big);
}
export function setPrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: applies for this visit only */ }
  applyPrefs(p);
}
