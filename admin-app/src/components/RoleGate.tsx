import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { hasPermission, type Permission } from '@/auth/permissions';

interface RoleGateProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children only if the current token grants `permission`. This is a UI affordance, NOT a
 * security control — the gateway is the real boundary. Hiding a button here just avoids showing an
 * action that would 403 server-side anyway.
 */
export function RoleGate({ permission, children, fallback = null }: RoleGateProps) {
  const permissions = useAuthStore((s) => s.permissions);
  return hasPermission(permissions, permission) ? <>{children}</> : <>{fallback}</>;
}
