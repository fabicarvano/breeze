import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each db.select() call takes the next queued outcome. The chain is thenable
// at every step, so `.where()` (awaited directly) and `.limit()` both resolve.
const queue: Array<{ rows?: unknown[]; error?: Error }> = [];

function chain(outcome: { rows?: unknown[]; error?: Error }) {
  const settle = () => (outcome.error ? Promise.reject(outcome.error) : Promise.resolve(outcome.rows ?? []));
  const node: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'innerJoin', 'limit', 'orderBy']) {
    node[method] = vi.fn(() => node);
  }
  node.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    settle().then(onFulfilled, onRejected);
  return node;
}

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => chain(queue.shift() ?? { rows: [] })),
  },
}));

vi.mock('../db/schema', () => ({
  configPolicyAssignments: {},
  configPolicyEffectiveFeatureLinks: {},
  configurationPolicies: {},
  deviceGroupMemberships: {},
  devices: {},
  organizations: {},
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

vi.mock('./configPolicyOwnership', () => ({
  policyOwnershipCondition: vi.fn(() => ({})),
}));

const redis = { get: vi.fn(), set: vi.fn() };
vi.mock('./redis', () => ({ getRedis: vi.fn(() => redis) }));

import { buildHelperConfigUpdate, resolveDeviceHelperSettings, helperBrandingScope, readCachedHelperSettings } from './helperSettings';

/** No helper policy link matches, so the legacy org flag decides. */
function queueNoPolicyMatch() {
  queue.push(
    { rows: [{ orgId: 'org-1', siteId: 'site-1' }] }, // device
    { rows: [{ partnerId: 'partner-1' }] }, // org partner
    { rows: [] }, // group memberships
    { rows: [] }, // policy rows
  );
}

describe('buildHelperConfigUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queue.length = 0;
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue('OK');
  });

  it('uses the org flag when no policy matches, and caches the result', async () => {
    queueNoPolicyMatch();
    queue.push({ rows: [{ settings: { helper: { enabled: true } } }] }, { rows: [{ partnerId: 'partner-1' }] });

    const settings = await buildHelperConfigUpdate('dev-1', 'org-1');

    expect(settings.enabled).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('helper:settings:device:dev-1', expect.any(String), 'EX', 120);
  });

  it('surfaces a failed org-flag read instead of reporting the Helper disabled', async () => {
    queueNoPolicyMatch();
    queue.push({ error: new Error('connection terminated') });

    await expect(buildHelperConfigUpdate('dev-1', 'org-1')).rejects.toThrow('connection terminated');
  });

  it('does not cache anything when the org-flag read fails', async () => {
    queueNoPolicyMatch();
    queue.push({ error: new Error('connection terminated') });

    await buildHelperConfigUpdate('dev-1', 'org-1').catch(() => undefined);

    expect(redis.set).not.toHaveBeenCalled();
  });

  it('does not cache anything when the policy resolution fails', async () => {
    queue.push({ error: new Error('connection terminated') });

    await expect(buildHelperConfigUpdate('dev-1', 'org-1')).rejects.toThrow('connection terminated');
    expect(redis.set).not.toHaveBeenCalled();
  });
});


describe('Helper branding resolution and tenancy', () => {
  beforeEach(() => { vi.clearAllMocks(); queue.length = 0; redis.get.mockResolvedValue(null); });
  it('keeps device operational winner while merging one winner per branding level', async () => {
    queue.push({ rows: [{ orgId: 'org-1', siteId: 'site-1' }] }, { rows: [{ partnerId: 'partner-1' }] }, { rows: [] }, { rows: [
      { level: 'partner', assignmentPriority: 0, inlineSettings: { branding: { displayName: 'Partner', companyName: 'MSP' } } },
      { level: 'partner', assignmentPriority: 5, inlineSettings: { branding: { portalLabel: 'Must not merge second winner' } } },
      { level: 'organization', assignmentPriority: 0, inlineSettings: { branding: { welcomeTitle: 'Customer' } } },
      { level: 'device', assignmentPriority: 0, inlineSettings: { enabled: true, showTrayIcon: false, branding: { displayName: 'Forbidden' } } },
    ] });
    const result = await resolveDeviceHelperSettings('dev-1');
    expect(result).toMatchObject({ enabled: true, showTrayIcon: false, branding: { state: 'set', values: { displayName: 'Partner', companyName: 'MSP', welcomeTitle: 'Customer' } } });
    expect(result?.branding?.values?.portalLabel).toBeUndefined();
  });
  it('separates organization and partner scopes', () => {
    expect(helperBrandingScope('org-1', 'partner-1')).not.toBe(helperBrandingScope('org-2', 'partner-1'));
    expect(helperBrandingScope('org-1', 'partner-1')).not.toBe(helperBrandingScope('org-1', 'partner-2'));
    expect(helperBrandingScope('org-1', 'partner-1')).not.toContain('org-1');
  });
  it('does not serve another tenant branding from a device cache after a move', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ enabled: true, branding: { state: 'set', scopeId: helperBrandingScope('old-org', 'old-partner'), values: { displayName: 'Old' } } }));
    queue.push({ rows: [{ orgId: 'new-org', partnerId: 'new-partner' }] });
    expect(await readCachedHelperSettings('dev-1')).toBeNull();
  });
  it('explicitly clears removed branding while retaining operational defaults', async () => {
    queue.push({ rows: [{ orgId: 'org-1', siteId: 'site-1' }] }, { rows: [{ partnerId: 'partner-1' }] }, { rows: [] },
      { rows: [{ level: 'partner', assignmentPriority: 0, inlineSettings: { enabled: true } }] });
    expect(await resolveDeviceHelperSettings('dev-1')).toMatchObject({ enabled: true, branding: { state: 'cleared', scopeId: helperBrandingScope('org-1', 'partner-1') } });
  });
  it('preserves legacy enabled for a null operational winner without hiding partner branding', async () => {
    queue.push({ rows: [{ orgId: 'org-1', siteId: 'site-1' }] }, { rows: [{ partnerId: 'partner-1' }] }, { rows: [] },
      { rows: [{ level: 'device', assignmentPriority: 0, inlineSettings: null },
        { level: 'partner', assignmentPriority: 0, inlineSettings: { branding: { displayName: 'Partner' } } }] });
    const loadOrgHelperSettings = vi.fn().mockResolvedValue({ enabled: true });
    expect(await resolveDeviceHelperSettings('dev-1', { loadOrgHelperSettings })).toMatchObject({ enabled: true, branding: { state: 'set', values: { displayName: 'Partner' } } });
    expect(loadOrgHelperSettings).toHaveBeenCalledWith('org-1');
  });
});
