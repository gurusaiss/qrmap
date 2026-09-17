/**
 * Authorization. One function decides every permission question.
 *
 * Four roles only, as researched - more would be complexity without merchant
 * benefit (docs/04 §1):
 *   owner    everything in the tenant, including billing, members and deletion
 *   manager  content CRUD and analytics; no billing, no member management
 *   staff    day-to-day toggles: offers and item availability
 *   platform cross-tenant administration
 */

export type MerchantRole = 'owner' | 'manager' | 'staff';
export type PlatformRole = 'super_admin' | 'admin' | 'support';

export type Principal =
  | { kind: 'anon' }
  | { kind: 'merchant'; userId: string; tenantId: string; role: MerchantRole }
  | { kind: 'platform'; userId: string; role: PlatformRole };

export type Action =
  // merchant surface
  | 'profile:read' | 'profile:write'
  | 'catalog:read' | 'catalog:write' | 'catalog:toggle'
  | 'offers:read' | 'offers:write'
  | 'media:read' | 'media:write'
  | 'hours:write'
  | 'qr:read' | 'qr:download'
  | 'analytics:read'
  | 'ai:configure'
  | 'members:read' | 'members:write'
  | 'billing:read' | 'billing:write'
  | 'tenant:delete'
  // platform surface
  | 'platform:tenant:create' | 'platform:tenant:update' | 'platform:tenant:suspend'
  | 'platform:tenant:delete' | 'platform:slug:change' | 'platform:qr:repoint'
  | 'platform:impersonate' | 'platform:categories:write' | 'platform:plans:write'
  | 'platform:flags:write' | 'platform:audit:read' | 'platform:analytics:read';

const MERCHANT_PERMISSIONS: Record<MerchantRole, ReadonlySet<Action>> = {
  staff: new Set<Action>([
    'profile:read', 'catalog:read', 'catalog:toggle', 'offers:read', 'offers:write',
    'media:read', 'qr:read',
  ]),
  manager: new Set<Action>([
    'profile:read', 'profile:write', 'catalog:read', 'catalog:write', 'catalog:toggle',
    'offers:read', 'offers:write', 'media:read', 'media:write', 'hours:write',
    'qr:read', 'qr:download', 'analytics:read', 'ai:configure', 'members:read',
  ]),
  owner: new Set<Action>([
    'profile:read', 'profile:write', 'catalog:read', 'catalog:write', 'catalog:toggle',
    'offers:read', 'offers:write', 'media:read', 'media:write', 'hours:write',
    'qr:read', 'qr:download', 'analytics:read', 'ai:configure',
    'members:read', 'members:write', 'billing:read', 'billing:write', 'tenant:delete',
  ]),
};

const PLATFORM_PERMISSIONS: Record<PlatformRole, ReadonlySet<Action>> = {
  support: new Set<Action>([
    'platform:audit:read', 'platform:analytics:read', 'platform:tenant:update',
  ]),
  admin: new Set<Action>([
    'platform:tenant:create', 'platform:tenant:update', 'platform:tenant:suspend',
    'platform:slug:change', 'platform:impersonate', 'platform:categories:write',
    'platform:plans:write', 'platform:flags:write', 'platform:audit:read',
    'platform:analytics:read',
  ]),
  super_admin: new Set<Action>([
    'platform:tenant:create', 'platform:tenant:update', 'platform:tenant:suspend',
    'platform:tenant:delete', 'platform:slug:change', 'platform:qr:repoint',
    'platform:impersonate', 'platform:categories:write', 'platform:plans:write',
    'platform:flags:write', 'platform:audit:read', 'platform:analytics:read',
  ]),
};

const ROLE_RANK: Record<MerchantRole, number> = { staff: 1, manager: 2, owner: 3 };

export function can(principal: Principal, action: Action): boolean {
  switch (principal.kind) {
    case 'anon':
      return false;
    case 'merchant':
      return MERCHANT_PERMISSIONS[principal.role].has(action);
    case 'platform':
      return PLATFORM_PERMISSIONS[principal.role].has(action);
  }
}

/**
 * Tenant-scoped check. The tenant is taken from the principal, never from the
 * request: a client-supplied tenant id is never trusted.
 */
export function canForTenant(principal: Principal, action: Action, tenantId: string): boolean {
  if (principal.kind === 'merchant') {
    return principal.tenantId === tenantId && can(principal, action);
  }
  return can(principal, action);
}

/** A member may never grant a role at or above their own. */
export function canAssignRole(actor: Principal, target: MerchantRole): boolean {
  if (actor.kind === 'platform') return can(actor, 'platform:tenant:update');
  if (actor.kind !== 'merchant') return false;
  if (!can(actor, 'members:write')) return false;
  return ROLE_RANK[target] < ROLE_RANK[actor.role];
}

export class AuthorizationError extends Error {
  override readonly name = 'AuthorizationError';
  readonly status = 403;
}

export function authorize(principal: Principal, action: Action, tenantId?: string): void {
  const ok = tenantId ? canForTenant(principal, action, tenantId) : can(principal, action);
  if (!ok) throw new AuthorizationError(`not permitted: ${action}`);
}
