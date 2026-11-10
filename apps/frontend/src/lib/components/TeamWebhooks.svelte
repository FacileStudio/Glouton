<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert, Badge, Button, Checkbox, ConfirmModal, EmptyState, Field, Input, Modal, SettingsRow, SettingsSection, Spinner, Switch, icons, toast } from '@facile/muse';
  import type { RouterOutputs } from '@repo/trpc-client';
  import { trpc } from '$lib/trpc';
  import { useT } from '$lib/i18n';
  import { getErrorMessage } from '$lib/utils/trpc-error';
  import { WEBHOOK_EVENTS, WEBHOOK_EVENT_KEYS, webhookEventLabel, type WebhookEvent } from '$lib/components/competitors/discovery';

  type Webhook = RouterOutputs['team']['listWebhooks'][number];

  let { teamId, canManage }: { teamId: string; canManage: boolean } = $props();

  const t = useT();

  let hooks = $state<Webhook[]>([]);
  let loading = $state(true);
  let addOpen = $state(false);
  let saving = $state(false);
  let testing = $state<string | null>(null);
  let toggling = $state<string | null>(null);
  let removing = $state<Webhook | null>(null);
  let confirmOpen = $state(false);
  let form = $state(emptyForm());

  function emptyForm() {
    return { name: '', url: '', events: ['competitor.new_registered', 'competitor.changes', 'hunt.digest', 'hunt.schedule_paused'] as WebhookEvent[] };
  }

  async function load() {
    if (!canManage) {
      loading = false;
      return;
    }
    try {
      hooks = await trpc.team.listWebhooks.query({ teamId });
    } catch (error) {
      toast.danger(getErrorMessage(error, t('webhooks.loadFailed')));
    } finally {
      loading = false;
    }
  }

  function toggleEvent(event: WebhookEvent, on: boolean) {
    form.events = on ? [...form.events.filter((e) => e !== event), event] : form.events.filter((e) => e !== event);
  }

  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim()) {
      toast.danger(t('webhooks.nameUrlRequired'));
      return;
    }
    if (form.events.length === 0) {
      toast.danger(t('webhooks.eventsRequired'));
      return;
    }
    saving = true;
    try {
      const ordered = WEBHOOK_EVENT_KEYS.filter((key) => form.events.includes(key));
      await trpc.team.createWebhook.mutate({ teamId, name: form.name.trim(), url: form.url.trim(), events: ordered });
      toast.success(t('webhooks.created'));
      addOpen = false;
      form = emptyForm();
      await load();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('webhooks.saveFailed')));
    } finally {
      saving = false;
    }
  }

  async function test(url: string, key: string) {
    testing = key;
    try {
      await trpc.team.testWebhook.mutate({ teamId, url });
      toast.success(t('webhooks.testOk'));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('webhooks.testFailed')));
    } finally {
      testing = null;
    }
  }

  async function setEnabled(hook: Webhook, enabled: boolean) {
    toggling = hook.id;
    try {
      const updated = await trpc.team.updateWebhook.mutate({ teamId, webhookId: hook.id, enabled });
      hooks = hooks.map((row) => (row.id === hook.id ? { ...row, enabled: updated.enabled } : row));
    } catch (error) {
      toast.danger(getErrorMessage(error, t('webhooks.saveFailed')));
      await load();
    } finally {
      toggling = null;
    }
  }

  function askRemove(hook: Webhook) {
    removing = hook;
    confirmOpen = true;
  }

  async function remove() {
    if (!removing) return;
    try {
      await trpc.team.deleteWebhook.mutate({ teamId, webhookId: removing.id });
      toast.success(t('webhooks.deleted'));
      await load();
    } catch (error) {
      toast.danger(getErrorMessage(error, t('webhooks.saveFailed')));
    } finally {
      confirmOpen = false;
      removing = null;
    }
  }

  onMount(load);
</script>

