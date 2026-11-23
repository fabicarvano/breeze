# Helper runtime branding and localization

The Phase 2 design is `docs/superpowers/specs/agent/2026-10-08-agent-localization-helper-runtime-branding-design.md`. Maintainer approval, including OD1–OD5 and the proposed field limits, is recorded in [PR #8277](https://github.com/LanternOps/breeze/pull/8277#pullrequestreview-5476399298).

## Configuration

Helper identity is configured only in Configuration Policies → Helper. Partner values are defaults; an organization overrides individual fields. Blank text inherits. Site, device-group and device assignments retain operational Helper settings but cannot carry branding. Branding does not change the existing operational first-match-wins resolver.

The closed identity fields are `displayName` (60 Unicode code points), `companyName` (60), `welcomeTitle` (120), `welcomeMessage` (500), `supportLabel` (40), and `portalLabel` (40). They render as plain text, verbatim in all languages. Controls are rejected. `primaryColor` and `accentColor` accept only `#RRGGBB`; branded backgrounds use a contrasting black or white foreground. Images, URLs, custom CSS, native icons and consent wording are not branding fields.

## Delivery and reset

The existing device-authenticated heartbeat carries effective Helper settings. The optional `branding` block has `state`, `scopeId`, and (for `set`) `values`. The opaque scope derives from the device's partner and organization. Partner/organization policy layers never travel to the device.

- `set`: replace the effective values; absent fields use Breeze defaults.
- `cleared`: remove persisted branding and restore Breeze defaults.
- No block: keep the last-known valid branding, supporting older servers and temporary outages.

The Agent persists identity in existing per-session `sessions/<key>/helper_config.yaml` files. It clears every session on a changed scope or local re-enrollment. Local re-enrollment also changes a branding reset generation: an already-running Agent cannot reapply an old in-flight response, and its Helper manager requires an Agent restart. Unreadable Helper configuration preserves the last valid runtime display; a successfully read file with branding removed restores defaults. A scope mismatch invalidates the old per-device server cache rather than delivering an earlier organization's brand. Runtime branding refreshes titles, tray labels and React surfaces without rebuilding the binary.

## Language and fixed contracts

English and Brazilian Portuguese are supported, with deterministic English fallback. The Helper resolves the interactive user's session language; Windows SYSTEM-launched Helpers consult the user token for their own session. Operator branding and server-provided content are not translated. Security-relevant consent bodies remain Breeze-owned localized templates.

Services, executable/install paths, update identity, API/IPC names and native assets retain their existing identities. SCM event 7031 uses the structured service display name and the Phase 1 canonical service-name mapping. A real Windows event from a branded service must still be verified before claiming platform acceptance.
