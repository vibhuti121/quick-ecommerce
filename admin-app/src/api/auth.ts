import { api } from '@/lib/axios';

interface LoginResponse {
  token: string;
  displayName: string;
}

/**
 * POST /auth/login — public route on the gateway; returns a role-bearing JWT. The backend field is
 * `identifier` (it accepts email OR phone); the admin UI only collects an email, so we map it here.
 */
export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', {
    identifier: email,
    password,
  });
  return data;
}
