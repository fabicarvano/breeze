/**
 * Effective Breeze Helper settings for a device — the single resolver shared
 * by the agent heartbeat (helperEnabled/helperSettings), helperAuth (a Helper
 * disabled by policy stops authenticating) and GET /helper/config.
 *
 * Operational precedence: the winning `helper` feature link, then defaults.
 * No match (or a legacy null settings winner) uses the legacy org enabled flag.
 * Branding has its own partner → organization field merge and opaque tenant
 * scope; a device/site/group operational winner never hides that branding.
 */
import { createHash } from 'node:crypto';
import { readHelperBranding, type EffectiveHelperBranding, type HelperBrandingValues } from '@breeze/shared/validators/helperBranding';
import { hierarchyFor, type DeviceHierarchyOpts } from './deviceHierarchy';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db';
import {
  configPolicyAssignments,
  configPolicyEffectiveFeatureLinks,
  configurationPolicies,
  deviceGroupMemberships,
  devices,
  organizations,
} from '../db/schema';
import { getRedis } from './redis';
import { policyOwnershipCondition } from './configPolicyOwnership';

const LEVEL_PRIORITY: Record<string, number> = {
  device: 5,
  device_group: 4,
  site: 3,
  organization: 2,
  partner: 1,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function getOrgHelperSettings(orgId: string): Promise<{ enabled: boolean }> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const settings = isObject(org?.settings) ? org.settings : {};
  const helper = isObject(settings.helper) ? settings.helper : {};
  const enabled = typeof helper.enabled === 'boolean' ? helper.enabled : false;
  return { enabled };
}


export interface HelperSettings {
  enabled: boolean;
  branding?: EffectiveHelperBranding;
  /**
   * Whether Breeze Assist draws its system-tray icon. Independent of
   * `enabled` — the helper still serves chat, remote-access consent and PAM
   * dialogs with the icon hidden (#3202). Defaults to true; only an explicit
   * false hides it (the agent treats an absent field as true so an older
   * server can never blank a fleet's trays).
   */
  showTrayIcon: boolean;
  showOpenPortal: boolean;
  showDeviceInfo: boolean;
  showRequestSupport: boolean;
  portalUrl?: string;
  /**
   * Helper lifecycle override for RDS hosts ('auto' | 'always-on' |
   * 'on-demand'). Undefined = auto. Precedence on the agent: explicit local
   * agent config > this value > RDS auto-detection. Cached with the rest of
   * the helper settings (120s) — mode changes land within TTL + heartbeat.
   */
  lifecycleMode?: 'auto' | 'always-on' | 'on-demand';
}

const HELPER_DEFAULTS: HelperSettings = {
  enabled: false,
  showTrayIcon: true,
  showOpenPortal: true,
  showDeviceInfo: true,
  showRequestSupport: true,
};

