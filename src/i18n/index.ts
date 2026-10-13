import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/** UI languages offered in Settings. Labels are shown in their own language. */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: Language = "en";

/** localStorage mirror of the persisted setting, so the first paint is already
 *  in the right language (the backend settings load asynchronously). */
const STORAGE_KEY = "anyscp.language";

export function normalizeLanguage(value: string | null | undefined): Language | null {
  if (!value) return null;
  const base = value.toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.some((l) => l.code === base) ? (base as Language) : null;
}

/** Best guess before settings load: last choice, else the OS language. */
function initialLanguage(): Language {
  try {
    const stored = normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* storage unavailable */
  }
  if (typeof navigator !== "undefined") {
    const os = normalizeLanguage(navigator.language);
    if (os) return os;
  }
  return DEFAULT_LANGUAGE;
}

// Every locales/<language>/<namespace>.json is registered automatically.
const modules = import.meta.glob<{ default: Record<string, unknown> }>(
  "./locales/*/*.json",
  { eager: true },
);
const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lng, ns] = match;
  (resources[lng] ??= {})[ns] = mod.default;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  ns: Object.keys(resources[DEFAULT_LANGUAGE] ?? {}),
  defaultNS: "common",
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  initAsync: false,
});

if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language;
}

/** Switch the UI language and remember it for the next launch's first paint. */
export function applyLanguage(language: Language) {
  if (i18n.language !== language) void i18n.changeLanguage(language);
  if (typeof document !== "undefined") document.documentElement.lang = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* storage unavailable */
  }
}

export default i18n;
