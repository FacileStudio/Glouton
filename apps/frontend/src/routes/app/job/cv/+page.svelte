<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert, Badge, Button, Card, ConfirmModal, Dropzone, EmptyState, Field, Input, PageHeader, Spinner, Switch, Textarea, icons, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { useFormat, useT } from '$lib/i18n';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { teamContextStore } from '$lib/stores/team-context.svelte';
  import { readBase64, saveFile, sizeOf, type Cv } from '$lib/components/job/job';

  const MAX_BYTES = 4 * 1024 * 1024;
  const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const t = useT();
  const format = useFormat();
  const teamId = $derived(teamContextStore.getTeamId());
  const inTeam = $derived(Boolean(teamId));

  let cvs = $state<Cv[]>([]);
  let loading = $state(true);
  let uploading = $state(false);
  let writing = $state({ name: '', text: '' });
  let open = $state<string | null>(null);
  let text = $state('');
  let removing = $state<Cv | null>(null);

  const mine = $derived(cvs.filter((entry) => entry.mine));
  const shared = $derived(cvs.filter((entry) => !entry.mine));

  async function load() {
    try {
      cvs = await trpc.job.cvs.query({ teamId });
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      loading = false;
    }
  }

  onMount(load);

  function errorText(error: unknown): string {
    const message = getTrpcErrorMessage(error);
    if (message === 'cv_type' || message === 'cv_too_large' || message === 'cv_count' || message === 'cv_empty') return t(`job.cv.error.${message}`);
    return message;
  }

  async function upload(files: File[]) {
    const file = files[0];
    if (!file) return;
    uploading = true;
    try {
      const data = await readBase64(file);
      await trpc.job.createCv.mutate({ teamId, name: file.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'CV', fileName: file.name, data });
      toast.success(t('job.cv.uploaded'));
      await load();
    } catch (error) {
      toast.danger(errorText(error));
    } finally {
      uploading = false;
    }
  }

  async function addText(event: SubmitEvent) {
    event.preventDefault();
    try {
      await trpc.job.createCv.mutate({ teamId, name: writing.name, text: writing.text });
      writing = { name: '', text: '' };
      toast.success(t('job.cv.uploaded'));
      await load();
    } catch (error) {
      toast.danger(errorText(error));
    }
  }

  async function expand(entry: Cv) {
    if (open === entry.id) {
      open = null;
      return;
    }
    text = (await trpc.job.cv.query({ teamId, cvId: entry.id })).text;
    open = entry.id;
  }

  async function saveText(entry: Cv) {
    try {
      await trpc.job.updateCv.mutate({ teamId, cvId: entry.id, text });
      toast.success(t('job.cv.saved'));
      await load();
    } catch (error) {
      toast.danger(errorText(error));
    }
  }

  async function share(entry: Cv, on: boolean) {
    try {
      await trpc.job.updateCv.mutate({ teamId, cvId: entry.id, shared: on });
      await load();
    } catch (error) {
      toast.danger(errorText(error));
    }
  }

  async function download(entry: Cv) {
    const file = await trpc.job.downloadCv.query({ teamId, cvId: entry.id });
    saveFile(file.data, file.mimeType, file.fileName);
  }

  async function remove() {
    if (!removing) return;
    await trpc.job.deleteCv.mutate({ teamId, cvId: removing.id });
    removing = null;
    open = null;
    toast.success(t('job.cv.deleted'));
    await load();
  }
</script>

<PageHeader title={t('job.cv.title')} description={t('job.cv.description')} />

