import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Hoist mock values so they're available in vi.mock factories
const {
  getConfigPolicyMock,
  addFeatureLinkMock,
  updateFeatureLinkMock,
  validateFeaturePolicyExistsMock,
  removeFeatureLinkMock,
  invalidateRemoteAccessCacheMock,
} = vi.hoisted(() => ({
  getConfigPolicyMock: vi.fn(),
  addFeatureLinkMock: vi.fn(),
  updateFeatureLinkMock: vi.fn(),
  validateFeaturePolicyExistsMock: vi.fn(),
  removeFeatureLinkMock: vi.fn(),
  invalidateRemoteAccessCacheMock: vi.fn(),
}));

vi.mock('../../services/remoteAccessPolicy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/remoteAccessPolicy')>()),
  invalidateRemoteAccessCache: invalidateRemoteAccessCacheMock,
}));

vi.mock('../../services/configurationPolicy', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/configurationPolicy')>();
  return {
    ...original,
    getConfigPolicy: getConfigPolicyMock,
    addFeatureLink: addFeatureLinkMock,
    updateFeatureLink: updateFeatureLinkMock,
    removeFeatureLink: removeFeatureLinkMock,
    listFeatureLinks: vi.fn(),
    validateFeaturePolicyExists: validateFeaturePolicyExistsMock,
  };
});

vi.mock('../../services/auditEvents', () => ({
  writeRouteAudit: vi.fn(),
  // See featureLinks.siteScope.test.ts for why this export is required now
  // that the route imports services/monitors/monitorService.
  requestLikeFromSnapshot: vi.fn(() => ({ req: { header: () => undefined } })),
}));

vi.mock('../../middleware/auth', () => ({
  authMiddleware: vi.fn((c: any, next: any) => next()),
  requireScope: vi.fn(() => (c: any, next: any) => next()),
  requirePermission: vi.fn(() => (c: any, next: any) => next()),
  requireMfa: vi.fn(() => (_c: any, next: any) => next()),
}));

import { featureLinkRoutes } from './featureLinks';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const POLICY_ID = '22222222-2222-2222-2222-222222222222';
const LINK_ID = '44444444-4444-4444-4444-444444444444';

function makeAuth(overrides: Record<string, unknown> = {}): any {
  return {
    scope: 'organization',
    orgId: ORG_ID,
    partnerId: null,
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    token: { scope: 'organization' },
    accessibleOrgIds: [ORG_ID],
    canAccessOrg: (orgId: string) => orgId === ORG_ID,
    orgCondition: () => undefined,
    ...overrides,
  };
}

function buildApp() {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('auth', makeAuth());
    await next();
  });
  app.route('/', featureLinkRoutes);
  return app;
}

const STUB_POLICY = {
  id: POLICY_ID,
  orgId: ORG_ID,
  name: 'Test Policy',
  featureLinks: [],
};

const STUB_POLICY_WITH_REMOTE_ACCESS_LINK = {
  ...STUB_POLICY,
  featureLinks: [{ id: LINK_ID, featureType: 'remote_access' }],
};


describe('Helper branding route validation', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each(['POST', 'PATCH'])('rejects invalid branding on %s without writing', async method => {
    getConfigPolicyMock.mockResolvedValue({ ...STUB_POLICY, featureLinks: [{ id: LINK_ID, featureType: 'helper' }] });
    const response = await buildApp().request(`/${POLICY_ID}/features${method === 'PATCH' ? `/${LINK_ID}` : ''}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ...(method === 'POST' ? { featureType: 'helper' } : {}), inlineSettings: { branding: { welcomeTitle: 'invalid\ncopy' } },
      }),
    });
    expect(response.status).toBe(400);
    expect(addFeatureLinkMock).not.toHaveBeenCalled();
    expect(updateFeatureLinkMock).not.toHaveBeenCalled();
  });
});
