import { authorizeAssignmentTarget } from './configurationPolicy';
import { resolveHelperBrandingRows } from './helperSettings';
import { and, eq, or } from 'drizzle-orm';
import { db } from '../db';
import { configPolicyAssignments, configPolicyEffectiveFeatureLinks, configurationPolicies, organizations } from '../db/schema';
import { helperBrandingSchema } from '@breeze/shared/validators/helperBranding';
import { policyOwnershipCondition } from './configPolicyOwnership';
import { helperBrandingAllowedAt } from './helperBrandingPolicy';
import type { AuthContext } from '../middleware/auth';

export async function helperBrandingPreview(policyId: string, auth: AuthContext) {
  const assignments = await db.select({ level: configPolicyAssignments.level, targetId: configPolicyAssignments.targetId })
    .from(configPolicyAssignments).where(eq(configPolicyAssignments.configPolicyId, policyId));
  const contexts = [];
  for (const assignment of assignments) {
    if (!helperBrandingAllowedAt(assignment.level)) continue;
    const access = await authorizeAssignmentTarget(auth, assignment.level as 'partner' | 'organization', assignment.targetId);
    if (!access.valid) continue;
    let partnerId: string | null = assignment.targetId;
    let orgId: string | null = null;
    let targetName = 'Partner';
    if (assignment.level === 'organization') {
      if (auth.scope !== 'system' && !auth.canAccessOrg(assignment.targetId)) continue;
      const [org] = await db.select({ id: organizations.id, partnerId: organizations.partnerId, name: organizations.name })
        .from(organizations).where(eq(organizations.id, assignment.targetId)).limit(1);
      if (!org) continue;
      orgId = org.id; partnerId = org.partnerId; targetName = org.name;
    } else if (auth.scope !== 'system' && (auth.scope !== 'partner' || auth.partnerId !== partnerId)) continue;
    const targets = [and(eq(configPolicyAssignments.level, 'partner'), eq(configPolicyAssignments.targetId, partnerId!))];
    if (orgId) targets.push(and(eq(configPolicyAssignments.level, 'organization'), eq(configPolicyAssignments.targetId, orgId)));
    const rows = await db.select({ policyId: configurationPolicies.id, level: configPolicyAssignments.level, priority: configPolicyAssignments.priority,
      inlineSettings: configPolicyEffectiveFeatureLinks.inlineSettings, policyName: configurationPolicies.name })
      .from(configPolicyAssignments).innerJoin(configurationPolicies, eq(configurationPolicies.id, configPolicyAssignments.configPolicyId))
      .innerJoin(configPolicyEffectiveFeatureLinks, and(eq(configPolicyEffectiveFeatureLinks.configPolicyId, configurationPolicies.id), eq(configPolicyEffectiveFeatureLinks.featureType, 'helper')))
      .where(and(eq(configurationPolicies.status, 'active'),
        orgId ? policyOwnershipCondition({ orgId, partnerId }) : eq(configurationPolicies.partnerId, partnerId!), or(...targets)));
    rows.sort((a, b) => a.priority - b.priority);
    const fields: Record<string, { value?: string; source: { level: 'default' | 'partner' | 'organization'; policyName?: string } }> = {};
    for (const key of Object.keys(helperBrandingSchema.shape)) fields[key] = { source: { level: 'default' } };
    const inheritedRows = assignment.level === 'organization' ? rows.filter(r => r.level === 'partner') : [];
    const selfPartnerDefault = inheritedRows[0]?.policyId === policyId;
    // A shared policy remains the partner winner when its org field is blank.
    // Clearing this draft changes the same field at both assignment levels.
    const inherited = resolveHelperBrandingRows(inheritedRows.map(row => row.policyId === policyId ? { ...row, inlineSettings: {} } : row), orgId ?? '', partnerId);
    const winner = inheritedRows[0];
    for (const [key, value] of Object.entries(inherited.values ?? {}))
      fields[key] = { value, source: { level: 'partner', policyName: winner!.policyName } };
    contexts.push({ level: assignment.level as 'partner' | 'organization', targetId: assignment.targetId, targetName, fields, selfPartnerDefault });
  }
  return { allowed: assignments.every(a => helperBrandingAllowedAt(a.level)), contexts };
}
