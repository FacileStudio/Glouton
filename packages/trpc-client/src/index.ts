import { createTRPCProxyClient, httpLink, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@repo/trpc';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

interface TrpcConfig {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  onUnauthorized: () => void;
  onPaymentRequired?: () => void;
}

/** The per-call context a page passes as `{ context: QUIET }` for a widget that must fail quietly on 402. */
export const QUIET = { quiet: true } as const;

/**
 * Calls `onPaymentRequired` when a call fails with PAYMENT_REQUIRED, unless
 * the call was made with `{ context: QUIET }`. Layout and settings widgets
 * pass QUIET, so only a page's own primary queries send the browser to the
 * paywall and a person without a plan can still reach their settings.
 */
export function paywallLink(onPaymentRequired: () => void): TRPCLink<AppRouter> {
  return () =>
    ({ op, next }) =>
      observable((observer) =>
        next(op).subscribe({
          next: (value) => observer.next(value),
          error: (error) => {
            const quiet = (op.context as { quiet?: boolean } | undefined)?.quiet === true;
            if (!quiet && error.data?.code === 'PAYMENT_REQUIRED') onPaymentRequired();
            observer.error(error);
          },
          complete: () => observer.complete(),
        })
      );
}

export const createUniversalTrpcClient = (config: TrpcConfig): ReturnType<typeof createTRPCProxyClient<AppRouter>> => {
  const cleanBaseUrl = config.baseUrl.replace(/\/$/, '');

  return createTRPCProxyClient<AppRouter>({
    links: [
      ...(config.onPaymentRequired && typeof window !== 'undefined' ? [paywallLink(config.onPaymentRequired)] : []),
      httpLink({
        url: cleanBaseUrl,
        async headers() {
          const token = await config.getToken();
          return {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'x-trpc-source': 'universal-client',
          };
        },
        fetch: async (url, options) => {
          const res = await fetch(url, options);

          if (
            res.status === 401 &&
            typeof window !== 'undefined' &&
            !window.location.pathname.includes('/login')
          ) {
            config.onUnauthorized();
          }

          return res;
        },
      }),
    ],
  });
};
