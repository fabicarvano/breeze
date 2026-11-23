import { beforeEach, describe, expect, it, vi } from 'vitest';
const { queue, select } = vi.hoisted(() => ({ queue: [] as unknown[][], select: vi.fn() }));
vi.mock('../db', () => ({ db: { select } }));
vi.mock('../db/schema', () => ({ configurationPolicies: {}, configPolicyAssignments: {}, configPolicyEffectiveFeatureLinks: {}, configPolicyFeatureLinks: {} }));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), inArray: vi.fn(), isNull: vi.fn() }));
import { assertHelperBrandingAssignment, assertHelperBrandingWriteLevels, assertHelperBrandingRemoval, HelperBrandingLevelError } from './helperBrandingPolicy';
describe('Helper branding assignment write backstop', () => {
  beforeEach(() => {
    queue.length = 0;
    select.mockImplementation(() => { const rows = queue.shift() ?? []; const chain: Record<string, unknown> = {};
      for (const key of ['from', 'where', 'leftJoin', 'limit']) chain[key] = () => chain;
      chain.then = (ok: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(ok); return chain;
    });
  });
  it.each(['site', 'device_group', 'device'])('rejects branded assignment at %s including inherited effective links', async level => {
    queue.push([{ inlineSettings: { branding: { displayName: 'MSP' } } }]);
    await expect(assertHelperBrandingAssignment('policy', level)).rejects.toBeInstanceOf(HelperBrandingLevelError);
  });
  it.each(['partner', 'organization'])('accepts branded assignment at %s', async level => {
    await expect(assertHelperBrandingAssignment('policy', level)).resolves.toBeUndefined();
  });
  it('rejects adding branding to an existing site-assigned child inheritance', async () => {
    queue.push([{ id: 'child' }], [{ level: 'site' }]);
    await expect(assertHelperBrandingWriteLevels('parent', { branding: { displayName: 'MSP' } })).rejects.toBeInstanceOf(HelperBrandingLevelError);
  });
  it('allows operational settings and removal of branding', async () => {
    await expect(assertHelperBrandingWriteLevels('policy', { enabled: true })).resolves.toBeUndefined();
    queue.push([{ inlineSettings: { enabled: true } }]);
    await expect(assertHelperBrandingAssignment('policy', 'device')).resolves.toBeUndefined();
  });
  it('blocks removing an operational child link that would expose a branded parent at device level', async () => {
    queue.push([{ parentPolicyId: 'parent' }], [{ inlineSettings: { branding: { displayName: 'Parent' } } }], [], [{ level: 'device' }]);
    await expect(assertHelperBrandingRemoval('child', { select } as never)).rejects.toBeInstanceOf(HelperBrandingLevelError);
  });
});
