/**
 * Client-side permission model. The HARD access boundary is the gateway: it gates
 * `/api/catalog/admin` + `/api/inventory/admin` on a `role=ADMIN` JWT claim and is the only thing
 * that actually protects data. This map exists purely to drive UI affordances (hide buttons/nav the
 * current role can't use) and is forward-compatible: when the real 5-role model + a JWT `permissions`
 * claim land later, swap `permissionsForRole` to read the claim and every <RoleGate> keeps working.
 */
export type Role = 'ADMIN' | 'CUSTOMER' | 'GUEST';

export type Permission =
  | 'product:read'
  | 'product:write'
  | 'product:delete'
  | 'inventory:write'
  | 'order:read'
  | 'order:write';

const ALL_PERMISSIONS: Permission[] = [
  'product:read',
  'product:write',
  'product:delete',
  'inventory:write',
  'order:read',
  'order:write',
];

/** ADMIN gets everything; every other role gets nothing in this admin surface. */
export function permissionsForRole(role: Role | undefined): Permission[] {
  return role === 'ADMIN' ? ALL_PERMISSIONS : [];
}

export function hasPermission(
  granted: readonly Permission[],
  required: Permission,
): boolean {
  return granted.includes(required);
}
