import { create } from 'zustand';
import type { AgentConfig } from './helperFetch';
import { getTauriInvoke } from './helperFetch';
import { setHelperLocale, t } from './i18n';

export interface HelperBrandingValues {
  displayName?: string; companyName?: string; welcomeTitle?: string; welcomeMessage?: string;
  supportLabel?: string; portalLabel?: string; primaryColor?: string; accentColor?: string;
}
export interface HelperBranding {
  state: 'set' | 'cleared'; scopeId?: string; values?: HelperBrandingValues;
}
const limits = { displayName: 60, companyName: 60, welcomeTitle: 120, welcomeMessage: 500, supportLabel: 40, portalLabel: 40 } as const;
export function validateBranding(input: unknown): HelperBrandingValues {
  const out: HelperBrandingValues = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const values = input as Record<string, unknown>;
  for (const [key, limit] of Object.entries(limits)) {
    const value = values[key];
    if (typeof value === 'string' && value.trim() && [...value].length <= limit && !/[\u0000-\u001f\u007f-\u009f\p{Cf}\p{Cs}\u2028\u2029]/u.test(value)) {
      out[key as keyof typeof limits] = value;
    }
  }
  for (const key of ['primaryColor', 'accentColor'] as const) {
    const value = values[key];
    if (typeof value === 'string' && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value)) out[key] = value;
  }
  return out;
}
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export function chooseForeground(hex: string) {
  const light = luminance(hex);
  const blackContrast = (light + 0.05) / 0.05;
  const whiteContrast = 1.05 / (light + 0.05);
  return blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';
}
export const useBranding = create<{ values: HelperBrandingValues }>(() => ({ values: {} }));
const colorProperties = ['--helper-brand-primary', '--helper-brand-primary-contrast', '--helper-brand-accent', '--helper-brand-accent-contrast'];
export function applyRuntimeConfig(config: Pick<AgentConfig, 'branding' | 'locale'>) {
  if (typeof config.locale === 'string' && config.locale.trim()) setHelperLocale(config.locale);
  const values = config.branding?.state === 'set' ? validateBranding(config.branding.values) : {};
  useBranding.setState({ values });
  const style = document.documentElement.style;
  colorProperties.forEach((key) => style.removeProperty(key));
  if (values.primaryColor) {
    style.setProperty('--helper-brand-primary', values.primaryColor);
    style.setProperty('--helper-brand-primary-contrast', chooseForeground(values.primaryColor));
  }
  if (values.accentColor) {
    style.setProperty('--helper-brand-accent', values.accentColor);
    style.setProperty('--helper-brand-accent-contrast', chooseForeground(values.accentColor));
  }
  document.title = values.displayName ?? 'Breeze Helper';
}
export function brandingDefaults(values: HelperBrandingValues) {
  const name = values.displayName ?? 'Breeze Helper';
  return {
    displayName: name,
    welcomeTitle: values.welcomeTitle ?? t('Welcome to {name}', { name }),
    welcomeMessage: values.welcomeMessage ?? t('Ask me anything about your computer.'),
  };
}
/** Each webview owns a subscription; reading the agent file stays in native code. */
export function watchRuntimeConfig(onConfig?: (config: AgentConfig) => void): () => void {
  let stopped = false;
  let inFlight = false;
  let lastFingerprint: string | undefined;
  const refresh = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const invoke = await getTauriInvoke();
      if (!invoke || stopped) return;
      // Local UI locale must be available even when credentials/config prevent HTTP initialization.
      try {
        const local = await invoke('get_helper_config') as { locale?: unknown };
        if (!stopped && typeof local?.locale === 'string' && local.locale.trim()) setHelperLocale(local.locale);
      } catch { /* Missing local command retains the last known locale; first launch stays English. */ }
      const config = await invoke('refresh_agent_config') as AgentConfig;
      if (!stopped && config && typeof config === 'object') {
        const fingerprint = JSON.stringify(config);
        if (fingerprint !== lastFingerprint) {
          applyRuntimeConfig(config);
          onConfig?.(config);
          lastFingerprint = fingerprint;
        }
      }
    } catch { /* Keep last known branding during an unreadable/transient file. */ }
    finally { inFlight = false; }
  };
  void refresh();
  const timer = window.setInterval(() => { void refresh(); }, 5000);
  return () => { stopped = true; window.clearInterval(timer); };
}
