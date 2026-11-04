import { describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  authorize,
  can,
  canAssignRole,
  canForTenant,
  type Action,
  type MerchantRole,
  type PlatformRole,
  type Principal,
} from '../rbac';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const U = '33333333-3333-4333-8333-333333333333';

const merchant = (role: MerchantRole, tenantId = T1): Principal => ({ kind: 'merchant', userId: U, tenantId, role });
const platform = (role: PlatformRole): Principal => ({ kind: 'platform', userId: U, role });
const anon: Principal = { kind: 'anon' };

const MERCHANT_ACTIONS: Action[] = [
  'profile:read', 'profile:write', 'catalog:read', 'catalog:write', 'catalog:toggle',
  'offers:read', 'offers:write', 'media:read', 'media:write', 'hours:write',
  'qr:read', 'qr:download', 'analytics:read', 'ai:configure', 'reviews:read', 'reviews:moderate',
  'members:read', 'members:write', 'billing:read', 'billing:write', 'tenant:delete',
];

const PLATFORM_ACTIONS: Action[] = [
  'platform:tenant:create', 'platform:tenant:update', 'platform:tenant:suspend',
  'platform:tenant:delete', 'platform:slug:change', 'platform:qr:repoint',
  'platform:impersonate', 'platform:categories:write', 'platform:plans:write',
  'platform:flags:write', 'platform:audit:read', 'platform:analytics:read',
];

describe('anonymous visitors', () => {
  it.each([...MERCHANT_ACTIONS, ...PLATFORM_ACTIONS])('cannot %s', (action) => {
    expect(can(anon, action)).toBe(false);
  });
});

describe('merchant roles', () => {
  it('staff can only read, toggle availability and manage offers', () => {
    const allowed = MERCHANT_ACTIONS.filter((a) => can(merchant('staff'), a)).sort();
    expect(allowed).toEqual(
      ['catalog:read', 'catalog:toggle', 'media:read', 'offers:read', 'offers:write', 'profile:read', 'qr:read'].sort(),
    );
  });

  it('staff cannot edit prices, moderate reviews, see billing or manage the team', () => {
    for (const a of ['catalog:write', 'reviews:read', 'reviews:moderate', 'billing:read', 'members:read', 'members:write'] as const) {
      expect(can(merchant('staff'), a)).toBe(false);
    }
  });

  it('a manager can run the shop but not the team, billing or the account', () => {
    expect(can(merchant('manager'), 'catalog:write')).toBe(true);
    expect(can(merchant('manager'), 'reviews:moderate')).toBe(true);
    expect(can(merchant('manager'), 'members:read')).toBe(true);
    for (const a of ['members:write', 'billing:read', 'billing:write', 'tenant:delete'] as const) {
      expect(can(merchant('manager'), a)).toBe(false);
    }
  });

  it('an owner can do everything on the merchant surface', () => {
    for (const a of MERCHANT_ACTIONS) expect(can(merchant('owner'), a)).toBe(true);
  });

  it('no merchant role ever gets a platform permission', () => {
    for (const role of ['staff', 'manager', 'owner'] as const) {
      for (const a of PLATFORM_ACTIONS) expect(can(merchant(role), a)).toBe(false);
    }
  });

  it('permissions only ever grow with rank', () => {
    const set = (r: MerchantRole) => new Set(MERCHANT_ACTIONS.filter((a) => can(merchant(r), a)));
    for (const a of set('staff')) expect(set('manager').has(a)).toBe(true);
    for (const a of set('manager')) expect(set('owner').has(a)).toBe(true);
  });
});

describe('platform roles', () => {
  it('support is read-mostly: audit, analytics and tenant updates only', () => {
    const allowed = PLATFORM_ACTIONS.filter((a) => can(platform('support'), a)).sort();
    expect(allowed).toEqual(['platform:analytics:read', 'platform:audit:read', 'platform:tenant:update']);
  });

  it('admin can operate merchants but cannot delete a tenant or re-point a QR', () => {
    expect(can(platform('admin'), 'platform:tenant:suspend')).toBe(true);
    expect(can(platform('admin'), 'platform:impersonate')).toBe(true);
    expect(can(platform('admin'), 'platform:tenant:delete')).toBe(false);
    expect(can(platform('admin'), 'platform:qr:repoint')).toBe(false);
  });

  it('only a super admin can delete a tenant or re-point a QR', () => {
    expect(can(platform('super_admin'), 'platform:tenant:delete')).toBe(true);
    expect(can(platform('super_admin'), 'platform:qr:repoint')).toBe(true);
    for (const a of PLATFORM_ACTIONS) expect(can(platform('super_admin'), a)).toBe(true);
  });

  it('platform staff hold no merchant-surface permissions (they impersonate instead)', () => {
    for (const role of ['support', 'admin', 'super_admin'] as const) {
      for (const a of MERCHANT_ACTIONS) expect(can(platform(role), a)).toBe(false);
    }
  });
});

describe('tenant scoping', () => {
  it("a merchant is never authorised against another tenant, whatever their role", () => {
    expect(canForTenant(merchant('owner', T1), 'catalog:write', T1)).toBe(true);
    expect(canForTenant(merchant('owner', T1), 'catalog:write', T2)).toBe(false);
    expect(() => authorize(merchant('owner', T1), 'catalog:write', T2)).toThrow(AuthorizationError);
  });

  it('authorize throws a 403-shaped error naming the action, and passes silently when allowed', () => {
    expect(() => authorize(merchant('staff'), 'catalog:write')).toThrow(/catalog:write/);
    expect(() => authorize(merchant('owner'), 'catalog:write', T1)).not.toThrow();
    try {
      authorize(anon, 'profile:read');
    } catch (e) {
      expect((e as AuthorizationError).status).toBe(403);
    }
  });
});

describe('canAssignRole', () => {
  it('an owner can assign any role including co-owner', () => {
    for (const r of ['staff', 'manager', 'owner'] as const) expect(canAssignRole(merchant('owner'), r)).toBe(true);
  });

  it('managers and staff cannot assign roles at all (members:write is owner-only)', () => {
    for (const r of ['staff', 'manager', 'owner'] as const) {
      expect(canAssignRole(merchant('manager'), r)).toBe(false);
      expect(canAssignRole(merchant('staff'), r)).toBe(false);
    }
  });

  it('anonymous cannot, and support/admin/super_admin follow tenant:update', () => {
    expect(canAssignRole(anon, 'staff')).toBe(false);
    for (const role of ['support', 'admin', 'super_admin'] as const) {
      expect(canAssignRole(platform(role), 'owner')).toBe(true);
    }
  });
});
