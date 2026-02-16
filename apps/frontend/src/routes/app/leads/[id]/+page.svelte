<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import { trpc } from '$lib/trpc';
  import { toast } from '@repo/utils';
  import { Spinner } from '@repo/ui';
  import 'iconify-icon';

  interface SocialProfile {
    platform: string;
    url: string;
  }

  interface CompanyInfo {
    name?: string;
    description?: string;
    industry?: string;
    size?: string;
    founded?: string;
    website?: string;
  }

  interface Address {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    fullAddress?: string;
  }

  interface LeadMetadata {
    additionalEmails?: string[];
    phoneNumbers?: string[];
    addresses?: Address[];
    socialProfiles?: SocialProfile[];
    companyInfo?: CompanyInfo;
    technologyStack?: string[];
    lastScrapedAt?: string;
    lastAuditedAt?: string;
  }

  interface Lead {
    id: string;
    domain: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    position: string | null;
    department: string | null;
    status: 'HOT' | 'WARM' | 'COLD';
    score: number;
    technologies: string[];
    contacted: boolean;
    lastContactedAt: Date | null;
    emailsSentCount: number;
    createdAt: Date;
    metadata?: LeadMetadata | null;
  }

  interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    variables: string[];
  }

  interface EmailOutreach {
    id: string;
    leadId: string;
    userId: string;
    templateId: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    variables: Record<string, any>;
    status: string;
    sentAt: Date | null;
    openedAt?: Date | null;
    clickedAt?: Date | null;
    repliedAt?: Date | null;
    error?: string | null;
    createdAt: Date;
    updatedAt?: Date;
  }

  let lead: Lead | null = null;
  let templates: EmailTemplate[] = [];
  let outreachHistory: EmailOutreach[] = [];
  let loading = true;
  let sending = false;
  let selectedTemplate = '';
  let variables: Record<string, string> = {};
  let emailPreview = { subject: '', html: '', text: '' };
  let previewLoading = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let showEmailForm = false;
  let expandedEmails: Set<string> = new Set();

  const leadId = $page.params.id;

  /**
   * onMount
   */
  onMount(async () => {
    await loadData();
  });

  /**
   * loadData
   */
  async function loadData() {
    try {
      const [leadData, templatesData, historyData] = await Promise.all([
        trpc.lead.query.getById.query({ id: leadId }),
        trpc.email.getTemplates.query(),
        trpc.email.getLeadOutreach.query({ leadId }),
      ]);

      lead = leadData;
      templates = templatesData;
      outreachHistory = historyData;

      /**
       * if
       */
      if (templates.length > 0 && !selectedTemplate) {
        selectedTemplate = templates[0].id;
        /**
         * updateVariables
         */
        updateVariables(templates[0]);
      }
    } catch (error) {
      toast.push('Failed to load lead data', 'error');
      console.error(error);
    } finally {
      loading = false;
    }
  }

  /**
   * updateVariables
   */
  function updateVariables(template: EmailTemplate) {
    variables = {};
    template.variables.forEach((variable) => {
      /**
       * if
       */
      if (variable === 'recipientName' && lead) {
        variables[variable] = lead.firstName || lead.domain;
      } else if (variable === 'companyName' && lead) {
        variables[variable] = lead.domain;
      } else {
        variables[variable] = '';
      }
    });
    /**
     * updatePreview
     */
    updatePreview();
  }

  /**
   * updatePreview
   */
  async function updatePreview() {
    /**
     * if
     */
    if (!selectedTemplate) {
      emailPreview = { subject: '', html: '', text: '' };
      return;
    }

    previewLoading = true;
    try {
      const vars = { ...variables };
      Object.keys(vars).forEach((key) => {
        /**
         * if
         */
        if (!vars[key]) {
          vars[key] = `{{${key}}}`;
        }
      });

      const preview = await trpc.email.previewEmail.query({
        templateId: selectedTemplate,
        variables: vars,
      });

      emailPreview = preview;
    } catch (error) {
      console.error('Failed to update preview:', error);
    } finally {
      previewLoading = false;
    }
  }

  /**
   * debouncedUpdatePreview
   */
  function debouncedUpdatePreview() {
    /**
     * if
     */
    if (debounceTimer) {
      /**
       * clearTimeout
       */
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      /**
       * updatePreview
       */
      updatePreview();
    }, 300);
  }

  $: if (variables && selectedTemplate) {
    /**
     * debouncedUpdatePreview
     */
    debouncedUpdatePreview();
  }

  /**
   * handleTemplateChange
   */
  function handleTemplateChange() {
    const template = templates.find((t) => t.id === selectedTemplate);
    /**
     * if
     */
    if (template) {
      /**
       * updateVariables
       */
      updateVariables(template);
    }
  }

  /**
   * sendEmail
   */
  async function sendEmail() {
    /**
     * if
     */
    if (!lead || !lead.email) {
      toast.push('Lead has no email address', 'error');
      return;
    }

    const template = templates.find((t) => t.id === selectedTemplate);
    /**
     * if
     */
    if (!template) {
      toast.push('Please select a template', 'error');
      return;
    }

    /**
     * for
     */
    for (const variable of template.variables) {
      /**
       * if
       */
      if (!variables[variable]) {
        toast.push(`Please fill in all template variables: ${variable}`, 'error');
        return;
      }
    }

    sending = true;
    try {
      await trpc.email.sendEmail.mutate({
        leadId: lead.id,
        templateId: selectedTemplate,
        variables,
      });

      toast.push('Email sent successfully!', 'success');
      showEmailForm = false;
      await loadData();
    } catch (error: any) {
      toast.push(error?.message || 'Failed to send email', 'error');
      console.error(error);
    } finally {
      sending = false;
    }
  }

  /**
   * formatDate
   */
  function formatDate(date: Date | null): string {
    /**
     * if
     */
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * getStatusColor
   */
  function getStatusColor(status: string): string {
    /**
     * switch
     */
    switch (status) {
      case 'SENT':
        return 'bg-blue-100 text-blue-700';
      case 'OPENED':
        return 'bg-purple-100 text-purple-700';
      case 'REPLIED':
        return 'bg-green-100 text-green-700';
      case 'FAILED':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-neutral-100 text-neutral-700';
    }
  }

  /**
   * toggleEmailExpansion
   */
  function toggleEmailExpansion(emailId: string) {
    expandedEmails = new Set(expandedEmails);
    if (expandedEmails.has(emailId)) {
      expandedEmails.delete(emailId);
    } else {
      expandedEmails.add(emailId);
    }
  }

  /**
   * getSocialIcon
   */
  function getSocialIcon(platform: string): string {
    const platformLower = platform.toLowerCase();
    /**
     * if
     */
    if (platformLower.includes('linkedin')) return 'mdi:linkedin';
    /**
     * if
     */
    if (platformLower.includes('twitter') || platformLower.includes('x.com')) return 'mdi:twitter';
    /**
     * if
     */
    if (platformLower.includes('facebook')) return 'mdi:facebook';
    /**
     * if
     */
    if (platformLower.includes('instagram')) return 'mdi:instagram';
    /**
     * if
     */
    if (platformLower.includes('github')) return 'mdi:github';
    /**
     * if
     */
    if (platformLower.includes('youtube')) return 'mdi:youtube';
    /**
     * if
     */
    if (platformLower.includes('tiktok')) return 'ic:baseline-tiktok';
    /**
     * if
     */
    if (platformLower.includes('medium')) return 'mdi:medium';
    return 'mdi:link-variant';
  }

  /**
   * getGoogleMapsUrl
   */
  function getGoogleMapsUrl(address: Address): string {
    const parts = [
      address.street,
      address.city,
      address.state,
      address.postalCode,
      address.country,
    ].filter(Boolean);
    const query = encodeURIComponent(address.fullAddress || parts.join(', '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
</script>

{#if loading}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <Spinner size="xl" color="accent" />
    <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400">
      Loading lead data...
    </p>
  </div>
{:else if !lead}
  <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
    <iconify-icon icon="solar:close-circle-bold" width="64" class="text-red-400"></iconify-icon>
    <p class="text-lg font-black uppercase tracking-wide text-neutral-600">Lead not found</p>
    <button
      onclick={() => goto('/app/leads')}
      class="px-6 py-3 bg-black text-white rounded-xl font-bold hover:bg-neutral-800"
    >
      Back to Leads
    </button>
  </div>
{:else}
  <div class="font-sans w-full" in:fade>
    <div class="flex items-center gap-4 p-6 border-b border-neutral-100">
      <button
        onclick={() => goto('/app/leads')}
        class="w-12 h-12 flex items-center justify-center bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50"
      >
        <iconify-icon icon="solar:arrow-left-bold" width="20"></iconify-icon>
      </button>
      <div class="flex-1">
        <h1 class="text-4xl font-black uppercase tracking-tighter">{lead.domain}</h1>
        <p class="text-neutral-400 font-bold uppercase tracking-[0.3em] text-[10px]">Lead Details</p>
      </div>
      {#if lead.contacted}
        <div class="px-4 py-2 bg-green-100 text-green-700 rounded-xl font-bold text-sm flex items-center gap-2">
          <iconify-icon icon="solar:check-circle-bold" width="20"></iconify-icon>
          Contacted
        </div>
      {:else}
        <div class="px-4 py-2 bg-orange-100 text-orange-700 rounded-xl font-bold text-sm flex items-center gap-2">
          <iconify-icon icon="solar:clock-circle-bold" width="20"></iconify-icon>
          Not Contacted
        </div>
      {/if}
    </div>

    <div class="space-y-6 p-6">
      <div class="rounded-3xl p-8 shadow-lg" style="background-color: #EFEAE6;">
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Email</p>
            {#if lead.email}
              <a href="mailto:{lead.email}" class="font-mono text-sm text-blue-600 hover:text-blue-800 break-all underline">
                {lead.email}
              </a>
            {:else}
              <p class="font-mono text-sm text-neutral-400">No email</p>
            {/if}
          </div>
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Name</p>
            <p class="font-medium text-sm text-neutral-900">
              {lead.firstName || ''} {lead.lastName || 'Unknown'}
            </p>
            {#if lead.position}
              <p class="text-xs text-neutral-500 mt-1">{lead.position}</p>
            {/if}
          </div>
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Status</p>
            <span class="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest inline-block
              {lead.status === 'HOT' ? 'bg-orange-100 text-orange-600' :
               lead.status === 'WARM' ? 'text-neutral-900' :
               'bg-blue-100 text-blue-600'}"
              style={lead.status === 'WARM' ? 'background-color: #FEC129;' : ''}>
              {lead.status}
            </span>
            {#if lead.department}
              <p class="text-xs text-neutral-500 mt-2">{lead.department}</p>
            {/if}
          </div>
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Score</p>
            <div class="flex items-center gap-3">
              <div class="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  class="h-full transition-all {lead.score >= 70 ? 'bg-green-500' : lead.score >= 40 ? '' : 'bg-orange-500'}"
                  style="width: {Math.min(lead.score, 100)}%; {lead.score >= 40 && lead.score < 70 ? 'background-color: #FEC129;' : ''}"
                ></div>
              </div>
              <span class="text-sm font-bold">{lead.score}</span>
            </div>
          </div>
          <div>
            <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Emails Sent</p>
            <p class="text-2xl font-black">{lead.emailsSentCount}</p>
          </div>
        </div>

        {#if lead.technologies.length > 0}
          <div class="mt-6 pt-6 border-t border-neutral-100">
            <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3 flex items-center gap-2">
              <iconify-icon icon="solar:programming-bold" width="16"></iconify-icon>
              Technologies
            </p>
            <div class="flex flex-wrap gap-2">
              {#each lead.technologies as tech}
                <span class="px-3 py-1.5 bg-neutral-100 rounded-lg text-xs font-bold text-neutral-700">
                  {tech}
                </span>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      {#if lead.metadata}
        {@const meta = lead.metadata}

        {#if meta.companyInfo}
          <div class="rounded-3xl p-8 shadow-lg" style="background-color: #EFEAE6;">
            <h2 class="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
              <iconify-icon icon="solar:buildings-2-bold" width="24"></iconify-icon>
              Company Information
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {#if meta.companyInfo.name}
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Company Name</p>
                  <p class="font-bold text-neutral-900">{meta.companyInfo.name}</p>
                </div>
              {/if}
              {#if meta.companyInfo.industry}
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Industry</p>
                  <p class="font-medium text-neutral-900">{meta.companyInfo.industry}</p>
                </div>
              {/if}
              {#if meta.companyInfo.size}
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Company Size</p>
                  <p class="font-medium text-neutral-900">{meta.companyInfo.size}</p>
                </div>
              {/if}
              {#if meta.companyInfo.founded}
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Founded</p>
                  <p class="font-medium text-neutral-900">{meta.companyInfo.founded}</p>
                </div>
              {/if}
              {#if meta.companyInfo.website}
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Website</p>
                  <a href={meta.companyInfo.website} target="_blank" rel="noopener noreferrer"
                     class="text-blue-600 hover:text-blue-800 underline font-medium break-all">
                    {meta.companyInfo.website}
                  </a>
                </div>
              {/if}
            </div>
            {#if meta.companyInfo.description}
              <div class="mt-6 pt-6 border-t border-neutral-100">
                <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">Description</p>
                <p class="text-neutral-700 leading-relaxed">{meta.companyInfo.description}</p>
              </div>
            {/if}
          </div>
        {/if}

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {#if meta.additionalEmails && meta.additionalEmails.length > 0}
            <div class="rounded-3xl p-8 shadow-lg" style="background-color: #EFEAE6;">
              <h2 class="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
                <iconify-icon icon="solar:letter-bold" width="24"></iconify-icon>
                Additional Emails ({meta.additionalEmails.length})
              </h2>
              <div class="space-y-3">
                {#each meta.additionalEmails as email}
                  <a href="mailto:{email}"
                     class="block px-4 py-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition font-mono text-sm text-blue-600 hover:text-blue-800 break-all">
                    {email}
                  </a>
                {/each}
              </div>
            </div>
          {/if}

          {#if meta.phoneNumbers && meta.phoneNumbers.length > 0}
            <div class="rounded-3xl p-8 shadow-lg" style="background-color: #EFEAE6;">
              <h2 class="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
                <iconify-icon icon="solar:phone-bold" width="24"></iconify-icon>
                Phone Numbers ({meta.phoneNumbers.length})
              </h2>
              <div class="space-y-3">
                {#each meta.phoneNumbers as phone}
                  <a href="tel:{phone}"
                     class="block px-4 py-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition font-mono text-sm text-blue-600 hover:text-blue-800 flex items-center gap-3">
                    <iconify-icon icon="solar:phone-calling-bold" width="20"></iconify-icon>
                    {phone}
                  </a>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        {#if meta.addresses && meta.addresses.length > 0}
          <div class="rounded-3xl p-8 shadow-lg" style="background-color: #EFEAE6;">
            <h2 class="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
              <iconify-icon icon="solar:map-point-bold" width="24"></iconify-icon>
              Addresses ({meta.addresses.length})
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {#each meta.addresses as address}
                <a href={getGoogleMapsUrl(address)} target="_blank" rel="noopener noreferrer"
                   class="block p-6 bg-neutral-50 hover:bg-neutral-100 rounded-2xl transition border border-neutral-200 hover:border-neutral-300">
                  <div class="flex items-start gap-3">
                    <iconify-icon icon="solar:map-bold" width="24" class="text-neutral-600 mt-1"></iconify-icon>
                    <div class="flex-1">
                      {#if address.street}
                        <p class="font-medium text-neutral-900">{address.street}</p>
                      {/if}
                      <p class="text-sm text-neutral-600 mt-1">
                        {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
                      </p>
                      {#if address.country}
                        <p class="text-sm text-neutral-600">{address.country}</p>
                      {/if}
                      {#if !address.street && address.fullAddress}
                        <p class="font-medium text-neutral-900">{address.fullAddress}</p>
                      {/if}
                      <p class="text-xs text-blue-600 mt-2 flex items-center gap-1">
                        <iconify-icon icon="solar:map-arrow-right-bold" width="14"></iconify-icon>
                        View on Google Maps
                      </p>
                    </div>
                  </div>
                </a>
              {/each}
            </div>
          </div>
        {/if}

        {#if meta.socialProfiles && meta.socialProfiles.length > 0}
          <div class="rounded-3xl p-8 shadow-lg" style="background-color: #EFEAE6;">
            <h2 class="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
              <iconify-icon icon="solar:share-bold" width="24"></iconify-icon>
              Social Media Profiles ({meta.socialProfiles.length})
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {#each meta.socialProfiles as profile}
                <a href={profile.url} target="_blank" rel="noopener noreferrer"
                   class="flex items-center gap-3 p-4 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition border border-neutral-200 hover:border-neutral-300">
                  <iconify-icon icon={getSocialIcon(profile.platform)} width="28" class="text-neutral-700"></iconify-icon>
                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm text-neutral-900 truncate">{profile.platform}</p>
                    <p class="text-xs text-neutral-500 flex items-center gap-1">
                      <iconify-icon icon="solar:link-bold" width="12"></iconify-icon>
                      View profile
                    </p>
                  </div>
                </a>
              {/each}
            </div>
          </div>
        {/if}

        {#if meta.technologyStack && meta.technologyStack.length > 0}
          <div class="rounded-3xl p-8 shadow-lg" style="background-color: #EFEAE6;">
            <h2 class="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
              <iconify-icon icon="solar:code-bold" width="24"></iconify-icon>
              Technology Stack ({meta.technologyStack.length})
            </h2>
            <div class="flex flex-wrap gap-3">
              {#each meta.technologyStack as tech}
                <span class="px-4 py-2 bg-gradient-to-br from-neutral-100 to-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-900 shadow-sm">
                  {tech}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        {#if meta.lastScrapedAt || meta.lastAuditedAt}
          <div class="bg-neutral-50 rounded-2xl border border-neutral-200 p-6">
            <div class="flex items-center gap-6 text-sm">
              {#if meta.lastScrapedAt}
                <div class="flex items-center gap-2 text-neutral-600">
                  <iconify-icon icon="solar:refresh-bold" width="16"></iconify-icon>
                  <span class="font-medium">Last Scraped:</span>
                  <span class="font-bold">{formatDate(new Date(meta.lastScrapedAt))}</span>
                </div>
              {/if}
              {#if meta.lastAuditedAt}
                <div class="flex items-center gap-2 text-neutral-600">
                  <iconify-icon icon="solar:check-circle-bold" width="16"></iconify-icon>
                  <span class="font-medium">Last Audited:</span>
                  <span class="font-bold">{formatDate(new Date(meta.lastAuditedAt))}</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {/if}

      <div class="space-y-6">
        {#if lead.email}
          <div class="rounded-3xl shadow-lg overflow-hidden" style="background-color: #EFEAE6;">
            <div class="bg-black text-white p-8">
              <h2 class="text-2xl font-black tracking-tight mb-2 flex items-center gap-3">
                <iconify-icon icon="solar:letter-bold" width="28"></iconify-icon>
                Email Outreach
              </h2>
              <p class="text-white/80 font-medium text-sm">
                Send a personalized cold outreach email using our high-conversion French templates.
              </p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
              <div class="space-y-6 min-w-0">
                <div>
                  <label class="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                    Template
                  </label>
                  <select
                    bind:value={selectedTemplate}
                    onchange={handleTemplateChange}
                    class="w-full px-4 py-3 bg-white border border-neutral-300 rounded-xl font-medium outline-none focus:border-black transition"
                  >
                    {#each templates as template}
                      <option value={template.id}>{template.name}</option>
                    {/each}
                  </select>
                </div>

                {#if selectedTemplate}
                  {@const template = templates.find(t => t.id === selectedTemplate)}
                  {#if template}
                    <div class="space-y-4">
                      <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        Template Variables
                      </p>
                      {#each template.variables as variable}
                        <div>
                          <label class="block text-xs font-bold text-neutral-600 mb-2 capitalize">
                            {variable.replace(/([A-Z])/g, ' $1').trim()}
                          </label>
                          <input
                            type="text"
                            bind:value={variables[variable]}
                            placeholder="Enter {variable}"
                            class="w-full px-4 py-3 bg-white border border-neutral-300 rounded-xl font-medium outline-none focus:border-black transition"
                          />
                        </div>
                      {/each}
                    </div>

                    <div class="pt-4">
                      <button
                        onclick={sendEmail}
                        disabled={sending}
                        class="w-full bg-black text-white px-6 py-4 rounded-xl font-bold hover:bg-neutral-800 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {#if sending}
                          <iconify-icon icon="svg-spinners:ring-resize" width="20"></iconify-icon>
                          Sending...
                        {:else}
                          <iconify-icon icon="solar:rocket-2-bold" width="20"></iconify-icon>
                          Send Email
                        {/if}
                      </button>
                    </div>
                  {/if}
                {/if}
              </div>

              <div class="space-y-4 min-w-0">
                <div class="flex items-center justify-between">
                  <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    Aperçu Email
                  </p>
                  <div class="flex items-center gap-2">
                    {#if previewLoading}
                      <iconify-icon icon="svg-spinners:ring-resize" width="12" class="text-neutral-400"></iconify-icon>
                    {/if}
                    <span class="text-[9px] font-bold text-neutral-500 bg-neutral-100 px-2 py-1 rounded">
                      Live
                    </span>
                  </div>
                </div>

                {#if emailPreview.subject || emailPreview.html}
                  <div class="border-2 border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-sm" class:opacity-50={previewLoading}>
                    <div class="bg-neutral-50 border-b-2 border-neutral-200 p-4">
                      <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">Objet</p>
                      <p class="font-bold text-base text-neutral-900">{emailPreview.subject || 'Pas de sujet'}</p>
                    </div>
                    <div class="p-6 max-h-[700px] overflow-y-auto bg-white">
                      <p class="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-4">Corps de l'email</p>
                      <div class="email-preview">
                        {@html emailPreview.html || '<p class="text-neutral-400 italic">Remplissez les variables pour voir l\'aperçu...</p>'}
                      </div>
                    </div>
                  </div>
                {:else}
                  <div class="border-2 border-dashed border-neutral-200 rounded-2xl p-16 text-center bg-neutral-50">
                    <iconify-icon icon="solar:document-bold" width="64" class="text-neutral-300 mb-4"></iconify-icon>
                    <p class="text-sm font-bold text-neutral-500">
                      Sélectionnez un template pour voir l'aperçu
                    </p>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {:else}
          <div class="bg-red-50 border border-red-200 rounded-3xl p-8">
            <div class="flex items-start gap-4">
              <iconify-icon icon="solar:danger-triangle-bold" width="32" class="text-red-500"></iconify-icon>
              <div>
                <h3 class="text-lg font-black uppercase text-red-700 mb-2">No Email Address</h3>
                <p class="text-red-600 font-medium">
                  This lead doesn't have an email address. Email outreach is not available.
                </p>
              </div>
            </div>
          </div>
        {/if}

        <div class="rounded-3xl p-8 shadow-lg" style="background-color: #EFEAE6;">
          <h2 class="text-xl font-black tracking-tight mb-6 flex items-center gap-3">
            <iconify-icon icon="solar:history-bold" width="24"></iconify-icon>
            Email History ({outreachHistory.length})
          </h2>

          {#if outreachHistory.length === 0}
            <div class="py-12 text-center">
              <iconify-icon icon="solar:inbox-line-bold" width="64" class="text-neutral-200 mb-4"></iconify-icon>
              <p class="text-neutral-400 font-bold uppercase tracking-widest text-sm">
                No emails sent yet
              </p>
            </div>
          {:else}
            <div class="space-y-4">
              {#each outreachHistory as email}
                <div class="border border-neutral-200 rounded-2xl overflow-hidden hover:border-neutral-300 transition" in:fade>
                  <button
                    onclick={() => toggleEmailExpansion(email.id)}
                    class="w-full p-6 text-left hover:bg-neutral-50 transition-colors"
                  >
                    <div class="flex items-start justify-between mb-3">
                      <div class="flex-1">
                        <p class="font-bold text-neutral-900">{email.subject}</p>
                        <div class="flex items-center gap-3 mt-2 text-xs text-neutral-600">
                          <span class="flex items-center gap-1">
                            <iconify-icon icon="solar:calendar-bold" width="14"></iconify-icon>
                            {formatDate(email.sentAt || email.createdAt)}
                          </span>
                          <span class="flex items-center gap-1">
                            <iconify-icon icon="solar:document-text-bold" width="14"></iconify-icon>
                            Template: {email.templateId}
                          </span>
                        </div>
                        {#if email.error}
                          <p class="text-xs text-red-600 mt-2 flex items-center gap-1">
                            <iconify-icon icon="solar:danger-triangle-bold" width="14"></iconify-icon>
                            {email.error}
                          </p>
                        {/if}
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="px-3 py-1 rounded-lg text-xs font-bold {getStatusColor(email.status)}">
                          {email.status}
                        </span>
                        <iconify-icon
                          icon={expandedEmails.has(email.id) ? "solar:alt-arrow-up-bold" : "solar:alt-arrow-down-bold"}
                          width="16"
                          class="text-neutral-500"
                        ></iconify-icon>
                      </div>
                    </div>
                  </button>

                  {#if expandedEmails.has(email.id)}
                    <div class="border-t border-neutral-200 p-6 bg-neutral-50" in:fly={{ y: -10, duration: 200 }}>
                      <div class="space-y-4">
                        <div>
                          <h4 class="font-bold text-sm text-neutral-700 mb-2 flex items-center gap-2">
                            <iconify-icon icon="solar:text-field-bold" width="16"></iconify-icon>
                            Email Content
                          </h4>
                          <div class="bg-white rounded-lg border border-neutral-200 p-4">
                            <div class="prose prose-sm max-w-none">
                              <p class="text-sm text-neutral-800 whitespace-pre-wrap">{email.textBody || 'No text content'}</p>
                            </div>
                          </div>
                        </div>

                        {#if email.variables && Object.keys(email.variables).length > 0}
                          <div>
                            <h4 class="font-bold text-sm text-neutral-700 mb-2 flex items-center gap-2">
                              <iconify-icon icon="solar:code-square-bold" width="16"></iconify-icon>
                              Template Variables
                            </h4>
                            <div class="grid grid-cols-2 gap-2">
                              {#each Object.entries(email.variables) as [key, value]}
                                <div class="bg-white rounded-lg border border-neutral-200 p-3">
                                  <p class="text-xs font-semibold text-neutral-600">{key}</p>
                                  <p class="text-sm text-neutral-900">{value}</p>
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/if}

                        {#if email.sentAt}
                          <div class="flex flex-wrap gap-4 text-xs text-neutral-600">
                            {#if email.openedAt}
                              <span class="flex items-center gap-1">
                                <iconify-icon icon="solar:eye-bold" width="14"></iconify-icon>
                                Opened: {formatDate(email.openedAt)}
                              </span>
                            {/if}
                            {#if email.clickedAt}
                              <span class="flex items-center gap-1">
                                <iconify-icon icon="solar:cursor-bold" width="14"></iconify-icon>
                                Clicked: {formatDate(email.clickedAt)}
                              </span>
                            {/if}
                            {#if email.repliedAt}
                              <span class="flex items-center gap-1">
                                <iconify-icon icon="solar:chat-round-dots-bold" width="14"></iconify-icon>
                                Replied: {formatDate(email.repliedAt)}
                              </span>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.email-preview) {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
  }

  :global(.email-preview h1),
  :global(.email-preview h2),
  :global(.email-preview h3) {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }

  :global(.email-preview p) {
    margin-bottom: 1em;
  }

  :global(.email-preview .container) {
    max-width: 600px;
    margin: 0 auto;
  }

  :global(.email-preview .header) {
    padding: 30px;
    border-radius: 10px 10px 0 0;
  }

  :global(.email-preview .content) {
    padding: 30px;
    border-radius: 0 0 10px 10px;
  }

  :global(.email-preview .footer) {
    text-align: center;
    margin-top: 30px;
    font-size: 12px;
  }
</style>