// Resolves the helper feature settings for a device from configuration
// policies. Returns null when NO helper feature link matched — callers
// distinguish "no policy" (legacy org fallback applies) from an explicit
// enabled:false (which must win; see buildHelperConfigUpdate). A legacy link
// with null inlineSettings keeps the org enabled fallback but returns an
// object so independently resolved branding can still reach the device.
export async function resolveDeviceHelperSettings(deviceId: string, opts?: HelperConfigUpdateOptions): Promise<HelperSettings | null> {
  // #8053 W1a-1: the heartbeat passes the hierarchy it already loaded; every
  // other caller gets the three reads below, unchanged.
  const passed = hierarchyFor(deviceId, opts);

  // 1. Load device
  const [device] = passed
    ? [{ orgId: passed.orgId, siteId: passed.siteId }]
    : await db
      .select({ orgId: devices.orgId, siteId: devices.siteId })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .limit(1);

  if (!device) return null;

  // 2. Load org (for partnerId)
  const [org] = passed
    ? (passed.org ? [{ partnerId: passed.org.partnerId }] : [])
    : await db
      .select({ partnerId: organizations.partnerId })
      .from(organizations)
      .where(eq(organizations.id, device.orgId))
      .limit(1);

  // 3. Load device group memberships
  const groupIds = passed
    ? [...passed.groupIds]
    : (await db
      .select({ groupId: deviceGroupMemberships.groupId })
      .from(deviceGroupMemberships)
      .where(eq(deviceGroupMemberships.deviceId, deviceId))).map((r) => r.groupId);

  // 4. Build target match conditions
  const targetConditions = [
    and(eq(configPolicyAssignments.level, 'device'), eq(configPolicyAssignments.targetId, deviceId)),
    and(eq(configPolicyAssignments.level, 'site'), eq(configPolicyAssignments.targetId, device.siteId)),
    and(eq(configPolicyAssignments.level, 'organization'), eq(configPolicyAssignments.targetId, device.orgId)),
  ];
  if (groupIds.length > 0) {
    targetConditions.push(
      and(eq(configPolicyAssignments.level, 'device_group'), inArray(configPolicyAssignments.targetId, groupIds))!
    );
  }
  if (org?.partnerId) {
    targetConditions.push(
      and(eq(configPolicyAssignments.level, 'partner'), eq(configPolicyAssignments.targetId, org.partnerId))!
    );
  }

  // 5. Single query: assignments → active policies → helper feature link (pure JSONB)
  const rows = await db
    .select({
      level: configPolicyAssignments.level,
      assignmentPriority: configPolicyAssignments.priority,
      inlineSettings: configPolicyEffectiveFeatureLinks.inlineSettings,
    })
    .from(configPolicyAssignments)
    .innerJoin(configurationPolicies, eq(configPolicyAssignments.configPolicyId, configurationPolicies.id))
    .innerJoin(configPolicyEffectiveFeatureLinks, and(
      eq(configPolicyEffectiveFeatureLinks.configPolicyId, configurationPolicies.id),
      eq(configPolicyEffectiveFeatureLinks.featureType, 'helper'),
    ))
    .where(and(
      eq(configurationPolicies.status, 'active'),
      policyOwnershipCondition({ orgId: device.orgId, partnerId: org?.partnerId ?? null }),
      or(...targetConditions),
    ));

  if (rows.length === 0) return null;

  // 6. Sort by level priority DESC, then assignment priority ASC — first match wins
  rows.sort((a, b) => {
    const levelDiff = (LEVEL_PRIORITY[b.level] ?? 0) - (LEVEL_PRIORITY[a.level] ?? 0);
    if (levelDiff !== 0) return levelDiff;
    return a.assignmentPriority - b.assignmentPriority;
  });

  const winner = rows[0];
  if (!winner) return null;

  const s = isObject(winner.inlineSettings) ? winner.inlineSettings : {};
  // Preserve the existing null-inlineSettings legacy fallback while resolving
  // branding independently of that operational winner.
  const nullWinnerEnabled = !winner.inlineSettings ? (await (opts?.loadOrgHelperSettings ?? getOrgHelperSettings)(device.orgId)).enabled : undefined;
  const branding = resolveHelperBrandingRows(rows, device.orgId, org?.partnerId ?? null);
  return {
    branding,
    enabled: typeof s.enabled === 'boolean' ? s.enabled : nullWinnerEnabled ?? HELPER_DEFAULTS.enabled,
    showTrayIcon: typeof s.showTrayIcon === 'boolean' ? s.showTrayIcon : HELPER_DEFAULTS.showTrayIcon,
    showOpenPortal: typeof s.showOpenPortal === 'boolean' ? s.showOpenPortal : HELPER_DEFAULTS.showOpenPortal,
    showDeviceInfo: typeof s.showDeviceInfo === 'boolean' ? s.showDeviceInfo : HELPER_DEFAULTS.showDeviceInfo,
    showRequestSupport: typeof s.showRequestSupport === 'boolean' ? s.showRequestSupport : HELPER_DEFAULTS.showRequestSupport,
    portalUrl: typeof s.portalUrl === 'string' && s.portalUrl ? s.portalUrl : undefined,
    lifecycleMode: s.lifecycleMode === 'auto' || s.lifecycleMode === 'always-on' || s.lifecycleMode === 'on-demand'
      ? s.lifecycleMode
      : undefined,
  };
}

export function helperBrandingScope(orgId: string, partnerId: string | null): string {
  return createHash('sha256').update(JSON.stringify(['helper-branding-v1', partnerId, orgId])).digest('hex');
}
/** Rows are already sorted using the unchanged operational assignment order. */
export function resolveHelperBrandingRows(
  rows: ReadonlyArray<{ level: string; inlineSettings: unknown }>, orgId: string, partnerId: string | null,
): EffectiveHelperBranding {
  const values: HelperBrandingValues = {};
  for (const level of ['partner', 'organization']) {
    const winner = rows.find(row => row.level === level);
    const settings = isObject(winner?.inlineSettings) ? winner.inlineSettings : {};
    Object.assign(values, readHelperBranding(settings.branding));
  }
  const scopeId = helperBrandingScope(orgId, partnerId);
  return Object.keys(values).length ? { state: 'set', scopeId, values } : { state: 'cleared', scopeId };
}

