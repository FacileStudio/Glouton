import { TRPCError } from '@trpc/server';
import { UserRole, type PrismaClient } from '@repo/types';
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
  login: async (db: PrismaClient, auth: AuthManager, input: LoginInput) => {
    const user = await db.user.findUnique({
      where: { email: input.email },
      select: userSelection,
    });

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

  register: async (db: PrismaClient, auth: AuthManager, input: RegisterInput) => {
    const exists = await db.user.findUnique({ where: { email: input.email } });
    /**
     * if
     */
    if (exists) {
      throw new TRPCError({ code: 'CONFLICT', message: 'This email is already in use' });
    }

    const passwordHash = await auth.hashPassword(input.password);

    const user = await db.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        password: passwordHash,
        role: UserRole.USER,
      },
      select: userSelection,
    });

    const sessionUser = mapToSessionUser(user);
    const token = await auth.createToken(sessionUser);

    return { token, user: sessionUser };
  },
};

export default authService;
