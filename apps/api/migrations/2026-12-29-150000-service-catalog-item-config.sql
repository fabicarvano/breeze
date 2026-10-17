-- Service Catalog item configuration (#8325, spec §5/§6.1).
-- Adds the minimal item metadata agreed in #7792 on top of the ownership
-- foundation (2026-12-28-120000). No access/entitlement tables here.
-- Idempotent; no RLS change (service_catalog_items already has forced RLS,
-- ownership policies and grants).

ALTER TABLE service_catalog_items
  ADD COLUMN IF NOT EXISTS pillar varchar(120),
  ADD COLUMN IF NOT EXISTS service_line varchar(120),
  ADD COLUMN IF NOT EXISTS itil_class varchar(20),
  ADD COLUMN IF NOT EXISTS delivery varchar(20),
  ADD COLUMN IF NOT EXISTS sla_target_kind varchar(20),
  ADD COLUMN IF NOT EXISTS sla_target_minutes integer,
  ADD COLUMN IF NOT EXISTS form_id uuid,
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS work_type_id uuid,
  ADD COLUMN IF NOT EXISTS show_in_portal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  -- Descriptive grouping only (pillar -> service line -> activity); no taxonomy tables.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_grouping_chk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_grouping_chk CHECK (
      (pillar IS NULL OR btrim(pillar) <> '')
      AND (service_line IS NULL OR btrim(service_line) <> '')
      -- A service line only exists inside a pillar.
      AND (service_line IS NULL OR pillar IS NOT NULL)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_itil_class_chk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_itil_class_chk
      CHECK (itil_class IS NULL OR itil_class IN ('incident', 'service_request', 'problem', 'change'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_delivery_chk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_delivery_chk
      CHECK (delivery IS NULL OR delivery IN ('remote', 'onsite', 'hybrid'));
  END IF;

  -- SLA target is an optional pair; both absent means "inherit". Zero never means inherit.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_sla_target_chk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_sla_target_chk CHECK (
      (sla_target_kind IS NULL AND sla_target_minutes IS NULL)
      -- IS NOT NULL is explicit: a NULL kind with minutes set must fail, not evaluate to NULL (CHECK passes on NULL).
      OR (sla_target_kind IS NOT NULL AND sla_target_kind IN ('response', 'resolution')
          AND sla_target_minutes IS NOT NULL AND sla_target_minutes > 0)
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_version_chk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_version_chk CHECK (version >= 1);
  END IF;

  -- Form/category/work type are partner-owned. Org-owned items (not created in this
  -- delivery) cannot reference them until a resolution policy exists.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_org_no_partner_refs_chk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_org_no_partner_refs_chk CHECK (
      partner_id IS NOT NULL OR (form_id IS NULL AND category_id IS NULL AND work_type_id IS NULL)
    );
  END IF;

  -- ticket_forms is dual-axis; the composite FK below needs a unique target.
  -- A partner-wide form has partner_id set; org-owned forms (partner_id NULL) never match.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_forms_id_partner_id_key') THEN
    ALTER TABLE ticket_forms ADD CONSTRAINT ticket_forms_id_partner_id_key UNIQUE (id, partner_id);
  END IF;

  -- Same-partner references. ON DELETE SET NULL (col) clears only the link column and
  -- keeps partner_id (the XOR owner) intact. DEFERRABLE for org merge/repoint, like R1.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_form_partner_fk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_form_partner_fk
      FOREIGN KEY (form_id, partner_id) REFERENCES ticket_forms (id, partner_id)
      ON DELETE SET NULL (form_id) DEFERRABLE INITIALLY IMMEDIATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_category_partner_fk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_category_partner_fk
      FOREIGN KEY (category_id, partner_id) REFERENCES ticket_categories (id, partner_id)
      ON DELETE SET NULL (category_id) DEFERRABLE INITIALLY IMMEDIATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_items_work_type_partner_fk') THEN
    ALTER TABLE service_catalog_items ADD CONSTRAINT service_catalog_items_work_type_partner_fk
      FOREIGN KEY (work_type_id, partner_id) REFERENCES work_types (id, partner_id)
      ON DELETE SET NULL (work_type_id) DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS service_catalog_items_form_idx ON service_catalog_items (form_id) WHERE form_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_catalog_items_category_idx ON service_catalog_items (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_catalog_items_work_type_idx ON service_catalog_items (work_type_id) WHERE work_type_id IS NOT NULL;