const HELPER_CACHE_TTL_SECONDS = 120;

/**
 * Build helper config update payload for heartbeat response (also the
 * effective setting helperAuth and GET /helper/config use).
 * Resolves helper policy settings via the config policy hierarchy.
 * Falls back to org-level helperEnabled for backward compatibility,
 * then to defaults if no policy found.
 */
export interface HelperConfigUpdateOptions extends DeviceHierarchyOpts {
  /** The caller already read the Redis entry this beat (and missed). */
  skipCacheRead?: boolean;
  /** Source of the legacy organizations.settings.helper flag; defaults to getOrgHelperSettings. */
  loadOrgHelperSettings?: (orgId: string) => Promise<{ enabled: boolean }>;
}

function helperCacheKey(deviceId: string): string {
  return `helper:settings:device:${deviceId}`;
}

/** The device's cached helper settings, or null on a miss or a Redis error. */
export async function readCachedHelperSettings(deviceId: string, opts?: DeviceHierarchyOpts): Promise<HelperSettings | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get(helperCacheKey(deviceId));
    if (!cached) return null;
    const settings = JSON.parse(cached) as HelperSettings;
    // A pre-upgrade cache entry has no explicit branding state; refresh it.
    if (!settings.branding) return null;
    const passed = hierarchyFor(deviceId, opts);
    const [scope] = passed ? [{ orgId: passed.orgId, partnerId: passed.org?.partnerId ?? null }]
      : await db.select({ orgId: devices.orgId, partnerId: organizations.partnerId }).from(devices)
        .innerJoin(organizations, eq(organizations.id, devices.orgId)).where(eq(devices.id, deviceId)).limit(1);
    return scope && settings.branding.scopeId === helperBrandingScope(scope.orgId, scope.partnerId) ? settings : null;
  } catch (cacheErr) {
    console.warn(`[helper] Redis cache read failed for device ${deviceId}:`, cacheErr);
    return null;
  }
}

export async function buildHelperConfigUpdate(
  deviceId: string,
  orgId: string,
  opts?: HelperConfigUpdateOptions,
): Promise<HelperSettings> {
  // Validate up front so a foreign hierarchy is a bug even on a cache hit here. The heartbeat
  // does its own Redis read first (readCachedHelperSettings) and never reaches this guard on a
  // hit; this covers direct callers of buildHelperConfigUpdate.
  hierarchyFor(deviceId, opts);
  if (!opts?.skipCacheRead) {
    const cached = await readCachedHelperSettings(deviceId, opts);
    if (cached) return cached;
  }

  // Try config policy resolution first
  let settings = await resolveDeviceHelperSettings(deviceId, opts);

  // Legacy org-level fallback applies ONLY when no policy matched at all. An
  // explicit enabled:false policy must win over organizations.settings.helper
  // (previously `!settings.enabled` fell through, and the fallback also
  // discarded the four resolved UI fields).
  //
  // A failed read (policy resolution above, or the org flag here) throws and
  // is never cached: it must not turn into a cached enabled:false, which
  // helperAuth would serve as helper_disabled and the heartbeat would deliver
  // as an uninstall. Only Redis errors are soft.
  if (settings === null) {
    const loadOrg = opts?.loadOrgHelperSettings ?? getOrgHelperSettings;
    const orgEnabled = (await loadOrg(orgId)).enabled;
    // No matching policy still sends an explicit cleared block. The partner axis
    // is part of its opaque scope, so a moved device cannot retain another brand.
    const passed = hierarchyFor(deviceId, opts);
    const [org] = passed ? [{ partnerId: passed.org?.partnerId ?? null }]
      : await db.select({ partnerId: organizations.partnerId }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    settings = { ...HELPER_DEFAULTS, enabled: orgEnabled, branding: resolveHelperBrandingRows([], orgId, org?.partnerId ?? null) };
  }

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(helperCacheKey(deviceId), JSON.stringify(settings), 'EX', HELPER_CACHE_TTL_SECONDS);
    } catch (cacheErr) {
      console.warn(`[helper] Redis cache write failed for device ${deviceId}:`, cacheErr);
    }
  }

  return settings;
}
