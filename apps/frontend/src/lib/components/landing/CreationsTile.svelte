<script lang="ts">
  import { fade } from 'svelte/transition';
  import { Badge, Icon } from '@facile/muse';
  import { Bar, Tile, grow, type Act } from '@facile/mise-en-scene';
  import { useT } from '$lib/i18n';
  import TileStage from './TileStage.svelte';

  const t = useT();

  const COMPANIES = [
    { name: 'Nordik', form: 'EURL', site: true },
    { name: 'Café Lumen', form: 'SARL', site: false },
    { name: 'Atelier Verne', form: 'SAS', site: false }
  ];

  let shown = $state(0);

  const visible = $derived(COMPANIES.slice(0, shown).reverse());

  function reset() {
    shown = 0;
  }

  function poster() {
    shown = COMPANIES.length;
  }

  async function script(act: Act) {
    await act.wait(600);
    for (let i = 1; i <= COMPANIES.length; i++) {
      shown = i;
      await act.wait(1100);
    }
    await act.wait(2000);
    reset();
    await act.wait(700);
  }
</script>

<Tile title={t('landing.tiles.creations.title')} body={t('landing.tiles.creations.body')}>
  <TileStage {script} {reset} {poster}>
    <div class="ct-panel absolute top-4 right-6 bottom-6 left-6 overflow-hidden rounded-fc-lg bg-fc-page p-3">
      <ul class="flex flex-col">
        {#each visible as company (company.name)}
          <li class="pb-1.5" transition:grow>
            <div class="flex flex-col gap-1 rounded-fc-md bg-fc-component px-2.5 py-2">
              <div class="flex min-w-0 items-center gap-1.5">
                <span class="min-w-0 truncate text-fc-sm font-semibold text-fc-fg">{company.name}</span>
                <span class="shrink-0 rounded-fc-xs bg-fc-surface px-1.5 py-0.5 font-fc-mono text-[10px] leading-3 text-fc-fg-muted">{company.form}</span>
                <span class="ml-auto shrink-0">
                  {#if company.site}
                    <Badge tone="success"><span class="inline-flex items-center gap-1"><Icon icon="solar:globe-linear" size={12} />{t('creations.websiteFound')}</span></Badge>
                  {:else}
                    <Badge tone="danger"><span class="inline-flex items-center gap-1"><Icon icon="solar:fire-linear" size={12} />{t('creations.noWebsite')}</span></Badge>
                  {/if}
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-fc-fg-muted">
                <Icon icon="solar:calendar-linear" size={12} />
                <Bar w="22%" />
                <Icon icon="solar:map-point-linear" size={12} />
                <Bar w="30%" />
              </div>
            </div>
          </li>
        {/each}
      </ul>
      {#if shown === 0}
        <div class="absolute inset-x-3 top-3 flex flex-col gap-1.5" out:fade={{ duration: 200 }}>
          {#each [0, 1, 2] as i (i)}
            <div class="flex h-[54px] flex-col justify-center gap-2 rounded-fc-md bg-fc-component px-2.5 opacity-60">
              <Bar w="{56 - i * 8}%" />
              <Bar w="{38 - i * 4}%" />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </TileStage>
</Tile>

<style>
  .ct-panel {
    box-shadow: 0 10px 22px -12px rgb(0 0 0 / 0.28);
  }
</style>
