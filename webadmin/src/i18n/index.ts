/**
 * Locale registry and store. The store is the single source of truth for the
 * active locale: React binds to it via <AppIntlProvider>, while non-React
 * modules (api errors, format helpers) read it through {@link t}.
 */
import { createIntl, createIntlCache } from "react-intl";
import en from "./en";
import zhCN from "./zh-CN";

export type AppLocale = "en" | "zh-CN";

export const DEFAULT_LOCALE: AppLocale = "en";

/** Languages offered by the navbar switcher, always shown in their own tongue. */
export const LOCALES: { value: AppLocale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" }
];

export const messages: Record<AppLocale, Record<string, string>> = {
  en,
  "zh-CN": zhCN
};

const LOCALE_KEY = "nms_locale";

export function isAppLocale(value: string | null): value is AppLocale {
  return value === "en" || value === "zh-CN";
}

/** localStorage preference first, then the browser language, then English. */
function detectLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (isAppLocale(saved)) return saved;
  } catch {
    /* storage unavailable (private mode) — fall through to detection */
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : DEFAULT_LOCALE;
}

/* Standalone intl instance used by t(); rebuilt on every locale change. */
const cache = createIntlCache();
let standalone = createIntl({ locale: "en", messages: en }, cache);

let currentLocale = detectLocale();
document.documentElement.lang = currentLocale;
standalone = createIntl({ locale: currentLocale, messages: messages[currentLocale] }, cache);

const listeners = new Set<() => void>();

/** Active locale (also usable outside React). */
export function getLocale(): AppLocale {
  return currentLocale;
}

function setLocale(next: AppLocale): void {
  if (next === currentLocale) return;
  currentLocale = next;
  try {
    localStorage.setItem(LOCALE_KEY, next);
  } catch {
    /* storage unavailable — keep the change for this session only */
  }
  document.documentElement.lang = next;
  standalone = createIntl({ locale: next, messages: messages[next] }, cache);
  listeners.forEach(l => l());
}

export const localeStore = {
  get: getLocale,
  set: setLocale,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

/**
 * Translate a message id outside React components. Reads the live locale, so
 * it is safe inside long-lived callbacks (poll timers, error handlers).
 * @param id - message key from en.ts
 * @param values - placeholder values, e.g. { count: 3 }
 * @returns the formatted message in the active locale
 */
export function t(id: string, values?: Record<string, string | number>): string {
  return standalone.formatMessage({ id }, values);
}
