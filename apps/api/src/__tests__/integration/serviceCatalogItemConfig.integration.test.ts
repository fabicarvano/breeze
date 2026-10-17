/**
 * service_catalog_items — item configuration columns and same-partner references (#8325).
 *
 * Migration: 2026-12-29-150000-service-catalog-item-config.sql.
 * Spec: docs/superpowers/specs/ticketing/2026-10-10-service-catalog-design.md §5, §6.1.
 *
 * Drives the real driver and asserts the database constraints: descriptive
 * CHECKs (ITIL class, delivery, SLA pair, grouping), composite same-partner
 * FKs to forms/categories/work types, and ON DELETE SET NULL (<column>) which
 * must clear only the link and never the XOR owner. Statements that must
 * reach a constraint are issued under SYSTEM scope, which short-circuits RLS.
 */
import './setup';
import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, withDbAccessContext, type DbAccessContext } from '../../db';
import {
  serviceCatalogs,
  serviceCatalogItems,
  ticketCategories,
  ticketForms,
  workTypes,
} from '../../db/schema';
import { pgErrorCode } from '../../utils/pgErrors';
import { createOrganization, createPartner } from './db-utils';

const SYSTEM_CTX: DbAccessContext = {
  scope: 'system',
  orgId: null,
  accessibleOrgIds: null,
  accessiblePartnerIds: null,
  userId: null,
};

async function expectSqlState(fn: () => Promise<unknown>, code: string): Promise<void> {
  let raised: unknown;
  try {
    await fn();
  } catch (err) {
    raised = err;
  }
  expect(raised, `expected SQLSTATE ${code}, but the statement succeeded`).toBeDefined();
  expect(pgErrorCode(raised)).toBe(code);
}

const asSystem = <T>(fn: () => Promise<T>): Promise<T> => withDbAccessContext(SYSTEM_CTX, fn);
const rand = (): string => Math.random().toString(36).slice(2, 10);

async function seedCatalog(owner: { partnerId?: string | null; orgId?: string | null }): Promise<string> {
  const rows = await asSystem(() =>
    db
      .insert(serviceCatalogs)
      .values({ partnerId: owner.partnerId ?? null, orgId: owner.orgId ?? null, name: `Catalog ${rand()}` })
      .returning({ id: serviceCatalogs.id }),
  );
  return rows[0]!.id;
}

type ItemValues = Partial<typeof serviceCatalogItems.$inferInsert>;

async function insertItem(catalogId: string, owner: { partnerId?: string; orgId?: string }, extra: ItemValues = {}) {
  const rows = await asSystem(() =>
    db
      .insert(serviceCatalogItems)
      .values({
        catalogId,
        partnerId: owner.partnerId ?? null,
        orgId: owner.orgId ?? null,
        name: `Item ${rand()}`,
        ...extra,
      })
      .returning(),
  );
  return rows[0]!;
}

async function seedCategory(partnerId: string): Promise<string> {
  const rows = await asSystem(() =>
    db.insert(ticketCategories).values({ partnerId, name: `Category ${rand()}` }).returning({ id: ticketCategories.id }),
  );
  return rows[0]!.id;
}

async function seedWorkType(partnerId: string): Promise<string> {
  const rows = await asSystem(() =>
    db.insert(workTypes).values({ partnerId, name: `Work type ${rand()}` }).returning({ id: workTypes.id }),
  );
  return rows[0]!.id;
}

async function seedForm(owner: { partnerId?: string; orgId?: string }): Promise<string> {
  const rows = await asSystem(() =>
    db
      .insert(ticketForms)
      .values({ partnerId: owner.partnerId ?? null, orgId: owner.orgId ?? null, name: `Form ${rand()}` })
      .returning({ id: ticketForms.id }),
  );
  return rows[0]!.id;
}

async function reloadItem(id: string) {
  const rows = await asSystem(() => db.select().from(serviceCatalogItems).where(eq(serviceCatalogItems.id, id)));
  return rows[0];
}

async function partnerSetup() {
  const partner = await createPartner();
  const catalogId = await seedCatalog({ partnerId: partner.id });
  return { partner, catalogId };
}

