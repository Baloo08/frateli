import { query } from "./db";

export type PortalContext = "admin" | "teach" | "learn" | "studio" | "system";
export type UserRole = "superadmin" | "teacher" | "student";

export interface AuditInput {
  actorId?: string | null;
  actorRole?: UserRole | null;
  portalContext: PortalContext;
  action: string;
  resourceType: string;
  resourceId: string;
  reason?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logAudit(input: AuditInput): Promise<void> {
  await query(
    `INSERT INTO audit_logs (
       actor_id, actor_role, portal_context, action, resource_type, resource_id,
       reason, before_state, after_state, metadata, ip_address, user_agent
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      input.actorId ?? null,
      input.actorRole ?? null,
      input.portalContext,
      input.action,
      input.resourceType,
      input.resourceId,
      input.reason ?? null,
      input.beforeState ? JSON.stringify(input.beforeState) : null,
      input.afterState ? JSON.stringify(input.afterState) : null,
      JSON.stringify(input.metadata ?? {}),
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ]
  );
}
