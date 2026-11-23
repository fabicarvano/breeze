import { beforeEach, describe, expect, it, vi } from 'vitest';
const { queue, select, authorize } = vi.hoisted(() => ({ queue: [] as unknown[][], select: vi.fn(), authorize: vi.fn() }));
vi.mock('../db', () => ({ db: { select } }));
vi.mock('../db/schema', () => ({ configPolicyAssignments: {}, configPolicyEffectiveFeatureLinks: {}, configurationPolicies: {}, organizations: {}, devices: {}, deviceGroupMemberships: {}, configPolicyFeatureLinks: {} }));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), ne: vi.fn(), or: vi.fn(), inArray: vi.fn(), isNull: vi.fn() }));
vi.mock('./configurationPolicy', () => ({ authorizeAssignmentTarget: authorize }));
vi.mock('./configPolicyOwnership', () => ({ policyOwnershipCondition: vi.fn() }));
vi.mock('./redis', () => ({ getRedis: vi.fn() }));
import { helperBrandingPreview } from './helperBrandingPreview';
const auth = { scope: 'organization', orgId: 'org', partnerId: 'partner', canAccessOrg: (id: string) => id === 'org' } as never;
describe('Helper policy inherited branding preview', () => {
  beforeEach(() => {
    queue.length = 0; vi.clearAllMocks(); authorize.mockResolvedValue({ valid: true });
    select.mockImplementation(() => { const rows = queue.shift() ?? []; const chain: Record<string, unknown> = {};
      for (const key of ['from', 'where', 'innerJoin', 'limit']) chain[key] = () => chain;
      chain.then = (ok: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(ok); return chain;
    });
  });
  it('does not invent effective inheritance for an unassigned policy', async () => {
    queue.push([]);
    expect(await helperBrandingPreview('policy', auth)).toEqual({ allowed: true, contexts: [] });
  });
  it('never reads a foreign org assignment branding', async () => {
    queue.push([{ level: 'organization', targetId: 'foreign-org' }]);
    expect(await helperBrandingPreview('policy', auth)).toEqual({ allowed: true, contexts: [] });
    expect(select).toHaveBeenCalledTimes(1);
  });
  it('applies the runtime partner single-winner rule and reports its source', async () => {
    queue.push([{ level: 'organization', targetId: 'org' }], [{ id: 'org', partnerId: 'partner', name: 'Customer' }], [
      { level: 'partner', priority: 0, policyName: 'MSP Default', inlineSettings: { branding: { displayName: 'Assist' } } },
      { level: 'partner', priority: 5, policyName: 'Other', inlineSettings: { branding: { companyName: 'Must not merge' } } },
    ]);
    const result = await helperBrandingPreview('policy', auth);
    expect(result.contexts[0]?.fields.displayName).toEqual({ value: 'Assist', source: { level: 'partner', policyName: 'MSP Default' } });
    expect(result.contexts[0]?.fields.companyName).toEqual({ source: { level: 'default' } });
  });
  it('does not expose org-wide branding to a site-restricted caller', async () => {
    authorize.mockResolvedValue({ valid: false }); queue.push([{ level: 'organization', targetId: 'org' }]);
    expect((await helperBrandingPreview('policy', auth)).contexts).toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
  });
  it('never falls through to another partner policy when this same policy wins both assignment levels', async () => {
    queue.push([{ level: 'organization', targetId: 'org' }], [{ id: 'org', partnerId: 'partner', name: 'Customer' }], [
      { policyId: 'policy', level: 'partner', priority: 0, policyName: 'Shared', inlineSettings: { branding: { displayName: 'Current' } } },
      { policyId: 'other', level: 'partner', priority: 5, policyName: 'Other', inlineSettings: { branding: { displayName: 'Wrong fallback' } } },
    ]);
    const result = await helperBrandingPreview('policy', auth);
    expect(result.contexts[0]?.selfPartnerDefault).toBe(true);
    expect(result.contexts[0]?.fields.displayName).toEqual({ source: { level: 'default' } });
  });
});
