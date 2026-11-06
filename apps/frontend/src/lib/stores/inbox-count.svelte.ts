import trpc from '$lib/trpc';
import { QUIET } from '@repo/trpc-client';

class InboxCount {
  value = $state(0);

  set(count: number): void {
    this.value = count;
  }

  async refresh(): Promise<void> {
    try {
      this.value = (await trpc.inbox.counts.query(undefined, { context: QUIET })).total;
    } catch {
      this.value = 0;
    }
  }
}

export const inboxCount = new InboxCount();
