/**
 * Font-family customization for the UIKit.
 *
 * The public shape (`AmityFontConfig`) is deliberately identical to the React
 * Native UIKit's, so a host can pass the same config object to both SDKs. The
 * *implementation* is web-native though: RN needs a separate family name per
 * weight because Android resolves each name to its own font file, whereas
 * browsers synthesize weights from a single family. So instead of per-weight
 * font objects, the per-weight entries become CSS custom properties that the
 * typography classes consume based on their own `font-weight`.
 *
 * Nothing here introduces a parallel font mechanism: the general family
 * overrides the `--asc-text-global-font-family` variable that
 * `~/v4/styles/global.css` already defines, and each per-weight variable is read
 * with `var(--specific, var(--asc-text-global-font-family))` so an unset weight
 * transparently falls back rather than resolving to nothing.
 */

export interface AmityFontConfig {
  /** Used for any weight that has no more specific entry below. */
  fontFamily?: string;
  /** fontWeight 400 / 'normal'. */
  regular?: string;
  /** fontWeight 500. */
  medium?: string;
  /** fontWeight 600. */
  semiBold?: string;
  /** fontWeight 700 / 'bold'. */
  bold?: string;
  /** fontWeight 800 / 900. */
  extraBold?: string;
}

/** The weight values the resolution table below distinguishes. */
export type AmityFontWeight = string | number | undefined;

// Treat whitespace-only entries as absent. A host spreading a partially-filled
// settings object ({ bold: '' }) must fall through to the next step of the chain
// rather than emit `font-family: ;` — which would blank the family entirely.
const clean = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const GENERIC_FAMILIES = [
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
];

/**
 * Turn a host-supplied family into a safe CSS `font-family` value.
 *
 * A bare multi-word name is quoted, and a last-resort generic is appended when
 * the value does not already end in one — without it, a family that fails to
 * load falls back to the browser default (commonly a serif), which reads as a
 * rendering bug. A value that already looks like a full CSS stack (contains a
 * comma or a quote) is passed through untouched.
 */
export const toCssFontFamily = (family: string): string => {
  const trimmed = family.trim();
  const isStack = trimmed.includes(',') || trimmed.includes('"') || trimmed.includes("'");

  const quoted = !isStack && /\s/.test(trimmed) ? `'${trimmed}'` : trimmed;

  const lastEntry = trimmed.split(',').pop()?.trim().replace(/['"]/g, '').toLowerCase() ?? '';
  const endsWithGeneric = GENERIC_FAMILIES.includes(lastEntry);

  return endsWithGeneric ? quoted : `${quoted}, sans-serif`;
};

/**
 * Resolve the family to use for a given `font-weight`, following the same
 * fallback chain as the RN UIKit:
 *
 * | fontWeight                        | resolves to                        |
 * |-----------------------------------|------------------------------------|
 * | 800, 900                          | extraBold ?? bold ?? fontFamily    |
 * | 700, 'bold'                       | bold ?? fontFamily                 |
 * | 600                               | semiBold ?? bold ?? fontFamily     |
 * | 500                               | medium ?? fontFamily               |
 * | anything else (400/'normal'/none) | regular ?? fontFamily              |
 */
export const resolveFontFamilyForWeight = (
  fonts: AmityFontConfig | undefined,
  fontWeight: AmityFontWeight,
): string | undefined => {
  if (!fonts) return undefined;

  const general = clean(fonts.fontFamily);
  const bold = clean(fonts.bold);
  const weight = typeof fontWeight === 'number' ? String(fontWeight) : fontWeight?.trim();

  switch (weight) {
    case '800':
    case '900':
      return clean(fonts.extraBold) ?? bold ?? general;
    case '700':
    case 'bold':
      return bold ?? general;
    case '600':
      return clean(fonts.semiBold) ?? bold ?? general;
    case '500':
      return clean(fonts.medium) ?? general;
    default:
      return clean(fonts.regular) ?? general;
  }
};

/** CSS custom property that every typography class falls back to. */
export const FONT_FAMILY_GLOBAL_VARIABLE = '--asc-text-global-font-family';

/**
 * Per-weight CSS custom properties. Left UNSET when a weight has no configured
 * family, so `var(--asc-text-font-family-x, var(--asc-text-global-font-family))`
 * in the stylesheets resolves through to the general family (or, with no `fonts`
 * at all, to the UIKit's built-in default).
 */
export const FONT_FAMILY_WEIGHT_VARIABLES = Object.freeze({
  '400': '--asc-text-font-family-regular',
  '500': '--asc-text-font-family-medium',
  '600': '--asc-text-font-family-semi-bold',
  '700': '--asc-text-font-family-bold',
  '800': '--asc-text-font-family-extra-bold',
});

/**
 * Build the CSS custom properties for a font config.
 *
 * Returns an EMPTY object when `fonts` is absent, or present but with no usable
 * entry — so the UIKit keeps its own default font entirely instead of applying a
 * blank or half-configured family.
 */
export const resolveFontVariables = (fonts?: AmityFontConfig): Record<string, string> => {
  if (!fonts) return {};

  const variables: Record<string, string> = {};

  const general = clean(fonts.fontFamily);
  if (general) variables[FONT_FAMILY_GLOBAL_VARIABLE] = toCssFontFamily(general);

  (
    Object.keys(FONT_FAMILY_WEIGHT_VARIABLES) as (keyof typeof FONT_FAMILY_WEIGHT_VARIABLES)[]
  ).forEach((weight) => {
    const family = resolveFontFamilyForWeight(fonts, weight);
    if (family) {
      variables[FONT_FAMILY_WEIGHT_VARIABLES[weight]] = toCssFontFamily(family);
    }
  });

  return variables;
};
