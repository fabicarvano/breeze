import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const { dbState, dbAccessContexts, networkOverviewMock, networkAssetsMock, networkSitesMock, networkSiteHealthMock, networkAssetDetailMock } = vi.hoisted(() => ({
  dbState: {
    rows: [] as unknown[],
    where: undefined as unknown,
    contextDepth: 0,
  },
  dbAccessContexts: [] as unknown[],
  networkOverviewMock: vi.fn(),
  networkAssetsMock: vi.fn(),
  networkSitesMock: vi.fn(),
  networkSiteHealthMock: vi.fn(),
  networkAssetDetailMock: vi.fn(),
}));

vi.mock('../../db', () => {
  const chain: Record<string, unknown> = {};

  for (const method of ['from', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }

  chain.select = vi.fn(() => chain);
  chain.where = vi.fn((predicate: unknown) => {
    dbState.where = predicate;
    return chain;
  });

  (chain as { then: unknown }).then = (
    resolve: (value: unknown) => unknown,
  ) => Promise.resolve(dbState.rows).then(resolve);

  return {
    db: chain,
    withDbAccessContext: async <T>(
      context: unknown,
      fn: () => Promise<T> | T,
    ): Promise<T> => {
      if (dbState.contextDepth !== 0) {
        throw new Error('nested withDbAccessContext detected');
      }

      dbAccessContexts.push(context);
      dbState.contextDepth += 1;

      try {
        return await fn();
      } finally {
        dbState.contextDepth -= 1;
      }
    },
    runOutsideDbContext: <T>(fn: () => T): T => fn(),
    withSystemDbAccessContext: <T>(
      fn: () => Promise<T>,
    ): Promise<T> => fn(),
  };
});

vi.mock('../../services/portal/networkVisibilityReadModel', () => ({
  networkOverview: networkOverviewMock,
  networkAssets: networkAssetsMock,
  networkSites: networkSitesMock,
  networkSiteHealth: networkSiteHealthMock,
  networkAssetDetail: networkAssetDetailMock,
}));

import { portalNetworkRoutes } from './network';

const ORG_ID = '22222222-2222-2222-2222-222222222222';
const PARTNER_ID = '33333333-3333-3333-3333-333333333333';

const OK_OVERVIEW = {
  dataStatus: 'ok' as const,
  totalAssets: 4,
  onlineAssets: 2,
  offlineAssets: 1,
  snmpDevicesPolling: 2,
  monitorsDown: 1,
};

const NOT_ENABLED = {
  dataStatus: 'not_enabled',
  totalAssets: null,
  onlineAssets: null,
  offlineAssets: null,
  snmpDevicesPolling: null,
  monitorsDown: null,
};

function makeApp(withAuth = true) {
  const app = new Hono();

  if (withAuth) {
    app.use('*', async (c, next) => {
      c.set('portalAuth', {
        user: {
          id: 'pu1',
          orgId: ORG_ID,
          email: 'customer@example.test',
          name: 'Customer',
          contactId: null,
          receiveNotifications: true,
          status: 'active',
        },
        token: 't',
        authMethod: 'bearer',
        partnerId: PARTNER_ID,
        timezone: 'UTC',
      });
      await next();
    });
  }

  app.route('/', portalNetworkRoutes);
  return app;
}

describe('GET /network/overview (#5861)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [];
    dbState.where = undefined;
    dbState.contextDepth = 0;
    dbAccessContexts.length = 0;
    networkOverviewMock.mockResolvedValue(OK_OVERVIEW);
  });

  it('returns not_enabled with null metrics when the flag is false', async () => {
    dbState.rows = [{
      enableNetworkVisibility: false,
      partnerId: PARTNER_ID,
    }];

    const response = await makeApp().request('/network/overview');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(NOT_ENABLED);
    expect(networkOverviewMock).not.toHaveBeenCalled();
  });

  it('fails closed to not_enabled when portal_branding does not exist', async () => {
    dbState.rows = [];

    const response = await makeApp().request('/network/overview');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(NOT_ENABLED);
    expect(networkOverviewMock).not.toHaveBeenCalled();
  });

  it('returns the org-scoped overview when the flag is true', async () => {
    dbState.rows = [{
      enableNetworkVisibility: true,
      partnerId: PARTNER_ID,
    }];

    const response = await makeApp().request('/network/overview');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OK_OVERVIEW);
    expect(networkOverviewMock).toHaveBeenCalledTimes(1);
    expect(networkOverviewMock).toHaveBeenCalledWith(ORG_ID);

    expect(dbAccessContexts).toEqual([
      {
        scope: 'organization',
        orgId: ORG_ID,
        accessibleOrgIds: [ORG_ID],
        accessiblePartnerIds: [],
        userId: null,
        currentPartnerId: PARTNER_ID,
      },
    ]);

    const query = new PgDialect().sqlToQuery(dbState.where as SQL);
    expect(query.sql).toContain('"portal_branding"."org_id" = $1');
    expect(query.params).toEqual([ORG_ID]);
  });

  it('passes no_data through unchanged when visibility is enabled', async () => {
    dbState.rows = [{
      enableNetworkVisibility: true,
      partnerId: PARTNER_ID,
    }];
    networkOverviewMock.mockResolvedValue({
      dataStatus: 'no_data',
      totalAssets: null,
      onlineAssets: null,
      offlineAssets: null,
      snmpDevicesPolling: null,
      monitorsDown: null,
    });

    const response = await makeApp().request('/network/overview');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dataStatus: 'no_data',
      totalAssets: null,
    });
  });

  it('rejects an unauthenticated request before reading settings', async () => {
    const response = await makeApp(false).request('/network/overview');

    expect(response.status).toBe(401);
    expect(dbState.where).toBeUndefined();
    expect(networkOverviewMock).not.toHaveBeenCalled();
  });
});

