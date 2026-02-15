<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import 'iconify-icon';

  interface Lead {
    id: string;
    domain: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    status: 'HOT' | 'WARM' | 'COLD';
    score: number;
    contacted: boolean;
    emailsSentCount: number;
    lastContactedAt: Date | null;
    createdAt: Date;
  }

  interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    variables: string[];
    generateHtml: (vars: Record<string, string>) => string;
    generateText: (vars: Record<string, string>) => string;
  }

  let lead: Lead | null = null;
  let loading = true;
  let templates: EmailTemplate[] = [];
  let selectedTemplate: string = '';
  let emailVariables: Record<string, string> = {};
  let sendingEmail = false;
  let previewHtml = '';

  $: leadId = $page.params.id;

  /**
   * onMount
   */
  onMount(async () => {
    await loadLead();
    await loadTemplates();
  });

  /**
   * loadLead
   */
  async function loadLead() {
    try {
      const leadsData = await trpc.lead.query.list.query({ limit: 1000 });
      lead = leadsData.leads.find(l => l.id === leadId) || null;

      /**
       * if
       */
      if (!lead) {
        toast.push('Lead not found', 'error');
        /**
         * goto
         */
        goto('/app/outreach');
        return;
      }

      /**
       * if
       */
      if (!lead.email) {
        toast.push('This lead has no email address', 'error');
        /**
         * goto
         */
        goto('/app/outreach');
        return;
      }
    } catch (error) {
      toast.push('Failed to load lead', 'error');
      console.error('Error loading lead:', error);
      /**
       * goto
       */
      goto('/app/outreach');
    } finally {
      loading = false;
    }
  }

  /**
   * loadTemplates
   */
  async function loadTemplates() {
    try {
      templates = await trpc.email.getTemplates.query();

      /**
       * if
       */
      if (templates.length > 0) {
        selectedTemplate = templates[0].id;
        /**
         * initializeVariables
         */
        initializeVariables(templates[0]);
      }
    } catch (error) {
      toast.push('Failed to load email templates', 'error');
      console.error('Error loading templates:', error);
    }
  }

  /**
   * initializeVariables
   */
  function initializeVariables(template: EmailTemplate) {
    emailVariables = {};

    /**
     * if
     */
    if (lead) {
      emailVariables['recipientName'] = lead.firstName || lead.domain;
      emailVariables['companyName'] = lead.domain;
      emailVariables['email'] = lead.email || '';
    }

    template.variables.forEach(varName => {
      /**
       * if
       */
      if (!(varName in emailVariables)) {
        emailVariables[varName] = '';
      }
    });
  }

  /**
   * updatePreview
   */
  async function updatePreview() {
    /**
     * if
     */
    if (!selectedTemplate || !lead) return;

    try {
      const result = await trpc.email.previewEmail.query({
        templateId: selectedTemplate,
        variables: emailVariables,
      });
      previewHtml = result.html;
    } catch (error) {
      console.error('Error previewing email:', error);
    }
  }

  /**
   * sendEmail
   */
  async function sendEmail() {
    /**
     * if
     */
    if (!lead || !selectedTemplate) return;

    sendingEmail = true;
    try {
      await trpc.email.sendEmail.mutate({
        leadId: lead.id,
        templateId: selectedTemplate,
        variables: emailVariables,
      });

      toast.push('Email sent successfully!', 'success');
      /**
       * goto
       */
      goto('/app/outreach');
    } catch (error) {
      toast.push('Failed to send email', 'error');
      console.error('Error sending email:', error);
    } finally {
      sendingEmail = false;
    }
  }

  /**
   * getStatusColor
   */
  function getStatusColor(status: Lead['status']): string {
    const colors = {
      HOT: 'bg-orange-100 text-orange-700',
      WARM: 'bg-yellow-100 text-yellow-700',
      COLD: 'bg-blue-100 text-blue-700',
    };
    return colors[status];
  }

  $: if (selectedTemplate && templates.length > 0) {
    const template = templates.find(t => t.id === selectedTemplate);
    /**
     * if
     */
    if (template) {
      /**
       * initializeVariables
       */
      initializeVariables(template);
      /**
       * updatePreview
       */
      updatePreview();
    }
  }

  $: if (Object.keys(emailVariables).length > 0) {
    /**
     * updatePreview
     */
    updatePreview();
  }
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Loading lead...
    </p>
  </div>
{:else if lead}
  <div class="h-screen flex flex-col" style="background-color: #FAF7F5;" in:fade>
    <div class="bg-white border-b-2 border-neutral-200 px-10 py-6 flex-shrink-0">
      <div class="max-w-[1800px] mx-auto flex items-center justify-between">
        <div class="flex items-center gap-4">
          <button
            onclick={() => goto('/app/outreach')}
            class="w-10 h-10 rounded-xl border-2 border-neutral-200 hover:border-black hover:bg-neutral-50 flex items-center justify-center transition-colors"
          >
            <iconify-icon icon="solar:arrow-left-bold" width="20" class="text-neutral-900"></iconify-icon>
          </button>
          <div class="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center">
            <iconify-icon icon="solar:letter-bold" width="24" class="text-neutral-900"></iconify-icon>
          </div>
          <div>
            <h1 class="text-2xl font-black tracking-tight text-neutral-900">Contact Lead</h1>
            <p class="text-neutral-500 font-medium text-sm">{lead.domain}</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button
            onclick={() => goto('/app/outreach')}
            class="px-6 py-3 border-2 border-neutral-200 text-neutral-700 hover:border-black hover:text-black rounded-xl font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onclick={sendEmail}
            disabled={sendingEmail || !selectedTemplate}
            class="px-6 py-3 bg-black text-white rounded-xl font-bold hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {#if sendingEmail}
              <Spinner size="sm" color="white" />
              <span>Sending...</span>
            {:else}
              <iconify-icon icon="solar:letter-bold" width="20"></iconify-icon>
              <span>Send Email</span>
            {/if}
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-hidden">
      <div class="h-full max-w-[1800px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        <div class="rounded-3xl shadow-lg overflow-hidden flex flex-col" style="background-color: #EFEAE6;">
          <div class="p-8 border-b border-neutral-100 bg-neutral-50/50">
            <h2 class="text-xl font-black tracking-tight flex items-center gap-2" style="color: #291334;">
              <iconify-icon icon="solar:settings-bold-duotone" width="24" class="text-neutral-600"></iconify-icon>
              Email Configuration
            </h2>
          </div>

          <div class="flex-1 overflow-y-auto p-8 space-y-6">
            <div class="bg-neutral-50 rounded-2xl p-6 space-y-4">
              <h3 class="text-sm font-bold text-neutral-700 uppercase tracking-wide">Lead Information</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1">Email</p>
                  <p class="text-sm font-bold text-neutral-900">{lead.email}</p>
                </div>
                <div>
                  <p class="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1">Name</p>
                  <p class="text-sm font-bold text-neutral-900">
                    {lead.firstName || ''} {lead.lastName || ''}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1">Priority</p>
                  <span class="inline-block px-3 py-1 rounded-lg text-xs font-bold uppercase {getStatusColor(lead.status)}">
                    {lead.status}
                  </span>
                </div>
                <div>
                  <p class="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1">Score</p>
                  <div class="flex items-center gap-3">
                    <div class="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        class="h-full transition-all {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'}"
                        style="width: {Math.min(lead.score, 100)}%"
                      ></div>
                    </div>
                    <span class="text-sm font-bold text-neutral-900">{lead.score}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <label class="block">
                <span class="text-sm font-bold text-neutral-700 mb-2 block">Email Template</span>
                <select
                  bind:value={selectedTemplate}
                  class="w-full px-4 py-3 bg-white border-2 border-neutral-200 rounded-xl font-medium text-sm focus:outline-none focus:border-black transition-colors"
                >
                  {#each templates as template}
                    <option value={template.id}>{template.name}</option>
                  {/each}
                </select>
              </label>

              {#if templates.find(t => t.id === selectedTemplate)?.variables.length > 0}
                <div class="space-y-3">
                  <p class="text-sm font-bold text-neutral-700">Template Variables</p>
                  <div class="space-y-3">
                    {#each templates.find(t => t.id === selectedTemplate)?.variables || [] as varName}
                      <label class="block">
                        <span class="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2 block">{varName}</span>
                        <input
                          type="text"
                          bind:value={emailVariables[varName]}
                          class="w-full px-4 py-3 bg-white border-2 border-neutral-200 rounded-xl text-sm font-medium focus:outline-none focus:border-black transition-colors"
                        />
                      </label>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <div class="rounded-3xl shadow-lg overflow-hidden flex flex-col" style="background-color: #EFEAE6;">
          <div class="p-8 border-b border-neutral-100 bg-neutral-50/50">
            <h2 class="text-xl font-black tracking-tight flex items-center gap-2" style="color: #291334;">
              <iconify-icon icon="solar:eye-bold-duotone" width="24" class="text-neutral-600"></iconify-icon>
              Live Preview
            </h2>
          </div>

          <div class="flex-1 overflow-y-auto p-8">
            {#if previewHtml}
              <div class="bg-white border-2 border-neutral-200 rounded-2xl p-8 prose prose-sm max-w-none">
                {@html previewHtml}
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center h-full space-y-4 text-neutral-300">
                <iconify-icon icon="solar:document-bold" width="80"></iconify-icon>
                <p class="font-bold uppercase tracking-widest text-sm">
                  Select a template to preview
                </p>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
