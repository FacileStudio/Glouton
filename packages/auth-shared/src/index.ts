import { UserRole } from '@repo/types';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isPremium: boolean;
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
  locale?: string | null;
}

export interface AuthState {
  user: SessionUser | null;
  session: { token: string } | null;
  loading: boolean;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.USER]: 1,
  [UserRole.ADMIN]: 2,
};



export const hasAccess = (
  user: SessionUser | null | undefined,
  requiredRole: UserRole
): boolean => {
  

  if (!user) return false;
  return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[requiredRole];
};



export const isAdmin = (user: SessionUser | null | undefined) => user?.role === UserRole.ADMIN;

export * from './store';
