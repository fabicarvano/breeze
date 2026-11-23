import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HelperTab from './HelperTab';
import { brandingIsValid, type HelperBrandingPreview } from './HelperBrandingFields';
import type { FeatureLink } from './types';

const save = vi.hoisted(() => vi.fn(async (_id: string | null, _payload: { inlineSettings: Record<string, unknown> }) => ({ id: 'link-1' })));
vi.mock('./useFeatureLink', () => ({
  useFeatureLink: () => ({ save, remove: vi.fn(), saving: false, error: undefined, clearError: vi.fn() }),
}));
const preview: HelperBrandingPreview = {
  allowed: true,
  contexts: [{ level: 'organization', targetId: 'org-1', targetName: 'Customer',
    fields: { displayName: { value: 'Partner Assist', source: { level: 'partner', policyName: 'MSP default' } } } }],
};
const props = { policyId: 'policy-1', linkedPolicyId: null, onLinkChanged: vi.fn(), helperBrandingPreview: preview };
const link = (branding: Record<string, string>): FeatureLink => ({
  id: 'link-1', featureType: 'helper', featurePolicyId: null, inlineSettings: { enabled: true, branding },
});

describe('Helper branding policy fields', () => {
  it('shows server-resolved inherited value and source without copying them into overrides', async () => {
    save.mockClear();
    render(<HelperTab {...props} existingLink={undefined} />);
    const input = screen.getByTestId('helper-branding-displayName') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('Partner Assist');
    expect(screen.getByText('Inherited: Partner Assist (Partner policy — MSP default)')).toBeTruthy();
    fireEvent.change(screen.getByTestId('helper-branding-welcomeTitle'), { target: { value: 'Welcome, customer' } });
    fireEvent.click(screen.getByText('Save'));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1].inlineSettings.branding).toEqual({ welcomeTitle: 'Welcome, customer' });
  });

  it('clearing an override omits its field and restoring no overrides removes the block', async () => {
    save.mockClear();
    render(<HelperTab {...props} existingLink={link({ displayName: 'Customer Assist' })} />);
    fireEvent.change(screen.getByTestId('helper-branding-displayName'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save'));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1].inlineSettings.branding).toBeUndefined();
  });

  it('does not copy parent policy branding when overriding its operational settings', async () => {
    save.mockClear();
    render(<HelperTab {...props} existingLink={undefined} parentLink={link({ displayName: 'Parent Assist' })} />);
    fireEvent.click(screen.getByText('Override'));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][1].inlineSettings.branding).toBeUndefined();
    expect(save.mock.calls[0][1].inlineSettings.enabled).toBe(true);
  });

  it('blocks controls for operational-only assignment levels and keeps their settings editable', () => {
    render(<HelperTab {...props} helperBrandingPreview={{ allowed: false, contexts: [] }} existingLink={link({})} />);
    expect((screen.getByTestId('helper-branding-displayName') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('helper-show-tray-icon') as HTMLInputElement).disabled).toBe(false);
  });

  it('switches inherited context using server values for policies assigned to several organizations', () => {
    render(<HelperTab {...props} existingLink={undefined} helperBrandingPreview={{
      ...preview, contexts: [...preview.contexts, { level: 'organization', targetId: 'org-2', targetName: 'Other customer',
        fields: { displayName: { value: 'Other Assist', source: { level: 'partner', policyName: 'Other MSP' } } } }],
    }} />);
    fireEvent.change(screen.getByTestId('helper-branding-context'), { target: { value: 'org-2' } });
    expect((screen.getByTestId('helper-branding-displayName') as HTMLInputElement).placeholder).toBe('Other Assist');
  });

  it('rejects invalid colors and control characters before a save', () => {
    save.mockClear();
    render(<HelperTab {...props} existingLink={link({})} />);
    fireEvent.change(screen.getByTestId('helper-branding-primaryColor'), { target: { value: 'red' } });
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('six-digit hex');
    fireEvent.click(screen.getByText('Save'));
    expect(save).not.toHaveBeenCalled();
  });

  it('does not claim effective inheritance for an unassigned policy', () => {
    render(<HelperTab {...props} existingLink={undefined} helperBrandingPreview={{ allowed: true, contexts: [] }} />);
    expect(screen.queryByText(/^Inherited:/)).toBeNull();
    expect((screen.getByTestId('helper-branding-displayName') as HTMLInputElement).disabled).toBe(false);
    expect(screen.getAllByText(/Assign this policy to a partner or organization/).length).toBeGreaterThan(0);
  });

  it('preserves saved branding by blocking Save while inheritance metadata is unavailable', () => {
    render(<HelperTab {...props} helperBrandingPreview={undefined} existingLink={link({ displayName: 'Saved identity' })} />);
    expect((screen.getByText('Save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('counts Unicode code points and rejects all controls and unsupported color syntax', () => {
    expect(brandingIsValid({ displayName: '😀'.repeat(60) })).toBe(true);
    expect(brandingIsValid({ displayName: '😀'.repeat(61) })).toBe(false);
    expect(brandingIsValid({ welcomeMessage: 'hello\nworld' })).toBe(false);
    expect(brandingIsValid({ welcomeMessage: 'hello\u0085world' })).toBe(false);
    expect(brandingIsValid({ primaryColor: '#123456' })).toBe(true);
    for (const value of ['#fff', 'rgb(1,2,3)', '#12345678', 'red', '#123456\n']) {
      expect(brandingIsValid({ primaryColor: value })).toBe(false);
    }
  });
});
