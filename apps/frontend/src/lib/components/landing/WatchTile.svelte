<script lang="ts">
  import { fade } from 'svelte/transition';
  import { Badge } from '@facile/muse';
  import { Bar, Tile, grow, type Act } from '@facile/mise-en-scene';
  import { useT } from '$lib/i18n';
  import TileStage from './TileStage.svelte';

  type Op = '+' | '-' | ' ';

  const t = useT();

  const DIFF: { op: Op; text: string }[] = [
    { op: ' ', text: 'Pro · 99 €' },
    { op: '-', text: 'Starter · 29 €' },
    { op: '+', text: 'Starter · 39 €' }
  ];

  let lines = $state(1);
  let fresh = $state(false);
  let summed = $state(false);

  function reset() {
    lines = 1;
    fresh = false;
    summed = false;
  }

  function poster() {
    lines = DIFF.length;
    fresh = true;
    summed = true;
  }

  async function script(act: Act) {
    await act.wait(900);
    fresh = true;
    await act.wait(500);
    for (let i = 2; i <= DIFF.length; i++) {
      lines = i;
      await act.wait(700);
    }
    await act.wait(500);
    summed = true;
    await act.wait(2600);
    reset();
    await act.wait(700);
  }
</script>

<Tile title={t('landing.tiles.watch.title')} body={t('landing.tiles.watch.body')}>
  <TileStage {script} {reset} {poster}>
    <div class="wt-panel absolute top-5 right-6 bottom-[26px] left-6 overflow-hidden rounded-fc-lg bg-fc-page p-3">
      <div class="flex flex-col gap-2 rounded-fc-md bg-fc-surface p-3">
        <div class="flex min-w-0 items-center gap-1.5">
          {#if fresh}<span class="shrink-0" transition:fade={{ duration: 250 }}><Badge tone="info">{t('watch.new')}</Badge></span>{/if}
          <Badge class="shrink-0">{t('watch.kind.PRICING')}</Badge>
          <span class="min-w-0 truncate text-fc-sm font-medium text-fc-fg">rival.fr/pricing</span>
        </div>
        <Bar w="58%" />
        <ol class="flex flex-col gap-0.5 rounded-fc-md bg-fc-component p-1.5 font-fc-mono text-fc-xs">
          {#each DIFF.slice(0, lines) as line, i (i)}
            <li
              class="flex gap-2 rounded-fc-sm px-2 py-0.5 whitespace-nowrap {line.op === '+'
                ? 'bg-fc-success/10 text-fc-fg'
                : line.op === '-'
                  ? 'bg-fc-danger/10 text-fc-fg-muted line-through'
                  : 'text-fc-fg-muted'}"
              transition:grow={{ duration: 300 }}
            >
              <span class="w-3 shrink-0">{line.op === '-' ? '−' : line.op}</span>
              <span>{line.text}</span>
            </li>
          {/each}
        </ol>
        {#if summed}
          <p class="flex items-center gap-1.5 text-fc-sm text-fc-fg" transition:grow={{ duration: 300 }}>
            <Badge tone="info" class="shrink-0">{t('competitorAi.summaryBadge')}</Badge>
            <span class="min-w-0 truncate">{t('landing.tiles.watch.summary')}</span>
          </p>
        {/if}
      </div>
    </div>
  </TileStage>
</Tile>

<style>
  .wt-panel {
    box-shadow: 0 10px 22px -12px rgb(0 0 0 / 0.28);
  }
</style>
