/**
 * Saved preferences in localStorage. Every read and write is wrapped in
 * try/catch, so private browsing, blocked cookies or a full quota never break
 * the app: reads fall back to a default and writes are simply skipped.
 */

const PREFIX = 'pathfinding-visualizer.';

/**
 * Reads a saved preference.
 * @template T
 * @param {string} key
 * @param {T} fallback Returned when nothing usable is stored.
 * @param {(value: unknown) => boolean} [isValid] Rejects stale or hand-edited values.
 * @param {Pick<Storage, 'getItem'>} [store] Defaults to `globalThis.localStorage`.
 * @returns {T}
 */
export function loadSetting(key, fallback, isValid = () => true, store = undefined) {
  try {
    const raw = (store ?? globalThis.localStorage).getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Saves a preference.
 * @param {string} key
 * @param {unknown} value Anything JSON can represent.
 * @param {Pick<Storage, 'setItem'>} [store] Defaults to `globalThis.localStorage`.
 * @returns {boolean} Whether the value was stored.
 */
export function saveSetting(key, value, store = undefined) {
  try {
    (store ?? globalThis.localStorage).setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
