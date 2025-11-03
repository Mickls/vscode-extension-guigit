/**
 * Lightweight i18n helper for webview scripts.
 * Falls back to provided default text when translation is unavailable.
 *
 * @param {string} key - Translation key (e.g. 'headers.hash')
 * @param {string} fallback - Default text if translation is missing
 * @param {...any} args - Optional interpolation values for placeholders like {0}
 * @returns {string} Translated text or fallback value
 */
export function translate(key, fallback, ...args) {
    try {
        if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
            const result = window.i18n.t(key, ...args);
            if (result && result !== key) {
                return result;
            }
        }
    } catch (error) {
        console.warn('Translation lookup failed:', key, error);
    }
    return fallback;
}
