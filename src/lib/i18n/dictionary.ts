import { en } from './dictionaries/en';
import { fr } from './dictionaries/fr';
import type { Locale } from './locales';

/**
 * The shape every language must have. English is the schema by construction — there is
 * no separate declaration to keep in step with it.
 *
 * `DeepMutable` strips the `as const` readonly modifiers from en.ts. Without it, fr.ts
 * would have to be `as const` too *and* match English's literal string types, i.e. the
 * French translations would have to be the English words.
 */
export type Dictionary = DeepMutable<typeof en>;

type DeepMutable<T> = T extends string ? string : { -readonly [K in keyof T]: DeepMutable<T[K]> };

/**
 * Every leaf path in the dictionary, as a dotted string: 'orders.row.noDriver'.
 *
 * This is what makes a typo in a key a compile error rather than a `t()` call that
 * renders its own key to a dispatcher at 2am.
 */
export type MessageKey = Paths<Dictionary>;

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

/**
 * The subset of keys that come in `_one` / `_other` pairs, named without the suffix —
 * so `tCount('orders.row.items', n)` is checked, and a base key with no plural forms
 * can't be passed to it by mistake.
 */
export type CountKey = MessageKey extends infer K
  ? K extends `${infer Base}_one`
    ? Base
    : never
  : never;

export const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };

/** Values substituted into `{placeholder}` slots. */
export type Vars = Record<string, string | number>;

/**
 * Resolves a dotted key against a dictionary.
 *
 * Returns the key itself when nothing is found. That is deliberate: a missing string
 * should be visibly wrong in the UI (`orders.row.nodriver` is unmistakably a bug) rather
 * than an empty gap that looks like a legitimately blank field, and the key printed on
 * screen is exactly what someone needs to go and fix it.
 */
function resolve(dictionary: Dictionary, key: string): string {
  let node: unknown = dictionary;
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return key;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : key;
}

function interpolate(template: string, vars: Vars | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translate(dictionary: Dictionary, key: string, vars?: Vars): string {
  return interpolate(resolve(dictionary, key), vars);
}

/**
 * Picks the plural form for `count` and substitutes it, with `{count}` pre-filled.
 *
 * The form is chosen by `Intl.PluralRules`, not by `count === 1`: French puts 0 in the
 * singular ("0 commande"), English does not ("0 orders"), and hard-coding either rule
 * gets the other language wrong. Only `_one` and `_other` are authored — those are the
 * only categories en and fr use — but the lookup tries the exact category first, so a
 * language with `_few`/`_many` can be added later without touching this function.
 */
export function translateCount(
  dictionary: Dictionary,
  locale: Locale,
  key: string,
  count: number,
  vars?: Vars,
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const exact = `${key}_${category}`;
  const resolved = resolve(dictionary, exact);
  const template = resolved === exact ? resolve(dictionary, `${key}_other`) : resolved;
  return interpolate(template, { count, ...vars });
}
