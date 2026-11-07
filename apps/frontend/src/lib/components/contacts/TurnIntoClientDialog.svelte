<script lang="ts">
  import { Alert, Button, Field, Input, Modal, Select, Spinner, toast } from '@facile/muse';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import { personName } from './labels';
  import { useT } from '$lib/i18n';

  const t = useT();
  type Person = {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    isBillingContact?: boolean;
  };
  type Company = {
    id?: string;
    siret?: string | null;
    vatNumber?: string | null;
    addressLine?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    people?: Person[];
  };

  let {
    open = $bindable(false),
    company,
    onDone,
  }: { open?: boolean; company: Company; onDone: () => void | Promise<void> } = $props();

  const people = $derived(company.people ?? []);
  let personId = $state('');
  let form = $state(emptyForm());
  let saving = $state(false);

  function emptyForm() {
    return { firstName: '', lastName: '', email: '', siret: '', vatNumber: '', addressLine: '', postalCode: '', city: '', country: '' };
  }

  function pick(id: string) {
    personId = id;
    const person = people.find((p) => p.id === id);
    form.firstName = person?.firstName ?? '';
    form.lastName = person?.lastName ?? '';
    form.email = person?.email ?? '';
  }

  function reset() {
    form = {
      ...emptyForm(),
      siret: company.siret ?? '',
      vatNumber: company.vatNumber ?? '',
      addressLine: company.addressLine ?? '',
      postalCode: company.postalCode ?? '',
      city: company.city ?? '',
      country: company.country ?? '',
    };
    const billing = people.find((p) => p.isBillingContact) ?? people[0];
    pick(billing?.id ?? '');
  }

  $effect(() => {
    if (open) reset();
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!personId || !company.id) return;
    saving = true;
    try {
      await trpc.ardoise.turnIntoClient.mutate({ companyId: company.id, billingPersonId: personId, fill: { ...form } });
      toast.success(t('contacts.clientCreated'));
      open = false;
      await onDone();
    } catch (error) {
      toast.danger(getTrpcErrorMessage(error));
    } finally {
      saving = false;
    }
  }
</script>

<Modal bind:open title={t('contacts.turnIntoClient')} size="lg" onClose={() => (open = false)}>
  {#if people.length === 0}
    <Alert tone="warning">{t('contacts.needPerson')}</Alert>
  {:else}
    <form id="turn-into-client" class="flex flex-col gap-4" onsubmit={submit}>
      <p class="text-fc-sm text-fc-fg-muted">
        {t('contacts.turnText')}
      </p>
      <Field label={t('contacts.billingContact')}>
        <Select value={personId} onchange={(e) => pick(e.currentTarget.value)}>
          {#each people as p (p.id)}<option value={p.id}>{personName(p, t)}</option>{/each}
        </Select>
      </Field>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('contacts.firstName')}><Input bind:value={form.firstName} required maxlength={120} /></Field>
        <Field label={t('leads.detail.name')}><Input bind:value={form.lastName} required maxlength={120} /></Field>
      </div>
      <Field label={t('contacts.billingEmail')}><Input type="email" bind:value={form.email} maxlength={320} /></Field>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="SIRET"><Input bind:value={form.siret} maxlength={20} /></Field>
        <Field label={t('contacts.vat')}><Input bind:value={form.vatNumber} maxlength={30} /></Field>
      </div>
      <Field label={t('contacts.address')}><Input bind:value={form.addressLine} maxlength={300} /></Field>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t('contacts.postalCode')}><Input bind:value={form.postalCode} maxlength={20} /></Field>
        <Field label={t('hunts.new.city')}><Input bind:value={form.city} maxlength={120} /></Field>
        <Field label={t('hunts.new.country')}><Input bind:value={form.country} maxlength={80} /></Field>
      </div>
    </form>
  {/if}
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Annuler</Button>
    <Button type="submit" form="turn-into-client" disabled={saving || !personId}>
      {#if saving}<Spinner size="sm" />{/if}
      {t('contacts.createClient')}
    </Button>
  {/snippet}
</Modal>
