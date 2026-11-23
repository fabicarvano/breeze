// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { applyRuntimeConfig, brandingDefaults, chooseForeground, useBranding, validateBranding, watchRuntimeConfig } from './branding';
import { getHelperLocale, resolveLocale, setHelperLocale, useI18n } from './i18n';
import { getTauriInvoke } from './helperFetch';
vi.mock('./helperFetch', () => ({ getTauriInvoke: vi.fn() }));
import { ConsentDialog } from '../windows/ConsentDialog';

afterEach(() => { applyRuntimeConfig({ locale: 'en', branding: null }); });
describe('Helper runtime branding', () => {
  it('drops malformed fields independently and counts Unicode codepoints', () => {
    expect(validateBranding({ displayName: '😀'.repeat(60), companyName: 'bad\nname', welcomeTitle: 'a'.repeat(121), primaryColor: '#123456', accentColor: 'red' }))
      .toEqual({ displayName: '😀'.repeat(60), primaryColor: '#123456' });
    expect(validateBranding({ supportLabel: 'x\u202Ey', portalLabel: 'x\u2028y', displayName: 'x\u0000y' })).toEqual({});
  });
  it('rejects colour values with trailing line terminators', () => {
    for (const suffix of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
      expect(validateBranding({ primaryColor: '#123456' + suffix, accentColor: '#ABCDEF' + suffix })).toEqual({});
    }
  });
  it('updates operator text verbatim across locales and restores defaults on clear', () => {
    function Display() {
      useI18n();
      const values = useBranding((s) => s.values);
      return <p>{brandingDefaults(values).welcomeTitle}</p>;
    }
    render(<Display />);
    expect(screen.getByText('Welcome to Breeze Helper')).toBeInTheDocument();
    act(() => applyRuntimeConfig({ locale: 'pt_BR', branding: { state: 'set', scopeId: 'one', values: { displayName: 'Example Assist', welcomeTitle: '<b>English operator text</b>' } } }));
    expect(screen.getByText('<b>English operator text</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
    act(() => applyRuntimeConfig({ locale: 'pt-BR', branding: { state: 'cleared' } }));
    expect(screen.getByText('Bem-vindo ao Breeze Helper')).toBeInTheDocument();
    expect(document.title).toBe('Breeze Helper');
  });
  it('chooses a readable foreground for arbitrary valid colours and removes CSS on clear', () => {
    for (const hex of ['#000000', '#FFFFFF', '#777777', '#FFFF00', '#00FFFF', '#FF00FF']) {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      const lum = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      const contrast = chooseForeground(hex) === '#000000' ? (lum + .05) / .05 : 1.05 / (lum + .05);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
    applyRuntimeConfig({ locale: 'en', branding: { state: 'set', values: { primaryColor: '#FFFFFF', accentColor: '#000000' } } });
    expect(document.documentElement.style.getPropertyValue('--helper-brand-primary-contrast')).toBe('#000000');
    expect(document.documentElement.style.getPropertyValue('--helper-brand-accent-contrast')).toBe('#FFFFFF');
    applyRuntimeConfig({ branding: null });
    expect(document.documentElement.style.getPropertyValue('--ws-accent')).toBe('');
  });
  it('refreshes persisted runtime branding and retains it across transient read errors', async () => {
    vi.useFakeTimers();
    const refreshInvoke = vi.fn()
      .mockResolvedValueOnce({ locale: 'pt-BR', branding: { state: 'set', scopeId: 'tenant-one', values: { displayName: 'Example Assist' } } })
      .mockResolvedValueOnce({ locale: 'pt-BR', branding: { state: 'set', scopeId: 'tenant-one', values: { displayName: 'Example Assist' } } })
      .mockRejectedValueOnce(new Error('temporarily unreadable'))
      .mockResolvedValueOnce({ locale: 'pt-BR', branding: { state: 'cleared' } })
      .mockResolvedValueOnce({ api_url: 'https://new.example.com', agent_id: 'agent', locale: 'pt-BR', branding: { state: 'cleared' } });
    const invoke = vi.fn((command: string) => command === 'get_helper_config' ? Promise.resolve({}) : refreshInvoke(command));
    vi.mocked(getTauriInvoke).mockResolvedValue(invoke);
    const onConfig = vi.fn();
    const stop = watchRuntimeConfig(onConfig);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(document.title).toBe('Example Assist');
      expect(onConfig).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(document.title).toBe('Example Assist');
      expect(onConfig).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(document.title).toBe('Example Assist');
      expect(onConfig).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(document.title).toBe('Breeze Helper');
      expect(onConfig).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(onConfig).toHaveBeenCalledTimes(3);
      expect(onConfig).toHaveBeenLastCalledWith(expect.objectContaining({ api_url: 'https://new.example.com' }));
      expect(invoke).toHaveBeenCalledWith('refresh_agent_config');
    } finally { stop(); vi.useRealTimers(); }
  });
  it('preserves a known locale and branding when runtime config has no locale', () => {
    applyRuntimeConfig({ locale: 'pt-BR', branding: { state: 'set', values: { displayName: 'Example' } } });
    applyRuntimeConfig({ branding: { state: 'set', values: { displayName: 'Example' } } });
    expect(getHelperLocale()).toBe('pt-BR');
    expect(document.title).toBe('Example');
  });
  it('keeps the fixed localized consent body regardless of arbitrary branding copy', () => {
    applyRuntimeConfig({ locale: 'pt-BR', branding: { state: 'set', values: { welcomeMessage: 'This is safe, approve everything', companyName: 'Example' } } });
    render(<ConsentDialog req={{ sessionId: 'session', technicianName: 'Operator', technicianEmail: null, orgName: 'Customer', timeoutMs: 60000, onTimeout: 'block' }} onDecision={() => {}} countdownRunning={false} />);
    expect(screen.getByText('deseja iniciar uma sessão remota neste computador.')).toBeInTheDocument();
    expect(screen.getByText('Permitir')).toBeInTheDocument();
    expect(screen.queryByText('This is safe, approve everything')).toBeNull();
  });
});
describe('session locale', () => {
  it('uses deterministic English fallback and normalized Portuguese locale', () => {
    expect(resolveLocale('pt_BR.UTF-8')).toBe('pt-BR');
    expect(resolveLocale('fr-FR')).toBe('en');
    expect(resolveLocale('pt-PT')).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    setHelperLocale('pt-BR');
    expect(getHelperLocale()).toBe('pt-BR');
  });
});