<div class="flex flex-col gap-6">
  <Alert tone="info" title={t('job.cv.privacyTitle')}>{inTeam ? t('job.cv.privacyTeam') : t('job.cv.privacyPersonal')}</Alert>

  <Card class="flex flex-col gap-4 p-5">
    <h2 class="text-fc-md font-semibold text-fc-fg">{t('job.cv.add')}</h2>
    <Dropzone
      accept={ACCEPT}
      maxSize={MAX_BYTES}
      disabled={uploading}
      label={uploading ? t('job.cv.uploading') : t('job.cv.drop')}
      browseLabel={t('job.cv.browse')}
      hint={t('job.cv.dropHint')}
      onFiles={upload}
      onReject={(rejections) => toast.danger(t(rejections[0]?.reason === 'size' ? 'job.cv.error.cv_too_large' : 'job.cv.error.cv_type'))}
    />
    <form class="flex flex-col gap-3" onsubmit={addText}>
      <p class="text-fc-sm text-fc-fg-muted">{t('job.cv.orText')}</p>
      <Field label={t('job.cv.name')} for="cv-name" class="w-full sm:max-w-sm"><Input id="cv-name" bind:value={writing.name} maxlength={120} required /></Field>
      <Field label={t('job.cv.text')} helper={t('job.cv.textHint')} for="cv-text" class="w-full">
        <Textarea id="cv-text" rows={6} maxlength={30000} class="field-sizing-content min-h-32 w-full" bind:value={writing.text} />
      </Field>
      <div><Button type="submit" variant="secondary" icon={icons.plus} disabled={!writing.name.trim() || !writing.text.trim()}>{t('job.cv.saveText')}</Button></div>
    </form>
  </Card>

  {#if loading}
    <Card class="flex items-center justify-center py-16"><Spinner size="lg" /></Card>
  {:else if cvs.length === 0}
    <EmptyState icon="solar:document-text-linear" title={t('job.cv.empty')} description={t('job.cv.emptyText')} />
  {:else}
    {#each [{ title: t('job.cv.mine'), list: mine }, { title: t('job.cv.sharedWithMe'), list: shared }] as group (group.title)}
      {#if group.list.length > 0}
        <section class="flex flex-col gap-3" aria-label={group.title}>
          <h2 class="text-fc-md font-semibold text-fc-fg">{group.title}</h2>
          {#each group.list as entry (entry.id)}
            <Card class="flex flex-col gap-3 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex min-w-0 flex-col gap-1">
                  <p class="truncate text-fc-sm font-semibold text-fc-fg">{entry.name}</p>
                  <div class="flex flex-wrap gap-2">
                    {#if entry.hasFile}<Badge class="shrink-0">{entry.fileName} · {sizeOf(entry.size)}</Badge>{/if}
                    <Badge tone={entry.hasText ? 'success' : 'warning'} class="shrink-0">{entry.hasText ? t('job.cv.hasText') : t('job.cv.noText')}</Badge>
                    {#if entry.shared}<Badge tone="info" class="shrink-0">{t('job.cv.sharedBadge')}</Badge>{/if}
                    {#if !entry.mine && entry.owner}<Badge class="shrink-0">{entry.owner}</Badge>{/if}
                    <Badge class="shrink-0">{format.date(entry.updatedAt)}</Badge>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  {#if entry.mine && inTeam}
                    <Switch label={t('job.cv.share')} checked={entry.shared} onchange={(e) => share(entry, e.currentTarget.checked)} />
                  {/if}
                  <Button size="sm" variant="secondary" icon="solar:pen-linear" onclick={() => expand(entry)}>{entry.mine ? t('job.cv.editText') : t('job.cv.viewText')}</Button>
                  {#if entry.hasFile}<Button size="sm" variant="ghost" icon="solar:download-linear" onclick={() => download(entry)}>{t('job.cv.download')}</Button>{/if}
                  {#if entry.mine}<Button size="sm" variant="ghost" icon={icons.remove} onclick={() => (removing = entry)}>{t('job.cv.delete')}</Button>{/if}
                </div>
              </div>
              {#if open === entry.id}
                <Field label={t('job.cv.text')} helper={entry.mine ? t('job.cv.textHint') : undefined} for="cv-text-{entry.id}" class="w-full">
                  <Textarea id="cv-text-{entry.id}" rows={10} maxlength={30000} class="field-sizing-content min-h-48 w-full" bind:value={text} readonly={!entry.mine} />
                </Field>
                {#if entry.mine}<div><Button size="sm" icon={icons.check} onclick={() => saveText(entry)}>{t('common.save')}</Button></div>{/if}
              {/if}
            </Card>
          {/each}
        </section>
      {/if}
    {/each}
  {/if}
</div>

<ConfirmModal
  open={removing !== null}
  title={t('job.cv.deleteTitle')}
  description={t('job.cv.deleteText')}
  confirmLabel={t('job.cv.delete')}
  cancelLabel={t('common.cancel')}
  tone="danger"
  onConfirm={remove}
  onCancel={() => (removing = null)}
/>
