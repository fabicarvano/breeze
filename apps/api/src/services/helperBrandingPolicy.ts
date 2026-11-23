import type { DbExecutor } from './monitors/monitorCompiler';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { configurationPolicies, configPolicyAssignments, configPolicyEffectiveFeatureLinks, configPolicyFeatureLinks } from '../db/schema';
import { readHelperBranding } from '@breeze/shared/validators/helperBranding';

export const HELPER_BRANDING_LEVEL_ERROR = 'Helper branding is supported only at partner and organization assignment levels';
export class HelperBrandingLevelError extends Error {
  constructor() { super(HELPER_BRANDING_LEVEL_ERROR); }
}
export function hasHelperBranding(settings: unknown): boolean {
  return !!settings && typeof settings === 'object' && !Array.isArray(settings)
    && Object.keys(readHelperBranding((settings as Record<string, unknown>).branding)).length > 0;
}
export function helperBrandingAllowedAt(level: string): boolean {
  return level === 'partner' || level === 'organization';
}
/** Include children inheriting this helper link, but not children with an own override. */
export async function assertHelperBrandingWriteLevels(policyId: string, settings: unknown, executor: DbExecutor = db) {
  if (!hasHelperBranding(settings)) return;
  const children = await executor.select({ id: configurationPolicies.id })
    .from(configurationPolicies).leftJoin(configPolicyFeatureLinks, and(
      eq(configPolicyFeatureLinks.configPolicyId, configurationPolicies.id), eq(configPolicyFeatureLinks.featureType, 'helper'),
    )).where(and(eq(configurationPolicies.parentPolicyId, policyId), isNull(configPolicyFeatureLinks.id)));
  const assignments = await executor.select({ level: configPolicyAssignments.level })
    .from(configPolicyAssignments).where(inArray(configPolicyAssignments.configPolicyId, [policyId, ...children.map(c => c.id)]));
  if (assignments.some(a => !helperBrandingAllowedAt(a.level))) throw new HelperBrandingLevelError();
}
export async function assertHelperBrandingAssignment(policyId: string, level: string, executor: DbExecutor = db) {
  if (helperBrandingAllowedAt(level)) return;
  const links = await executor.select({ inlineSettings: configPolicyEffectiveFeatureLinks.inlineSettings })
    .from(configPolicyEffectiveFeatureLinks).where(and(
      eq(configPolicyEffectiveFeatureLinks.configPolicyId, policyId), eq(configPolicyEffectiveFeatureLinks.featureType, 'helper'),
    ));
  if (links.some(l => hasHelperBranding(l.inlineSettings))) throw new HelperBrandingLevelError();
}

/** One-level, immutable inheritance; lock root before child on every write door. */
export async function lockHelperBrandingPolicy(policyId: string, executor: DbExecutor) {
  const [policy] = await executor.select({ parentPolicyId: configurationPolicies.parentPolicyId })
    .from(configurationPolicies).where(eq(configurationPolicies.id, policyId)).limit(1);
  for (const id of [...(policy?.parentPolicyId ? [policy.parentPolicyId] : []), policyId])
    await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`helper-branding-policy:${id}`}, 0))`);
}
/** Removing a child's own link exposes the immutable parent's Helper link. */
export async function assertHelperBrandingRemoval(policyId: string, executor: DbExecutor) {
  const [policy] = await executor.select({ parentPolicyId: configurationPolicies.parentPolicyId })
    .from(configurationPolicies).where(eq(configurationPolicies.id, policyId)).limit(1);
  if (!policy?.parentPolicyId) return;
  const [parent] = await executor.select({ inlineSettings: configPolicyFeatureLinks.inlineSettings })
    .from(configPolicyFeatureLinks).where(and(eq(configPolicyFeatureLinks.configPolicyId, policy.parentPolicyId), eq(configPolicyFeatureLinks.featureType, 'helper'))).limit(1);
  await assertHelperBrandingWriteLevels(policyId, parent?.inlineSettings, executor);
}
