/**
 * CPEV-W3 — GET /portal/network/assets/:id through the production mount decision,
 * against real Postgres.
 *
 * The portal middleware opens an org context whose currentPartnerId is null unless
 * the route is in SELF_MANAGED_DB_CONTEXT_ROUTES. This suite mirrors that decision
 * (the real isSelfManagedDbContextRoute predicate, else the real withDbAccessContext
 * with portalOrgDbAccessContext) and records every org context the request opens:
 * for GET and HEAD the only one must be the handler's own, with currentPartnerId set.
 */
import './setup';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const track = vi.hoisted(() => ({ contexts: [] as Array<{ orgId?: string; currentPartnerId?: string | null }> }));

vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db')>();
  return {
    ...actual,
    withDbAccessContext: (async (context, fn, options) => {
      if (context.scope === 'organization') track.contexts.push(context);
      return actual.withDbAccessContext(context, fn, options);
    }) as typeof actual.withDbAccessContext,
  };
});

import { db, withDbAccessContext, withSystemDbAccessContext } from '../../db';
import { discoveredAssets } from '../../db/schema';
import { portalBranding } from '../../db/schema/portal';
import { createPartner, createOrganization, createSite } from './db-utils';
import { isSelfManagedDbContextRoute } from '../../middleware/selfManagedDbContextRoutes';
import { portalOrgDbAccessContext } from '../../routes/portal/portalDbContext';
import { portalNetworkRoutes } from '../../routes/portal/network';

const runDb = it.runIf(!!process.env.DATABASE_URL);

function app(orgId: string, partnerId: string) {
  const a = new Hono();
  a.use('/api/v1/portal/*', async (c, next) => {
    c.set('portalAuth', {
      user: { id: 'pu1', orgId, email: 'c@example.test', name: 'Cust', contactId: null, receiveNotifications: true, status: 'active' },
      token: 't', authMethod: 'bearer', partnerId, timezone: 'UTC',
    });
    if (isSelfManagedDbContextRoute(c.req.method, c.req.path)) return next();
    return withDbAccessContext(portalOrgDbAccessContext(orgId), () => next());
  });
  a.route('/api/v1/portal', portalNetworkRoutes);
  return a;
}

async function seed() {
  return withSystemDbAccessContext(async () => {
    const partner = await createPartner();
    const org = await createOrganization({ partnerId: partner.id });
    const other = await createOrganization({ partnerId: partner.id });
    const site = await createSite({ orgId: org.id });
    const otherSite = await createSite({ orgId: other.id });
    await db.insert(portalBranding).values({ orgId: org.id, enableNetworkVisibility: true });
    const [own] = await db.insert(discoveredAssets).values({
      orgId: org.id, siteId: site.id, ipAddress: '10.90.0.1', hostname: 'mount-own', assetType: 'switch', source: 'manual',
    }).returning({ id: discoveredAssets.id });
    const [foreign] = await db.insert(discoveredAssets).values({
      orgId: other.id, siteId: otherSite.id, ipAddress: '10.90.1.1', hostname: 'mount-foreign', assetType: 'switch', source: 'manual',
    }).returning({ id: discoveredAssets.id });
    return { partner, org, own: own!.id, foreign: foreign!.id };
  });
}

describe('portal network asset detail: own DB context is the effective one (CPEV-W3)', () => {
  beforeEach(() => { track.contexts = []; });

  runDb.each(['GET', 'HEAD'])('%s opens only the handler context with currentPartnerId populated', async (method) => {
    const fx = await seed();
    const res = await app(fx.org.id, fx.partner.id).request(`/api/v1/portal/network/assets/${fx.own}`, { method });

    expect(res.status).toBe(200);
    if (method === 'GET') {
      const body = await res.json();
      expect(body.dataStatus).toBe('ok');
      expect(body.data.hostname).toBe('mount-own');
    }
    expect(track.contexts).toHaveLength(1);
    expect(track.contexts[0]).toMatchObject({ orgId: fx.org.id, currentPartnerId: fx.partner.id });
  });

  runDb('another org asset answers the uniform 404 under real RLS', async () => {
    const fx = await seed();
    const res = await app(fx.org.id, fx.partner.id).request(`/api/v1/portal/network/assets/${fx.foreign}`, { method: 'GET' });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Asset not found' });
  });
});
