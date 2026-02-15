import { TRPCError } from '@trpc/server';
import { UserRole } from '@repo/types';
import { SQL, sql } from 'bun';
import type { AuthManager } from '@repo/auth';
import type { LoginInput, RegisterInput, SessionUser } from '@repo/auth-shared';

/**
 * mapToSessionUser
 */
const mapToSessionUser = (user: any): SessionUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  isPremium: user.isPremium,
  avatarUrl: null,
  coverImageUrl: null,
});

const userSelection = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  password: true,
  role: true,
  isPremium: true,
};

export const authService = {
  login: async (db: SQL, auth: AuthManager, input: LoginInput) => {
    const [user] = await db`
      SELECT id, email, "firstName", "lastName", password, role, "isPremium"
      FROM "User"
      WHERE email = ${input.email}
    ` as Promise<any[]>;

    /**
     * if
     */
    if (!user || !(await auth.verifyPassword(input.password, user.password))) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    const sessionUser = mapToSessionUser(user);
    const token = await auth.createToken(sessionUser);

    return { token, user: sessionUser };
  },

  register: async (db: SQL, auth: AuthManager, input: RegisterInput) => {
    const [exists] = await db`
      SELECT id FROM "User" WHERE email = ${input.email}
    ` as Promise<any[]>;
    /**
     * if
     */
    if (exists) {
      throw new TRPCError({ code: 'CONFLICT', message: 'This email is already in use' });
    }

    const passwordHash = await auth.hashPassword(input.password);

    const [user] = await db`
      INSERT INTO "User" (
        email, "firstName", "lastName", password, role, "createdAt", "updatedAt"
      ) VALUES (
        ${input.email},
        ${input.firstName},
        ${input.lastName},
        ${passwordHash},
        ${UserRole.USER},
        ${new Date()},
        ${new Date()}
      )
      RETURNING id, email, "firstName", "lastName", password, role, "isPremium"
    ` as Promise<any[]>;

    const sessionUser = mapToSessionUser(user);
    const token = await auth.createToken(sessionUser);

    return { token, user: sessionUser };
  },
};

export default authService;
