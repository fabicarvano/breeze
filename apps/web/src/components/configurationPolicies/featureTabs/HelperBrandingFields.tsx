import { helperBrandingSchema, HELPER_BRANDING_TEXT_LIMITS } from '@breeze/shared/validators';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export const HELPER_BRANDING_FIELDS = {
  ...HELPER_BRANDING_TEXT_LIMITS, primaryColor: 7, accentColor: 7,
} as const;
export type HelperBrandingField = keyof typeof HELPER_BRANDING_FIELDS;
export type HelperBranding = Partial<Record<HelperBrandingField, string>>;
export type HelperBrandingPreview = {
  allowed: boolean;
  contexts: Array<{
    level: 'partner' | 'organization';
    selfPartnerDefault?: boolean;
    targetId: string;
    targetName: string;
    fields: Partial<Record<HelperBrandingField, {
      value?: string;
      source: { level: 'default' | 'partner' | 'organization'; policyName?: string };
    }>>;
  }>;
};

export function brandingIsValid(branding: HelperBranding): boolean {
  return helperBrandingSchema.safeParse(Object.fromEntries(
    Object.entries(branding).map(([key, value]) => [key, value === '' ? undefined : value]),
  )).success;
}

/** Blank fields are omitted; inherited values are display-only, never saved. */
export function brandingPayload(branding: HelperBranding): HelperBranding {
  return Object.fromEntries(Object.keys(HELPER_BRANDING_FIELDS)
    .filter(key => branding[key as HelperBrandingField]?.trim())
    .map(key => [key, branding[key as HelperBrandingField]]));
}

export default function HelperBrandingFields({ value, onChange, preview }: {
  value: HelperBranding;
  onChange: (value: HelperBranding) => void;
  preview?: HelperBrandingPreview;
}) {
  const { t } = useTranslation('policies');
  const prefix = 'configurationPolicies.featureTabs.helperTab.branding';
  const [selectedContext, setSelectedContext] = useState('');
  const context = preview?.contexts.find(item => item.targetId === selectedContext)
    ?? preview?.contexts[0];
  const allowed = preview?.allowed === true;
  return (
    <section className="pointer-events-auto space-y-4" data-testid="helper-branding">
      <div>
        <h3 className="text-sm font-semibold">{t(`${prefix}.title`)}</h3>
        <p className="text-xs text-muted-foreground">{t(`${prefix}.help`)}</p>
      </div>
      {context?.selfPartnerDefault && <p className="text-sm text-muted-foreground">{t(`${prefix}.selfPartnerDefault`)}</p>}
      {preview && !preview.contexts.length && <p className="text-sm text-muted-foreground">{t(`${prefix}.noAssignments`)}</p>}
      {preview && !allowed && <p className="text-sm text-muted-foreground">{t(`${prefix}.unavailable`)}</p>}
      {preview && preview.contexts.length > 1 && (
        <label className="block text-sm">
          {t(`${prefix}.previewContext`)}
          <select value={context?.targetId ?? ''} onChange={event => setSelectedContext(event.target.value)}
            data-testid="helper-branding-context" className="mt-1 block rounded-md border bg-background px-3 py-2">
            {preview.contexts.map(item => <option key={item.targetId} value={item.targetId}>{item.targetName}</option>)}
          </select>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(HELPER_BRANDING_FIELDS) as HelperBrandingField[]).map(field => {
          const inherited = context?.fields[field];
          const inheritedValue = inherited?.value ?? t(`${prefix}.defaults.${field}`);
          const source = inherited?.source;
          const sourceLabel = source?.policyName
            ? `${t(`${prefix}.sources.${source.level}`)} — ${source.policyName}`
            : t(`${prefix}.sources.${source?.level ?? 'default'}`);
          const valid = brandingIsValid({ [field]: value[field] });
          return (
            <div key={field}>
              <label htmlFor={`helper-branding-${field}`} className="text-sm font-medium">{t(`${prefix}.fields.${field}`)}</label>
              <input id={`helper-branding-${field}`} data-testid={`helper-branding-${field}`}
                type="text" value={value[field] ?? ''} disabled={!allowed}
                placeholder={inheritedValue} aria-invalid={!valid}
                aria-describedby={`helper-branding-${field}-inheritance`}
                onChange={event => onChange({ ...value, [field]: event.target.value })}
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" />
              <p id={`helper-branding-${field}-inheritance`} className="mt-1 text-xs text-muted-foreground">
                {context ? t(`${prefix}.inherited`, { value: inheritedValue, source: sourceLabel }) : t(`${prefix}.${preview ? 'noAssignments' : 'loading'}`)}
              </p>
              {!valid && <p role="alert" className="mt-1 text-xs text-destructive">
                {t(`${prefix}.${field.endsWith('Color') ? 'invalidColor' : 'invalidText'}`, { limit: HELPER_BRANDING_FIELDS[field] })}
              </p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
