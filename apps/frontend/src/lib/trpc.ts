import { createUniversalTrpcClient } from '@repo/trpc-client';
import { authStore } from './auth-store';
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

export const trpc = createUniversalTrpcClient({
  baseUrl: '/trpc',

  getToken: () => {
    const state = get(authStore);
    return state.session?.token || null;
  },
  onUnauthorized: () => void authStore.clear(),
  onPaymentRequired: () => {
    const paywall = resolve('/app/paywall');
    if (window.location.pathname !== paywall) void goto(paywall);
  },
});

export default trpc;