<SettingsSection title={t('webhooks.title')} description={t('webhooks.description')}>
  {#snippet actions()}
    {#if canManage}
      <Button icon="mdi:plus" onclick={() => (addOpen = true)}>{t('webhooks.add')}</Button>
    {/if}
  {/snippet}

  {#if !canManage}
    <SettingsRow stacked><Alert tone="info" class="w-full">{t('webhooks.adminOnly')}</Alert></SettingsRow>
  {:else if loading}
    <SettingsRow stacked><div class="flex justify-center py-8"><Spinner size="lg" /></div></SettingsRow>
  {:else if hooks.length === 0}
    <SettingsRow stacked>
      <EmptyState bare class="w-full" icon="solar:link-round-angle-linear" title={t('webhooks.none')} description={t('webhooks.noneText')} />
    </SettingsRow>
  {:else}
    {#each hooks as hook (hook.id)}
      <SettingsRow stacked>
        <div class="flex w-full flex-col gap-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <p class="truncate text-fc-sm font-semibold text-fc-fg">{hook.name}</p>
              <p class="truncate font-mono text-fc-xs text-fc-fg-muted">{hook.url}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              {#if !hook.enabled}<Badge class="shrink-0">{t('webhooks.paused')}</Badge>{/if}
              <Switch
                checked={hook.enabled}
                disabled={toggling === hook.id}
                aria-label={t('webhooks.enabledLabel', { name: hook.name })}
                onchange={(e) => setEnabled(hook, e.currentTarget.checked)}
              />
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5">
            {#each hook.events as event (event)}
              {@const label = webhookEventLabel(event)}
              <Badge tone="info" class="shrink-0">{label ? t(label) : event}</Badge>
            {/each}
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon="solar:test-tube-linear" aria-label={t('webhooks.testName', { name: hook.name })} onclick={() => test(hook.url, hook.id)} disabled={testing === hook.id}>
              {#if testing === hook.id}<Spinner size="sm" />{/if}
              {t('webhooks.test')}
            </Button>
            <Button variant="ghost-danger" icon={icons.remove} aria-label={t('webhooks.deleteName', { name: hook.name })} onclick={() => askRemove(hook)}>
              {t('webhooks.delete')}
            </Button>
          </div>
        </div>
      </SettingsRow>
    {/each}
  {/if}
</SettingsSection>

<Modal open={addOpen} title={t('webhooks.add')} onClose={() => (addOpen = false)}>
  <form id="add-webhook" class="flex flex-col gap-4" onsubmit={add}>
    <Field label={t('webhooks.name')} for="webhook-name">
      <Input id="webhook-name" bind:value={form.name} maxlength={100} placeholder={t('webhooks.namePlaceholder')} required />
    </Field>
    <Field label={t('webhooks.url')} helper={t('webhooks.urlHint')} for="webhook-url">
      <Input id="webhook-url" type="url" inputmode="url" bind:value={form.url} maxlength={2000} placeholder="https://antenne.example/hooks/glouton" required />
    </Field>
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-2 text-fc-sm font-medium text-fc-fg">{t('webhooks.events')}</legend>
      {#each WEBHOOK_EVENT_KEYS as event (event)}
        <Checkbox label={t(WEBHOOK_EVENTS[event])} checked={form.events.includes(event)} onchange={(e) => toggleEvent(event, e.currentTarget.checked)} />
      {/each}
    </fieldset>
  </form>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => test(form.url.trim(), 'form')} disabled={!form.url.trim() || testing === 'form'}>
      {#if testing === 'form'}<Spinner size="sm" />{/if}
      {t('webhooks.test')}
    </Button>
    <Button variant="ghost" onclick={() => (addOpen = false)}>{t('common.cancel')}</Button>
    <Button type="submit" form="add-webhook" disabled={saving}>
      {#if saving}<Spinner size="sm" />{/if}
      {t('common.add')}
    </Button>
  {/snippet}
</Modal>

<ConfirmModal
  bind:open={confirmOpen}
  tone="danger"
  title={t('webhooks.deleteTitle')}
  description={removing ? t('webhooks.deleteText', { name: removing.name }) : ''}
  confirmLabel={t('webhooks.delete')}
  onConfirm={remove}
  onCancel={() => (removing = null)}
/>
