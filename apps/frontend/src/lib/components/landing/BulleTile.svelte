<script lang="ts">
  import { Button } from '@facile/muse';
  import { Bar, Roll, Stream, Tile, grow, type Act } from '@facile/mise-en-scene';
  import BulleBlob from '$lib/components/bulle/BulleBlob.svelte';
  import type { BulleMood } from '$lib/components/bulle/status';
  import { useT } from '$lib/i18n';
  import TileStage from './TileStage.svelte';

  const t = useT();

  const reply = $derived(t('landing.tiles.bulle.reply'));
  const words = $derived(reply.split(' ').length);

  let mood = $state<BulleMood>('idle');
  let pressed = $state(false);
  let answered = $state(false);
  let streamed = $state(0);

  const status = $derived(mood === 'thinking' ? t('assistant.thinking') : t('assistant.available'));

  function reset() {
    mood = 'idle';
    pressed = false;
    answered = false;
    streamed = 0;
  }

  function poster() {
    mood = 'done';
    answered = true;
    streamed = words;
  }

  async function script(act: Act) {
    await act.wait(900);
    pressed = true;
    await act.wait(250);
    pressed = false;
    mood = 'thinking';
    await act.wait(1300);
    answered = true;
    await act.count(words, (v) => (streamed = v), 90);
    mood = 'done';
    await act.wait(2400);
    reset();
    await act.wait(700);
  }
</script>

<Tile title={t('landing.tiles.bulle.title')} body={t('landing.tiles.bulle.body')}>
  <TileStage {script} {reset} {poster}>
    <div class="bt-panel absolute top-5 right-6 bottom-[26px] left-6 flex flex-col gap-3 overflow-hidden rounded-fc-lg bg-fc-page p-3">
      <div class="flex items-center gap-2.5">
        <BulleBlob {mood} size={30} />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="text-fc-sm font-semibold text-fc-fg">Bulle</span>
          <Roll class="h-4 text-fc-xs leading-4 text-fc-fg-muted" value={status} />
        </div>
        <span class="shrink-0 transition-transform duration-150" class:scale-95={pressed}>
          <Button size="sm" variant="secondary">{t('assistant.draft')}</Button>
        </span>
      </div>
      {#if answered}
        <div class="flex flex-col gap-1.5 rounded-fc-md bg-fc-surface p-3" transition:grow={{ duration: 350 }}>
          <span class="truncate text-fc-sm font-semibold text-fc-fg">{t('landing.tiles.bulle.subject')}</span>
          <Stream class="m-0 text-fc-xs leading-5 text-fc-fg" text={reply} count={streamed} />
        </div>
      {:else}
        <div class="flex flex-col gap-2 rounded-fc-md bg-fc-surface p-3 opacity-60">
          <Bar w="46%" />
          <Bar w="82%" />
          <Bar w="68%" />
        </div>
      {/if}
    </div>
  </TileStage>
</Tile>

<style>
  .bt-panel {
    box-shadow: 0 10px 22px -12px rgb(0 0 0 / 0.28);
  }
</style>