describe('service catalog item defaults and metadata (#8325)', () => {
  it('starts hidden with version 1, order 0 and no optional metadata', async () => {
    const { partner, catalogId } = await partnerSetup();
    const item = await insertItem(catalogId, { partnerId: partner.id });
    expect(item.showInPortal).toBe(false);
    expect(item.sortOrder).toBe(0);
    expect(item.version).toBe(1);
    expect(item.pillar).toBeNull();
    expect(item.serviceLine).toBeNull();
    expect(item.itilClass).toBeNull();
    expect(item.delivery).toBeNull();
    expect(item.slaTargetKind).toBeNull();
    expect(item.slaTargetMinutes).toBeNull();
    expect(item.formId).toBeNull();
    expect(item.categoryId).toBeNull();
    expect(item.workTypeId).toBeNull();
  });

  it('stores full metadata with same-partner form, category and work type', async () => {
    const { partner, catalogId } = await partnerSetup();
    const formId = await seedForm({ partnerId: partner.id });
    const categoryId = await seedCategory(partner.id);
    const workTypeId = await seedWorkType(partner.id);
    const item = await insertItem(
      catalogId,
      { partnerId: partner.id },
      {
        pillar: 'Security',
        serviceLine: 'Endpoint',
        itilClass: 'service_request',
        delivery: 'hybrid',
        slaTargetKind: 'resolution',
        slaTargetMinutes: 480,
        formId,
        categoryId,
        workTypeId,
        showInPortal: true,
        sortOrder: 5,
      },
    );
    expect(item).toMatchObject({
      pillar: 'Security',
      serviceLine: 'Endpoint',
      itilClass: 'service_request',
      delivery: 'hybrid',
      slaTargetKind: 'resolution',
      slaTargetMinutes: 480,
      formId,
      categoryId,
      workTypeId,
      showInPortal: true,
      sortOrder: 5,
    });
  });
});

describe('service catalog item CHECK constraints (#8325)', () => {
  it('accepts every ITIL class and delivery value and rejects others (23514)', async () => {
    const { partner, catalogId } = await partnerSetup();
    for (const itilClass of ['incident', 'service_request', 'problem', 'change']) {
      await insertItem(catalogId, { partnerId: partner.id }, { itilClass });
    }
    for (const delivery of ['remote', 'onsite', 'hybrid']) {
      await insertItem(catalogId, { partnerId: partner.id }, { delivery });
    }
    await expectSqlState(() => insertItem(catalogId, { partnerId: partner.id }, { itilClass: 'epic' }), '23514');
    await expectSqlState(() => insertItem(catalogId, { partnerId: partner.id }, { delivery: 'teleport' }), '23514');
  });

  it('requires the SLA target as a pair of a known kind and positive minutes (23514)', async () => {
    const { partner, catalogId } = await partnerSetup();
    const owner = { partnerId: partner.id };
    await insertItem(catalogId, owner, { slaTargetKind: 'response', slaTargetMinutes: 30 });
    await insertItem(catalogId, owner, { slaTargetKind: 'resolution', slaTargetMinutes: 1 });
    await expectSqlState(() => insertItem(catalogId, owner, { slaTargetKind: 'response' }), '23514');
    await expectSqlState(() => insertItem(catalogId, owner, { slaTargetMinutes: 30 }), '23514');
    await expectSqlState(() => insertItem(catalogId, owner, { slaTargetKind: 'response', slaTargetMinutes: 0 }), '23514');
    await expectSqlState(() => insertItem(catalogId, owner, { slaTargetKind: 'response', slaTargetMinutes: -5 }), '23514');
    await expectSqlState(() => insertItem(catalogId, owner, { slaTargetKind: 'uptime', slaTargetMinutes: 30 }), '23514');
  });

  it('allows a pillar without a service line but not a service line without a pillar (23514)', async () => {
    const { partner, catalogId } = await partnerSetup();
    const owner = { partnerId: partner.id };
    await insertItem(catalogId, owner, { pillar: 'Cloud' });
    await insertItem(catalogId, owner, { pillar: 'Cloud', serviceLine: 'Backup' });
    await expectSqlState(() => insertItem(catalogId, owner, { serviceLine: 'Backup' }), '23514');
  });

  it('rejects blank pillar and service line (23514)', async () => {
    const { partner, catalogId } = await partnerSetup();
    const owner = { partnerId: partner.id };
    await expectSqlState(() => insertItem(catalogId, owner, { pillar: '   ' }), '23514');
    await expectSqlState(() => insertItem(catalogId, owner, { pillar: 'Cloud', serviceLine: '' }), '23514');
  });

  it('rejects a version below 1 (23514)', async () => {
    const { partner, catalogId } = await partnerSetup();
    await expectSqlState(() => insertItem(catalogId, { partnerId: partner.id }, { version: 0 }), '23514');
  });
});

