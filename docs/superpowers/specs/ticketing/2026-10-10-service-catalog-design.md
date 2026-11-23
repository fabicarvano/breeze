# Service Catalog over Intake Forms — Design Spec

**Date:** 2026-10-10
**Status:** Draft, for review. Specification only; implementation is not scheduled.
**Tracking:** [#8325](https://github.com/LanternOps/breeze/issues/8325)
**Source:** [Discussion #7792](https://github.com/LanternOps/breeze/discussions/7792#discussioncomment-18844392)
**Dependencies:** #7900 for future ticket-type mapping only. Initial catalog, entitlement and portal delivery is independent.
**Code baseline:** `4d46c8961af36a0c0a485936c3df64e89a184f5b`

## 1. Problem and goal

Intake Forms already support structured requests, but do not provide a partner-defined service hierarchy or contract-backed access to individual services. The commercial catalog serves pricing and billing, while Service Deliverables covers recurring obligations.

**Goal:** provide a lightweight, partner-managed catalog of on-demand services. An entitled customer browses a service, completes its existing intake form, and creates a native ticket with the resolved SLA stamped at creation.

The request flow is: contract entitlement → service item → intake form → native ticket → existing ticket SLA engine.

Recurring work stays: contract → Service Deliverable → occurrence → due date → execution → evidence.

### 1.1 Scope decisions

| ID | Decision | Initial contract |
| --- | --- | --- |
| D1 | Thin catalog layer | Resolve each item to an existing Intake Form and native ticket creation. |
| D2 | SLA reuse | Stamp the existing response/resolution minute fields; keep the current SLA engine. |
| D3 | On-demand services | Recurring obligations remain in Service Deliverables. |
| D4 | Partner-wide configuration | One shared catalog per partner; organization-scoped entitlement rows. |
| D5 | Minimal metadata | Pillar, service line, activity, ITIL class, delivery, SLA target, form, category and work type. |
| D6 | Independent initial delivery | Generic tickets before #7900; type mapping is a later integration. |
| D7 | Separate workstream | Track under #8325 without expanding #7900–#7902. |

These constraints follow the linked discussion. The issue description retains vertical, activity type and after-hours eligibility from the broader proposal; the narrower metadata set defines this initial delivery.

### 1.2 Design status

Table names, routes, contract date eligibility, SLA precedence, snapshot protection and work-type defaulting are proposed contracts. R1–R5 identify the decisions that require spec review. Draft status applies to the full design; this document does not authorize implementation.

## 2. Existing foundations

| Existing capability | Reference | Consequence |
| --- | --- | --- |
| Commercial catalog has hardware/software/service items, prices and billing metadata | `apps/api/src/db/schema/catalog.ts` | Do not rename, replace or repurpose `catalog_items` for request entitlement. |
| Intake forms have dual ownership, category, priority, fields, version and portal visibility | `apps/api/src/db/schema/ticketForms.ts` | Reuse form definitions and rendering. |
| Partner forms already support an organization allowlist | `apps/api/src/db/schema/ticketFormOrgLinks.ts`, `apps/api/src/services/ticketFormService.ts` | Entitlement is an additional gate, never a bypass of form visibility. |
| Native ticket creation validates forms, composes descriptions and snapshots responses | `apps/api/src/services/ticketService.ts:createTicket` | Extend this common path instead of building a catalog-specific ticket writer. |
| Portal lists forms and submits through native ticket creation | `apps/api/src/routes/portal/tickets.ts`, `apps/portal/src/components/portal/NewTicketForm.tsx` | Preserve session-derived org, CSRF, ticket ownership and existing response shapes. |
| SLA targets are stamped on tickets and evaluated by the current worker | `apps/api/src/services/ticketSla.ts`, `apps/api/src/services/ticketService.ts`, `apps/api/src/jobs/ticketSlaWorker.ts` | No new timer, pause policy or breach worker. |
| Category/priority edits may restamp SLA before first response | `apps/api/src/services/ticketService.ts`, `apps/api/src/services/ticketService.slaRestamp.test.ts` | Protect catalog-specific commitments from inadvertent restamping. |
| Contracts have org/partner ownership, lifecycle status and start/end dates | `apps/api/src/db/schema/contracts.ts` | Reuse contracts for entitlement, without changing billing. |
| Work types label labor; categories provide a default work type | `apps/api/src/db/schema/workTypes.ts`, `apps/api/src/db/schema/tickets.ts` | Work type is not ticket type, delivery mode, price or a scheduled work kind. |

Repository contracts: `CLAUDE.md`, `docs/agents/tenancy-rls.md` and `docs/agents/settings.md` require Partner-Wide First configuration, forced RLS, one settings home and explicit inheritance.

The older intake-form spec and current form service contain system-context read patterns. They are evidence of existing behavior, not a license to bypass RLS in new catalog code. Follow the current tenancy playbook for new reads.

## 3. Scope

### 3.1 Initial delivery

- One shared partner catalog.
- Browsing hierarchy: pillar → service line → activity.
- Small service-item metadata set from §1.1.
- Contract-backed, org-scoped item entitlements.
- Staff management and customer portal browsing.
- Resolve item → existing form → native ticket, with SLA snapshot and traceability.
- Generic native tickets; no dependency on #7900 for this delivery.

### 3.2 Excluded

Vertical, activity type, after-hours eligibility, external calendar sync, recurring scheduling, a workflow engine, automatic service execution, new billing/pricing behavior, CAB approvals, change-record implementation, new SLA clocks, service bundles, contract-specific SLA variants and automatic conversion of existing forms or commercial catalog entries.

An ITIL class of `change` is descriptive metadata in the initial delivery. It must never imply that CAB approval occurred or authorize an operational change.

## 4. Item configuration

| Field | Proposed initial behavior |
| --- | --- |
| Name / description | Activity name and short customer-facing explanation. |
| Pillar | Optional grouping label; no separate configurable taxonomy engine. |
| Service line | Optional grouping within a pillar. Ungrouped items remain browsable. |
| Activity | The selectable item itself, rather than another duplicated name field. |
| ITIL class | `incident`, `service_request`, `problem`, `change`; metadata before #7900. |
| Delivery | `remote`, `onsite`, `hybrid`; informational, no dispatch automation. |
| SLA target | One optional pair: kind (`response` or `resolution`) + positive integer minutes. Both absent means inherit. Zero never means inherit. |
| Intake form | Required existing form. Form fields remain authored only in Intake Forms. |
| Ticket category | Optional override; otherwise use the form's category. Same effective partner. |
| Work type | Optional default for subsequent labor entry; otherwise current category behavior. Same partner, active when configured. |
| Active / portal visibility / sort order | Operational controls, default hidden until explicitly published. |

No new priority setting on an item: preserve the existing form/caller priority behavior. A catalog category override does not change form definitions or unrelated tickets.

A partner-wide item links only to a partner-wide form owned by that partner. Organization-specific forms remain on the existing form path; adding org-specific form substitution requires a later spec. Form allowlists still apply to partner-wide forms.

## 5. Data model and tenancy

Names below are intentionally distinct from commercial `catalog_items`.

### 5.1 Configuration

- `service_catalogs`: id, nullable partner_id/org_id with the standard XOR owner check, name, is_active, timestamps.
- `service_catalog_items`: id, catalog_id, nullable partner_id/org_id with XOR ownership, name, description, pillar, service_line, itil_class, delivery, sla_target_kind, sla_target_minutes, form_id, category_id, work_type_id, is_active, show_in_portal, sort_order, version, timestamps.

Partner ownership is the initial authoring path. Enforce a unique partner-owned catalog per partner. Initial APIs do not create org-owned catalog copies; the standard dual-owner shape follows #8325 and Partner-Wide First without offering another catalog to configure per customer. Any future org-owned authoring requires a defined resolution policy first.

Catalog and item ownership must match, proven by database constraints, not only a route check. References must share the effective partner; define composite keys/FKs where applicable. An item cannot point to another partner's form, category or work type.

**Review decision R1:** confirm the standard XOR shape with partner-only initial authoring. If maintainers prefer strictly partner-axis tables for the single-catalog model, document that exception explicitly before implementing; do not silently diverge from #8325.

### 5.2 Contract entitlement

`service_catalog_entitlements`: id, org_id, partner_id, contract_id, item_id, created_at, updated_at. Unique (contract_id, item_id). Contract and organization must match; item, contract and organization must share a partner.

These are org-scoped entitlement rows, not org copies of item configuration. A grant has a required contract in the initial delivery; no implicit all-org grant and no direct grant without a contract.

Multiple active contracts may grant the same item. Availability is their union, deduplicated by item. There is no arbitrary winning contract because grants do not override item settings. The creation snapshot records the qualifying contract IDs as evidence. It does not choose or stamp a billing contract, allocate contract hours or consume an allowance; any future financial attribution must use its own existing billing resolver, never the first entitlement row.

No grants means no catalog items. Unlike intake-form allowlists, an empty entitlement set must never mean access to everything.

### 5.3 Security and lifecycle contracts

- Enable and force RLS in the same migration as each table.
- Configuration uses the standard dual-owner policies plus the sanctioned SELECT-only partner read branch needed by org contexts.
- A partner read branch gives tenant-safe configuration visibility; it does not itself grant portal entitlement. Portal endpoints must return only the entitled projection.
- Entitlement policies use org access, plus database proof that linked resources share ownership. Customer sessions have no entitlement/config write permission.
- Partner-wide config mutations require `canManagePartnerWidePolicies` and the applicable domain permission. Contract-grant mutations require contract-management access for that org.
- Ownership is create-only and cannot be changed by partial updates.
- Never use a system-context escalation to make new catalog reads work. Resolve tenant context from authentication.
- Register RLS shapes, organization cascade/merge/export policies and ticket-move behavior wherever applicable. Org-related composite FKs must be deferrable under the current merge contract.
- Archive items rather than invalidate tickets. Configuration edits, archive and contract expiry affect new requests; existing ticket snapshots remain readable.
- Ticket org moves must not expose old-org contract IDs to the destination org or its portal; retain restricted historical evidence and apply a tenant-safe projection, without treating a historical grant as entitlement in the new org. A physical deletion may clear a historical live reference only if its snapshot survives. Define FK ordering and deletion behavior before migrations.

No migration is part of this spec PR. Implementation must read the migration README and choose filenames after the latest shipped migration, rather than assuming today's date sorts last.

## 6. Service layer: entitlement resolution

Use one server-side resolver for portal list/detail and catalog-backed ticket creation.

An item is available only when:

1. The authenticated requester may create tickets in the target organization and existing Service Management/portal ticket gates permit it.
2. Catalog and item are active, partner-owned by that org's partner and portal-visible for portal callers.
3. At least one grant belongs to that same org and references an eligible contract.
4. The linked form is active and available to that org, including its existing allowlist and portal visibility.

**Proposed contract eligibility:** status `active`, start_date on or before the org's current local date, and end_date absent or on/after that date. Dates are inclusive; use the existing organization timezone resolver and its configured fallback, never the server's host timezone. The implementation plan must identify that resolver and pin its fallback behavior in tests before coding. Draft, paused, cancelled and expired contracts never qualify. Reuse an existing canonical eligibility helper if it matches this contract; do not derive entitlement from an invoice or next_billing_at.

Revalidate at submission even if the item appeared moments earlier. Submit the observed item/form versions as optimistic-concurrency inputs, not authoritative config. When either changed, return a typed conflict and let the requester review the updated form/SLA while preserving responses whose keys/types remain valid. Configuration/grant/contract mutations and request creation must have a defined transactional serialization boundary. A revoke committed before a request's authoritative entitlement check takes effect; a successful create snapshots the state used by that check. Implementation must lock/revalidate the relevant rows in a documented order so a concurrent revoke cannot create an ambiguous partially validated ticket.

Return a non-disclosing unavailable response for inaccessible item IDs. Portal inputs cannot select another org, qualifying contract set, form, category, work type, SLA or ITIL mapping.

**Review decision R2:** confirm active-date eligibility, union semantics and contract-required grants. These edge rules are not defined by the source discussion. The Service Deliverables design (`docs/superpowers/specs/billing/2026-09-10-service-deliverables-portal-design.md`, D1) explicitly distinguishes billing status from service lifetime. Confirm that `active` and the contract dates are valid service-entitlement inputs before adopting this eligibility rule; otherwise define service validity separately.

## 7. Service layer: ticket creation and SLA

### 7.1 Common creation path

Extend the existing submission contract with optional `serviceCatalogItemId`, keeping the current endpoint and generic ticket fields for noncatalog requests.

For a catalog-backed request, the common creation service:

1. Resolves and authorizes the target org as today.
2. Resolves entitlement and the current item/form versions.
3. Uses the item's linked form; validates responses with the existing shared validator.
4. Resolves category from item override → form category; validates partner ownership.
5. Preserves existing form priority/title/description/tags behavior and requester attribution.
6. Resolves SLA once (§7.2), sets work_kind to `support`, and snapshots service metadata (§7.3).
7. Creates the native ticket and existing outbox/audit records through the current transaction.

Catalog identity is server-authoritative. Reject mismatched formId or conflicting catalog-controlled inputs, rather than quietly creating a different request. Staff may still create a generic ticket outside the catalog with their existing permissions; that does not become an entitled catalog request.

Work kind `support` keeps on-demand services under the current SLA engine. It is separate from future ITIL ticket type and from labor work type.

### 7.2 SLA precedence and lifetime

The current noncatalog create chain is category → org priority override → partner priority setting → built-in priority default, independently per target. Preserve that behavior for noncatalog tickets.

**Proposed catalog chain, per target:**

- For the item's selected target: org priority override → item target → category target → partner priority setting → built-in default.
- For the other target: the existing category → org → partner → built-in chain.
- No item target: existing behavior for both targets.
- Authorized, explicit later human SLA edits remain governed by existing ticket permissions.

This makes the service value a partner default and lets an explicit org override win for that value, following the settings contract. Explain that exception to the ordinary category-before-org chain in the UI. The item editor shows the inherited value/source when blank.

Reuse `resolveSlaTargets` and the common effective-target resolver; extend their inputs, not the SLA worker. Stamp `response_sla_minutes` / `resolution_sla_minutes` once at creation.

The catalog-resolved selected target must survive automatic category/priority restamps, including when an org override supplied its value. The other target keeps current restamp behavior. Preserve explicit-human override precedence and existing post-response freeze rules. Store explicit per-target origin and catalog-protection state through a reviewed extension to the existing provenance contract; never infer protection only from the snapshot and never falsely mark service defaults as human edits. A later authorized human edit replaces that target's value/origin and keeps the existing human-edit protection. Item removal/archive does not clear protection; selecting a different service on an existing ticket is outside this delivery. With no configured item target, neither target gains catalog protection.

Catalog, contract or form edits never recompute old ticket targets. Existing business-hours/elapsed-time, pause and breach behavior is unchanged.

**Review decision R3:** confirm org-over-item precedence and selected-target protection. The source discussion requires SLA stamping without defining precedence or later edits.

Example: Adjust VLAN/Port has resolution target 240 minutes. Without an org override, resolution is 240; response inherits the existing chain. With an explicit org resolution override of 180, resolution is 180. A later item edit to 300 does not change either existing ticket.

### 7.3 Traceability and work type

Keep `custom_fields.intakeForm` intact. Add a separate, server-written `custom_fields.serviceCatalog` snapshot containing item/catalog IDs, item version/name, pillar/service line, ITIL class, delivery, effective form ID/version, category, work-type ID/name, qualifying contract IDs and resolved SLA values/sources. Store no contract pricing or private terms in a portal response.

Snapshots are immutable creation evidence; subsequent authorized SLA edits are current-ticket changes with an audit trail, not mutations of the original resolved values. Merge snapshot namespaces; do not replace the existing intake snapshot. The ticket description and existing readers continue working without interpreting new JSON.

Work type proposes a default for subsequent time entries: explicit authorized entry selection (including an explicit null) → catalog snapshot work type → existing category default. Revalidate that the snapshotted work type remains usable; if archived, use the existing valid fallback and show the reason. Do not mutate a shared category, create a rate, bill time or assume a delivery label is a work type.

**Review decision R4:** confirm whether work type should actually default time entries in the initial delivery or remain snapshot metadata until a separate labor-entry change. Current ticket creation has no first-class labor work-type field. Preserve the existing distinction between an omitted workTypeId and an explicit null, and review inactive-default billing behavior in `apps/api/src/services/timeEntryService.ts` before changing fallback semantics.

## 8. Routes and UI

Final permission identifiers and route registration belong to the implementation plan; use existing ticket configuration/contract permissions rather than inventing an unreviewed permission system.

| Surface | Proposed behavior |
| --- | --- |
| Settings → Ticketing → Service Catalog | One partner configuration home; browse/edit items and publication state. Intake fields remain edited in Intake Forms. |
| Contract detail → Service entitlements | Select items for that contract's org. Do not duplicate item settings or commercial contract lines. |
| Portal → New Ticket → Services | Browse only entitled items by pillar/service line and search by activity; choose an item to render its existing form. |
| Existing generic ticket/form path | Preserve current behavior for noncatalog requests. See bypass boundary below. |
| Ticket details | Read-only service identity/delivery and resolved SLA; keep private entitlement evidence out of portal projections. |

Proposed staff API: `/service-catalog` and `/service-catalog/items` for config; `/contracts/:id/service-entitlements` for grants. Proposed portal GET list/detail: `/portal/tickets/services` and `/portal/tickets/services/:id`, registered before dynamic ticket IDs. Catalog submission stays `POST /portal/tickets`.

Use existing request envelopes, pagination/error conventions, CSRF/session handling and rate limits. Detail and list share entitlement logic; slim DTOs contain only the fields needed to browse and render an eligible form. Browsing responses are private and tenant-keyed; stale cached availability never authorizes submission.

Show distinct states for no entitled services, loading, unavailable service and infrastructure error. An unavailable item should not fall back silently to a generic ticket. Retain form inputs when validation fails.

Settings follow `runAction`, page/drawer save conventions, hash-based transient state, nav registration, accessibility and `data-testid` E2E selectors.

### 8.1 Existing forms are not silently made contract-gated

Catalog entitlement authorizes the catalog-specific service path and its configured commitment. Existing standalone forms and generic support remain available under their present visibility rules; they must not gain a catalog snapshot or catalog SLA by sending only a formId.

Consequently, an unentitled customer may still submit a generic request describing the same work. Catalog entitlement does not implement a universal contractual prohibition on all free-text tickets. If a catalog-linked form stays separately portal-visible, it may also appear in the existing picker. To avoid this duplicate path, add a narrowly reviewed form exposure setting or explicit catalog-managed publication mode; do not infer hidden ownership from the existence of item links.

**Review decision R5:** confirm whether standalone visibility of linked forms is acceptable in the initial delivery. Hard gating all service intake would change existing form semantics and requires an explicit decision.

## 9. Future ITIL integration

- #7900 supplies the eventual first-class ticket type mapping. Align enum names with its implemented contract at that time; do not add speculative type columns here.
- Until that dependency lands, all catalog requests create generic tickets and retain descriptive ITIL class in their snapshot.
- #7901 and #7902 supply change fields and CAB approval through their own reviewed designs. This spec neither implements those fields nor approves changes.
- No later dependency should block initial catalog/entitlement/portal delivery. Add integration in a separate plan after the relevant contracts exist.

## 10. Testing and acceptance

| Case | Required result |
| --- | --- |
| Shared partner catalog | Two entitled orgs reuse the same item/configuration. No cloned per-org catalog. |
| Cross-partner references | Database and application guards reject foreign form, category, work type, contract and org combinations. |
| RLS under real breeze_app | Cross-org/partner reads and forged writes denied; XOR and parent ownership enforced. |
| No grants / wrong org | No portal item; direct ID submission denied without disclosing foreign config. |
| Contract lifecycle | Draft/paused/cancelled/expired and out-of-date contracts deny; active boundary dates tested in org timezone. |
| Multiple contracts | One browsable item; removing one grant retains access only if another qualifies. |
| Form restrictions | Inactive, staff-only or org-excluded form denies catalog use even with a grant. |
| Submission tampering | Forged org/form/SLA/category/work-type/contract input cannot change authoritative mapping. |
| SLA resolution | Selected target, org override, inherited second target, nulls and invalid/zero minutes tested. |
| SLA restamp | Catalog-protected target survives category/priority edits; unrelated target and generic tickets retain behavior. |
| Snapshot lifecycle | Item/form rename, archive and entitlement expiry do not rewrite ticket evidence or targets. |
| Concurrency | Grant revocation/config edit versus create has a tested serialization outcome; rollback leaves no ticket/outbox claim. |
| Work type | Explicit selection wins; agreed snapshot default and inactive-type fallback tested. |
| Portal regressions | Session org, CSRF, service-management gates, generic forms and requester attribution preserved. |
| Lifecycle compliance | Cascade, merge, export and ticket/org-move contracts cover new tables/snapshot references. |

Unit/API/shared tests cover resolution and validation. Real PostgreSQL integration tests prove RLS and reference constraints; mocks alone cannot prove tenancy. Portal component tests and Playwright cover browse → form → ticket, denial states and existing generic flow. Reuse existing SLA restamp suites.

For this documentation-only change, validate Markdown, repository-relative references, scope traceability and diff cleanliness. Runtime tests/builds are not applicable because no runtime file changes.

## 11. Phasing

1. Maintainer review of this spec, including R1–R5.
2. An implementation plan based on the accepted choices, with isolated waves and required checks.
3. Configuration and grants with RLS/lifecycle coverage.
4. Common ticket mapping, SLA protection and snapshot behavior.
5. Portal browsing and end-to-end validation.
6. Later #7900 mapping, followed by separate change/CAB integration if approved.

These are sequencing proposals, not scheduled waves or newly registered issues. A spec PR should use `Refs #8325` and state that it delivers design only; it must not close the feature issue.

## 12. References

- [Service Catalog issue #8325](https://github.com/LanternOps/breeze/issues/8325).
- [Source discussion and scope constraints](https://github.com/LanternOps/breeze/discussions/7792#discussioncomment-18844392).
- `docs/superpowers/specs/ticketing/2026-07-10-ticket-intake-forms-design.md`: existing intake contract.
- `docs/superpowers/specs/ticketing/2026-06-12-ticketing-configuration-design.md`: SLA/configuration structure and precedence.
- `docs/superpowers/specs/billing/2026-09-10-service-deliverables-portal-design.md`: recurring-service boundary and billing/service-lifetime distinction.
- `docs/superpowers/specs/portal/2026-10-01-portal-advanced-visibility-design.md`: draft metadata, numbered sections and portal visibility contracts.
- `docs/agents/tenancy-rls.md`, `docs/agents/settings.md`: current tenancy and settings contracts.