describe('GET /network/assets (#5861, PR 2)', () => {
  const OK_ASSETS = {
    dataStatus: 'ok' as const,
    data: [
      {
        id: 'a1',
        hostname: 'core-switch-01',
        ipAddress: '10.0.0.1',
        macAddress: 'AA:BB:CC:00:00:01',
        assetType: 'switch',
        onlineState: 'online' as const,
        lastSeenAt: '2026-09-17T11:59:00.000Z',
        firstSeenAt: '2026-09-01T09:00:00.000Z',
        manufacturer: 'Cisco',
        model: null,
        siteName: 'HQ',
      },
    ],
    pagination: { page: 1, limit: 50, total: 1 },
  };

  const NOT_ENABLED_ASSETS = {
    dataStatus: 'not_enabled',
    data: [],
    pagination: { page: 1, limit: 50, total: 0 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [];
    dbState.where = undefined;
    dbState.contextDepth = 0;
    dbAccessContexts.length = 0;
    networkAssetsMock.mockResolvedValue(OK_ASSETS);
  });

  it('returns not_enabled with an empty list when the flag is false', async () => {
    dbState.rows = [{ enableNetworkVisibility: false, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(NOT_ENABLED_ASSETS);
    expect(networkAssetsMock).not.toHaveBeenCalled();
  });

  it('returns the org-scoped asset list when the flag is true', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OK_ASSETS);
    expect(networkAssetsMock).toHaveBeenCalledTimes(1);
    expect(networkAssetsMock).toHaveBeenCalledWith(ORG_ID, {
      siteId: undefined,
      assetType: undefined,
      status: undefined,
      page: undefined,
      limit: undefined,
    }, undefined, false, false);
  });

  it('forwards enrichWithAlerts=true when enableNetworkAlerts is on', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, enableNetworkAlerts: true, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets');

    expect(response.status).toBe(200);
    expect(networkAssetsMock).toHaveBeenCalledWith(ORG_ID, {
      siteId: undefined,
      assetType: undefined,
      status: undefined,
      page: undefined,
      limit: undefined,
    }, undefined, true, false);
  });

  it.each([
    ['absent', {}, false],
    ['false', { enablePhysicalPlacement: false }, false],
    ['true', { enablePhysicalPlacement: true }, true],
  ])('forwards includePhysicalPlacement for enablePhysicalPlacement %s (CPEV-W1)', async (_label, flag, expected) => {
    dbState.rows = [{ enableNetworkVisibility: true, ...flag, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets');

    expect(response.status).toBe(200);
    expect(networkAssetsMock.mock.calls[0]?.[4]).toBe(expected);
  });

  it('never reads placement when network visibility is off, even with enablePhysicalPlacement on (CPEV-W1)', async () => {
    dbState.rows = [{ enableNetworkVisibility: false, enablePhysicalPlacement: true, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets');

    expect((await response.json()).dataStatus).toBe('not_enabled');
    expect(networkAssetsMock).not.toHaveBeenCalled();
  });

  it('forwards siteId, assetType, status, page and limit query params', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, partnerId: PARTNER_ID }];

    const response = await makeApp().request(
      '/network/assets?siteId=11111111-1111-1111-1111-111111111111&assetType=switch&status=online&page=2&limit=10',
    );

    expect(response.status).toBe(200);
    expect(networkAssetsMock).toHaveBeenCalledWith(ORG_ID, {
      siteId: '11111111-1111-1111-1111-111111111111',
      assetType: 'switch',
      status: 'online',
      page: 2,
      limit: 10,
    }, undefined, false, false);
  });

  it('rejects an invalid status value with 400', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets?status=bogus');

    expect(response.status).toBe(400);
    expect(networkAssetsMock).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID siteId with 400', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets?siteId=not-a-uuid');

    expect(response.status).toBe(400);
    expect(networkAssetsMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid assetType with 400', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets?assetType=toaster');

    expect(response.status).toBe(400);
    expect(networkAssetsMock).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric page with 400', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, partnerId: PARTNER_ID }];

    const response = await makeApp().request('/network/assets?page=abc');

    expect(response.status).toBe(400);
    expect(networkAssetsMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request before reading settings', async () => {
    const response = await makeApp(false).request('/network/assets');

    expect(response.status).toBe(401);
    expect(dbState.where).toBeUndefined();
    expect(networkAssetsMock).not.toHaveBeenCalled();
  });
});

