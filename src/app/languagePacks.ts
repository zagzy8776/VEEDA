// Language-pack framework (Phases 6 & 8).
//
// VEEDA ships ONLY English UI text. Every other language is a pack: a map from
// stable string keys to translated strings, authored and reviewed like any other
// content. When a language pack is missing or invalid the app falls back to English
// (which is present in code) rather than showing blank or made-up text.
//
// Voice input/output is a browser capability; where the browser supports it the
// session uses the selected language code, and where it does not the UI says so.

import { validateContentPack, type ContentPackMeta } from './contentPack.ts';

/** Languages the framework can load a pack for. Codes are BCP-47-ish. */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pcm', label: 'Pidgin' },
  { code: 'ig', label: 'Igbo' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'ha', label: 'Hausa' },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export interface LanguagePack {
  meta: ContentPackMeta;
  /** language code -> key -> translated string. */
  strings: Record<string, Record<string, string>>;
}

export type LanguageLoadResult =
  | { ok: true; pack: LanguagePack }
  | { ok: false; reason: string };

function isStringMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).every(v => typeof v === 'string');
}

/**
 * Validate a language pack. Each `entries[0]` is one language's map: { code, strings }.
 * A pack that is not clinically-reviewed is refused in production like any other
 * content (safety wording must be reviewed per language).
 */
export function loadLanguagePack(raw: unknown, options: { production?: boolean } = {}): LanguageLoadResult {
  const base = validateContentPack<unknown[]>(raw, { production: options.production, label: 'language pack' });
  if (base.ok === false) return { ok: false, reason: base.reason };
  const strings: Record<string, Record<string, string>> = {};
  for (const entry of base.pack.entries) {
    const e = entry as Record<string, unknown>;
    if (typeof e?.code !== 'string' || !isStringMap(e?.strings)) {
      return { ok: false, reason: 'language pack contains an invalid language entry' };
    }
    strings[e.code] = e.strings as Record<string, string>;
  }
  return { ok: true, pack: { meta: base.pack.meta, strings } };
}

/** True when the browser can speak/recognise the given language for voice. */
export function browserSupportsLanguage(code: string, available: string[] | undefined): boolean {
  if (!available) return false;
  const lower = code.toLowerCase();
  return available.some(a => a.toLowerCase() === lower || a.toLowerCase().startsWith(`${lower}-`));
}

/**
 * Resolve a string key for a language. Falls back to English, then to the key
 * itself so nothing is ever blank.
 */
export function translate(
  result: LanguageLoadResult,
  code: string,
  key: string,
  english: Record<string, string>,
): string {
  if (result.ok) {
    const table = result.pack.strings[code];
    if (table && table[key]) return table[key];
  }
  return english[key] ?? key;
}
