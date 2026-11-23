import { z } from 'zod';

export const HELPER_BRANDING_TEXT_LIMITS = {
  displayName: 60, companyName: 60, welcomeTitle: 120,
  welcomeMessage: 500, supportLabel: 40, portalLabel: 40,
} as const;
export const HELPER_BRANDING_FIELDS = ['displayName', 'companyName', 'welcomeTitle', 'welcomeMessage', 'supportLabel', 'portalLabel', 'primaryColor', 'accentColor'] as const;

function text(max: number) {
  return z.string().refine(v => Array.from(v).length <= max, `Maximum ${max} Unicode characters`)
    .refine(v => !/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(v), 'Control characters are not allowed')
    .transform(v => v.trim() === '' ? undefined : v).optional();
}
const color = z.string().length(7).regex(/^#[0-9a-fA-F]{6}$/, 'Use #RRGGBB').optional();
/** Closed operator input; omitted or blank text inherits the lower level. */
export const helperBrandingSchema = z.object({
  displayName: text(60), companyName: text(60), welcomeTitle: text(120),
  welcomeMessage: text(500), supportLabel: text(40), portalLabel: text(40),
  primaryColor: color, accentColor: color,
}).strip();
export type HelperBrandingValues = z.infer<typeof helperBrandingSchema>;
export interface EffectiveHelperBranding {
  state: 'set' | 'cleared';
  scopeId: string;
  values?: HelperBrandingValues;
}
/** Read side drops invalid fields individually, never trusts persisted JSON. */
export function readHelperBranding(value: unknown): HelperBrandingValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: HelperBrandingValues = {};
  for (const key of Object.keys(helperBrandingSchema.shape) as (keyof HelperBrandingValues)[]) {
    const parsed = helperBrandingSchema.shape[key].safeParse((value as Record<string, unknown>)[key]);
    if (parsed.success && parsed.data !== undefined) result[key] = parsed.data;
  }
  return result;
}
/** A bounded semantic background always uses a readable black/white foreground. */
export function helperBrandingForeground(hex: string): '#000000' | '#FFFFFF' {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF';
}