describe('service catalog item same-partner references (#8325)', () => {
  it('rejects a form, category or work type from another partner (23503)', async () => {
    const { partner, catalogId } = await partnerSetup();
    const other = await createPartner();
    const owner = { partnerId: partner.id };
    await expectSqlState(async () => insertItem(catalogId, owner, { formId: await seedForm({ partnerId: other.id }) }), '23503');
    await expectSqlState(async () => insertItem(catalogId, owner, { categoryId: await seedCategory(other.id) }), '23503');
    await expectSqlState(async () => insertItem(catalogId, owner, { workTypeId: await seedWorkType(other.id) }), '23503');
  });

  it('rejects an organization-owned form on a partner-wide item (23503)', async () => {
    const { partner, catalogId } = await partnerSetup();
    const org = await createOrganization({ partnerId: partner.id });
    const orgFormId = await seedForm({ orgId: org.id });
    await expectSqlState(() => insertItem(catalogId, { partnerId: partner.id }, { formId: orgFormId }), '23503');
  });

  it('rejects an update that points to another partner reference (23503)', async () => {
    const { partner, catalogId } = await partnerSetup();
    const other = await createPartner();
    const item = await insertItem(catalogId, { partnerId: partner.id });
    const foreignCategory = await seedCategory(other.id);
    await expectSqlState(
      () =>
        asSystem(() =>
          db.update(serviceCatalogItems).set({ categoryId: foreignCategory }).where(eq(serviceCatalogItems.id, item.id)),
        ),
      '23503',
    );
  });

  it('keeps organization-owned items free of partner references (23514)', async () => {
    const partner = await createPartner();
    const org = await createOrganization({ partnerId: partner.id });
    const orgCatalogId = await seedCatalog({ orgId: org.id });
    const categoryId = await seedCategory(partner.id);
    await insertItem(orgCatalogId, { orgId: org.id });
    await expectSqlState(() => insertItem(orgCatalogId, { orgId: org.id }, { categoryId }), '23514');
  });

  it('declares the three composite FKs DEFERRABLE INITIALLY IMMEDIATE with SET NULL on delete', async () => {
    const result = await asSystem(() =>
      db.execute(sql`
        SELECT conname, condeferrable, condeferred, confdeltype
        FROM pg_constraint
        WHERE conrelid = 'service_catalog_items'::regclass
          AND conname IN (
            'service_catalog_items_form_partner_fk',
            'service_catalog_items_category_partner_fk',
            'service_catalog_items_work_type_partner_fk'
          )
        ORDER BY conname
      `),
    );
    const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{
      conname: string;
      condeferrable: boolean;
      condeferred: boolean;
      confdeltype: string;
    }>;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.condeferrable, row.conname).toBe(true);
      expect(row.condeferred, row.conname).toBe(false);
      expect(row.confdeltype, row.conname).toBe('n');
    }
  });
});

describe('service catalog item reference lifecycle (#8325)', () => {
  it('clears only the deleted link and keeps the item and its partner owner', async () => {
    const { partner, catalogId } = await partnerSetup();
    const formId = await seedForm({ partnerId: partner.id });
    const categoryId = await seedCategory(partner.id);
    const workTypeId = await seedWorkType(partner.id);
    const item = await insertItem(catalogId, { partnerId: partner.id }, { formId, categoryId, workTypeId });

    await asSystem(() => db.delete(workTypes).where(eq(workTypes.id, workTypeId)));
    let current = (await reloadItem(item.id))!;
    expect(current.workTypeId).toBeNull();
    expect(current.categoryId).toBe(categoryId);
    expect(current.formId).toBe(formId);
    expect(current.partnerId).toBe(partner.id);

    await asSystem(() => db.delete(ticketCategories).where(eq(ticketCategories.id, categoryId)));
    current = (await reloadItem(item.id))!;
    expect(current.categoryId).toBeNull();
    expect(current.formId).toBe(formId);
    expect(current.partnerId).toBe(partner.id);

    await asSystem(() => db.delete(ticketForms).where(eq(ticketForms.id, formId)));
    current = (await reloadItem(item.id))!;
    expect(current.formId).toBeNull();
    expect(current.partnerId).toBe(partner.id);
    expect(current.orgId).toBeNull();
  });
});
