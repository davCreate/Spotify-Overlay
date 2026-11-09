/*
 * Translations for the app UI.
 * Shared between the main process (CommonJS) and renderer pages (global `SO_I18N`).
 *
 * The English text itself is the key: translate(lang, 'Show overlay') returns the
 * translation from locales/<lang>.js, or the English text when there is none.
 * Placeholders such as {version} are filled from `vars`.
 *
 * Renderer pages must load locales/es.js, locales/fr.js and locales/ru.js before this file.
 */
(function (root, factory) {
  const locales = typeof module === 'object' && module.exports
    ? { es: require('./locales/es'), fr: require('./locales/fr'), ru: require('./locales/ru') }
    : root.SO_LOCALES || {};
  const api = factory(locales);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SO_I18N = api;
})(typeof self !== 'undefined' ? self : this, function (locales) {
  'use strict';

  /** Languages offered in Settings. Names are written in their own language. */
  const LANGUAGES = [
    { id: 'en', name: 'English' },
    { id: 'es', name: 'Español' },
    { id: 'fr', name: 'Français' },
    { id: 'ru', name: 'Русский' }
  ];
  const SUPPORTED = LANGUAGES.map((l) => l.id);

  /** Turns the `general.language` setting ('auto' or a code) into a supported language code. */
  function resolveLanguage(setting, systemLocale) {
    if (SUPPORTED.includes(setting)) return setting;
    const base = String(systemLocale || '').toLowerCase().split(/[-_]/)[0];
    return SUPPORTED.includes(base) ? base : 'en';
  }

  function translate(lang, text, vars) {
    if (typeof text !== 'string' || !text) return text;
    const dict = locales[lang];
    let out = (dict && dict[text]) || text;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return out;
  }

  return { LANGUAGES, SUPPORTED, LOCALES: locales, resolveLanguage, translate };
});