describe('GET /network/sites (#7025)', () => {
  const SITES = {
    dataStatus: 'ok' as const,
    data: [{ id: '11111111-1111-1111-1111-111111111111', name: 'HQ' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [];
    dbState.contextDepth = 0;
    dbAccessContexts.length = 0;
    networkSitesMock.mockResolvedValue(SITES);
  });

  it('returns not_enabled with an empty list when the flag is false', async () => {
    dbState.rows = [{ enableNetworkVisibility: false }];
    const response = await makeApp().request('/network/sites');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dataStatus: 'not_enabled', data: [] });
    expect(networkSitesMock).not.toHaveBeenCalled();
  });

  it('returns the org-scoped site list when the flag is true', async () => {
    dbState.rows = [{ enableNetworkVisibility: true }];
    const response = await makeApp().request('/network/sites');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SITES);
    expect(networkSitesMock).toHaveBeenCalledWith(ORG_ID);
    expect(dbAccessContexts).toHaveLength(1);
  });

  it('401s without portal auth', async () => {
    const response = await makeApp(false).request('/network/sites');
    expect(response.status).toBe(401);
    expect(networkSitesMock).not.toHaveBeenCalled();
  });
});

describe('GET /network/sites/health (CPEV-W2)', () => {
  const HEALTH_ROW = {
    siteId: '11111111-1111-1111-1111-111111111111',
    siteName: 'HQ',
    totalAssets: 3,
    onlineAssets: 2,
    offlineAssets: 1,
    unverifiedAssets: 0,
    snmpDevicesPolling: 1,
    monitorsDown: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [];
    dbState.contextDepth = 0;
    dbAccessContexts.length = 0;
    networkSiteHealthMock.mockResolvedValue({ dataStatus: 'ok', data: [HEALTH_ROW] });
  });

  it.each([
    ['absent', []],
    ['false', [{ enableNetworkVisibility: false, enableNetworkAlerts: true }]],
  ])('returns not_enabled with an empty list when the flag is %s', async (_label, rows) => {
    dbState.rows = rows;
    const response = await makeApp().request('/network/sites/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dataStatus: 'not_enabled', data: [] });
    expect(networkSiteHealthMock).not.toHaveBeenCalled();
  });

  it('returns the org-scoped health rows without alert fields when alerts are off', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, enableNetworkAlerts: false }];
    const response = await makeApp().request('/network/sites/health');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ dataStatus: 'ok', data: [HEALTH_ROW] });
    // Mock-driven: only proves the route passes the service row through; DTO key whitelisting is covered by the real-Postgres test.
    expect(Object.keys(body.data[0]).sort()).toEqual(Object.keys(HEALTH_ROW).sort());
    expect(networkSiteHealthMock).toHaveBeenCalledWith(ORG_ID, false);
    expect(dbAccessContexts).toEqual([
      expect.objectContaining({ scope: 'organization', orgId: ORG_ID, currentPartnerId: PARTNER_ID }),
    ]);
  });

  it('forwards includeAlerts=true when enableNetworkAlerts is on', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, enableNetworkAlerts: true }];
    const withAlerts = { ...HEALTH_ROW, activeAlertCount: 0, highestAlertSeverity: null };
    networkSiteHealthMock.mockResolvedValue({ dataStatus: 'ok', data: [withAlerts] });
    const response = await makeApp().request('/network/sites/health');
    expect(await response.json()).toEqual({ dataStatus: 'ok', data: [withAlerts] });
    expect(networkSiteHealthMock).toHaveBeenCalledWith(ORG_ID, true);
  });

  it('ignores orgId and siteId query parameters', async () => {
    dbState.rows = [{ enableNetworkVisibility: true, enableNetworkAlerts: false }];
    await makeApp().request('/network/sites/health?orgId=99999999-9999-9999-9999-999999999999&siteId=x');
    expect(networkSiteHealthMock).toHaveBeenCalledWith(ORG_ID, false);
  });

  it('403s when the portal user has no partnerId', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('portalAuth', {
        user: {
          id: 'pu1',
          orgId: ORG_ID,
          email: 'customer@example.test',
          name: 'Customer',
          contactId: null,
          receiveNotifications: true,
          status: 'active',
        },
        token: 't',
        authMethod: 'bearer',
        partnerId: null,
        timezone: 'UTC',
      });
      await next();
    });
    app.route('/', portalNetworkRoutes);
    const response = await app.request('/network/sites/health');
    expect(response.status).toBe(403);
    expect(networkSiteHealthMock).not.toHaveBeenCalled();
  });

  it('401s without portal auth', async () => {
    const response = await makeApp(false).request('/network/sites/health');
    expect(response.status).toBe(401);
    expect(networkSiteHealthMock).not.toHaveBeenCalled();
  });
});

