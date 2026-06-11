import { create } from 'zustand';
import { decodeJwt } from '@/lib/jwt';
import {
  permissionsForRole,
  type Permission,
  type Role,
} from '@/auth/permissions';

export interface AuthUser {
  role: Role;
  displayName: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  permissions: Permission[];
  /** True only for a decoded ADMIN token. */
  isAuthenticated: boolean;
  /**
   * Accept a freshly-minted JWT. Returns false (and stores nothing) if the token can't be decoded
   * or isn't role=ADMIN — the admin SPA is ADMIN-only, so a non-admin login is a hard reject.
   */
  acceptToken: (token: string, displayNameFallback: string) => boolean;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  permissions: [],
  isAuthenticated: false,

  acceptToken: (token, displayNameFallback) => {
    const claims = decodeJwt(token);
    if (!claims || claims.role !== 'ADMIN') return false;
    const user: AuthUser = {
      role: claims.role,
      displayName: claims.displayName || displayNameFallback || claims.email || 'Admin',
      email: claims.email ?? '',
    };
    set({
      token,
      user,
      permissions: permissionsForRole(user.role),
      isAuthenticated: true,
    });
    return true;
  },

  logout: () =>
    set({ token: null, user: null, permissions: [], isAuthenticated: false }),
}));

/** Non-React accessor for the interceptor layer (axios) — avoids importing hooks into plain modules. */
export const authStore = useAuthStore;
