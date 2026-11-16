import { assistantStatus } from './status';

/**
 * What a paid Bulle action needs to know about the account: the assistant's
 * name for the blob and, when the plan has no AI, the page that sells it.
 * The one status call is shared with the writing panels through its cache.
 */
export class BulleGate {
  name = $state('Bulle');
  upgradeHref = $state<string | undefined>(undefined);
  loaded = $state(false);

  async load(teamId: string | undefined): Promise<void> {
    try {
      const status = await assistantStatus(teamId);
      this.name = status.name || 'Bulle';
      this.upgradeHref = status.reason === 'plan_required' ? (status.planLimit?.upgrade_url ?? '') : undefined;
    } catch {
      this.upgradeHref = undefined;
    } finally {
      this.loaded = true;
    }
  }

  /** Records a 402 returned by the action itself. */
  refuse(planLimit: { upgrade_url?: string } | undefined): boolean {
    if (!planLimit) return false;
    this.upgradeHref = planLimit.upgrade_url ?? '';
    return true;
  }
}