describe('GET /network/assets/:id (CPEV-W3)', () => {
  const ASSET_ID = '0a1b2c3d-1111-4222-8333-444455556666';
  const ROW = {
    id: ASSET_ID,
    hostname: 'sw-1',
    label: null,
    ipAddress: '10.0.0.2',
    macAddress: null,
    assetType: 'switch',
    onlineState: 'online',
    lastSeenAt: '2026-09-17T11:00:00.000Z',
    firstSeenAt: '2026-09-01T11:00:00.000Z',
    manufacturer: null,
    model: null,
    siteName: 'HQ',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dbState.rows = [];
    dbState.where = undefined;
    dbState.contextDepth = 0;
    dbAccessContexts.length = 0;
    networkAssetDetailMock.mockResolvedValue(ROW);
  });

  function enable(extra: Record<string, boolean> = {}) {
    dbState.rows = [{ enableNetworkVisibility: true, ...extra }];
  }

  it.each([
    ['absent', []],
    ['false', [{ enableNetworkVisibility: false }]],
  ])('answers not_enabled before any lookup when the flag is %s', async (_n, rows) => {
    dbState.rows = rows;

    const response = await makeApp().request(`/network/assets/${ASSET_ID}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dataStatus: 'not_enabled', data: null });
    expect(response.headers.get('etag')).toBeTruthy();
    expect(networkAssetDetailMock).not.toHaveBeenCalled();
  });

  it('returns the asset in the authenticated org when the flag is true', async () => {
    enable();

    const response = await makeApp().request(`/network/assets/${ASSET_ID}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dataStatus: 'ok', data: ROW });
    expect(response.headers.get('etag')).toBeTruthy();
    expect(response.headers.get('cache-control')).toContain('private');
    expect(networkAssetDetailMock).toHaveBeenCalledWith(ORG_ID, ASSET_ID, false, false);
    expect(dbAccessContexts).toEqual([
      {
        scope: 'organization',
        orgId: ORG_ID,
        accessibleOrgIds: [ORG_ID],
        accessiblePartnerIds: [],
        userId: null,
        currentPartnerId: PARTNER_ID,
      },
    ]);
  });

  it.each([
    [{}, false, false],
    [{ enableNetworkAlerts: true }, true, false],
    [{ enablePhysicalPlacement: true }, false, true],
    [{ enableNetworkAlerts: true, enablePhysicalPlacement: true }, true, true],
  ])('passes the alert and placement flags through (%j)', async (flags, alerts, placement) => {
    enable(flags);

    await makeApp().request(`/network/assets/${ASSET_ID}`);

    expect(networkAssetDetailMock).toHaveBeenCalledWith(ORG_ID, ASSET_ID, alerts, placement);
  });

  it('serves the row exactly as the read model shaped it (alerts off, no placement)', async () => {
    enable();

    const body = await (await makeApp().request(`/network/assets/${ASSET_ID}`)).json() as { data: Record<string, unknown> };

    expect(body.data).not.toHaveProperty('activeAlertCount');
    expect(body.data).not.toHaveProperty('highestAlertSeverity');
    expect(body.data).not.toHaveProperty('openTicketCount');
    expect(body.data).not.toHaveProperty('physicalPlacement');
  });

  it('serves zero-filled alerts when the read model supplies them', async () => {
    enable({ enableNetworkAlerts: true });
    networkAssetDetailMock.mockResolvedValue({ ...ROW, activeAlertCount: 0, highestAlertSeverity: null, openTicketCount: 0 });

    const body = await (await makeApp().request(`/network/assets/${ASSET_ID}`)).json() as { data: Record<string, unknown> };

    expect(body.data).toMatchObject({ activeAlertCount: 0, highestAlertSeverity: null, openTicketCount: 0 });
  });

  it('answers 403 without a partnerId, before any read', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('portalAuth', { user: { id: 'pu1', orgId: ORG_ID }, token: 't', authMethod: 'bearer', partnerId: null });
      await next();
    });
    app.route('/', portalNetworkRoutes);

    const response = await app.request(`/network/assets/${ASSET_ID}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Organization is not available' });
    expect(networkAssetDetailMock).not.toHaveBeenCalled();
    expect(dbAccessContexts).toEqual([]);
  });

  it('answers 400 for a malformed id, uncached, before the gate', async () => {
    enable();

    const response = await makeApp().request('/network/assets/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.headers.get('etag')).toBeNull();
    expect(response.headers.get('cache-control') ?? '').not.toContain('private, max-age');
    expect(networkAssetDetailMock).not.toHaveBeenCalled();
    expect(dbAccessContexts).toEqual([]);
  });

  it('answers a uniform uncached 404 when the asset is not found', async () => {
    enable();
    networkAssetDetailMock.mockResolvedValue(null);

    const response = await makeApp().request(`/network/assets/${ASSET_ID}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Asset not found' });
    expect(response.headers.get('etag')).toBeNull();
    expect(response.headers.get('cache-control') ?? '').not.toContain('max-age=30');
  });

  it('ignores orgId and siteId in the query string', async () => {
    enable();

    await makeApp().request(
      `/network/assets/${ASSET_ID}?orgId=99999999-9999-4999-8999-999999999999&siteId=88888888-8888-4888-8888-888888888888`,
    );

    expect(networkAssetDetailMock).toHaveBeenCalledWith(ORG_ID, ASSET_ID, false, false);
    expect(dbAccessContexts[0]).toMatchObject({ orgId: ORG_ID });
  });

  it('does not shadow the list route', async () => {
    enable();
    networkAssetsMock.mockResolvedValue({ dataStatus: 'no_data', data: [], pagination: { page: 1, limit: 50, total: 0 } });

    const response = await makeApp().request('/network/assets');

    expect(response.status).toBe(200);
    expect(networkAssetsMock).toHaveBeenCalledTimes(1);
    expect(networkAssetDetailMock).not.toHaveBeenCalled();
  });
});
