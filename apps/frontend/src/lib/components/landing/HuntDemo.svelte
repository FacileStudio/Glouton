<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { Badge, Button } from '@facile/muse';
  import { Bar, Cursor, Roll, Stage, Window, cursorAt, grow, type Act } from '@facile/mise-en-scene';
  import { useT } from '$lib/i18n';

  type Phase = 'idle' | 'running' | 'done';
  type Score = 'HOT' | 'WARM' | 'COLD';

  const t = useT();

  const LEADS: { name: string; city: number; score: Score; logo: string }[] = [
    { name: 'Le Comptoir Saint-Paul', city: 54, score: 'HOT', logo: 'var(--color-fc-accent)' },
    { name: 'Bouchon des Halles', city: 46, score: 'HOT', logo: 'var(--color-fc-warning)' },
    { name: 'Maison Brunet', city: 60, score: 'WARM', logo: 'var(--color-fc-success)' },
    { name: 'Café Terreaux', city: 40, score: 'WARM', logo: 'var(--color-fc-info)' },
    { name: 'La Table de Léon', city: 50, score: 'COLD', logo: 'var(--color-fc-danger)' }
  ];
  const NAV = [58, 64, 52, 46];

  let phase = $state<Phase>('idle');
  let shown = $state(0);
  let cursor = $state(cursorAt());
  let launch = $state<HTMLElement>();

  const status = $derived(
    phase === 'idle' ? t('hunts.status.pending') : phase === 'running' ? t('hunts.status.processing') : t('hunts.status.completed')
  );
  const found = $derived(t('landing.demo.found', { count: String(shown * 12) }));

  function reset() {
    phase = 'idle';
    shown = 0;
    cursor.visible = false;
  }

  function poster() {
    phase = 'done';
    shown = LEADS.length;
  }

  async function script(act: Act) {
    cursor.x = 700;
    cursor.y = 440;
    await act.wait(700);
    cursor.visible = true;
    await act.move(cursor, act.point(launch, 0.82, 0.78));
    await act.click(cursor);
    phase = 'running';
    await tick();
    await act.move(cursor, { x: cursor.x + 70, y: cursor.y + 120 }, 400);
    cursor.visible = false;
    for (let i = 1; i <= LEADS.length; i++) {
      await act.wait(650);
      shown = i;
    }
    await act.wait(500);
    phase = 'done';
    await act.wait(2200);
    reset();
    await act.wait(600);
  }
</script>

{#snippet nav()}
  <div class="flex items-center gap-2 px-5 pt-3 pb-5 font-fc-title text-[15px] font-bold text-fc-fg">
    <iconify-icon icon="solar:magnet-wave-bold-duotone" width="20" height="20"></iconify-icon>
    <span>Glouton</span>
  </div>
  <div class="grid gap-1 px-3">
    {#each NAV as w, i (i)}
      <div class="flex h-[34px] items-center gap-2.5 rounded-fc-md px-2.5 {i === 1 ? 'bg-fc-fg/5' : ''}">
        <span class="size-4 shrink-0 rounded-[5px] bg-fc-fg/20"></span><Bar w="{w}%" />
      </div>
    {/each}
  </div>
{/snippet}

<Stage
  width={960}
  height={560}
  compact={{ below: 640, width: 358, height: 520 }}
  label={t('landing.demo.label')}
  {script}
  {reset}
  {poster}
>
  {#snippet children({ compact })}
    <Window
      style={compact ? 'top:16px;left:16px;width:326px;height:488px' : 'top:24px;left:56px;width:848px;height:512px'}
      sidebar={compact ? undefined : nav}
    >
      <div class="hd-body" class:hd-compact={compact}>
        <div class="hd-head">
          <div class="flex min-w-0 flex-col gap-1.5">
            <span class="truncate font-fc-title text-fc-lg font-bold text-fc-fg">{t('landing.demo.hunt')}</span>
            <span class="flex items-center gap-2 text-fc-xs text-fc-fg-muted">
              <Badge tone={phase === 'done' ? 'success' : 'neutral'}><Roll value={status} /></Badge>
              {#if !compact}<span>{t('hunts.kind.local')}</span>{/if}
            </span>
          </div>
          <span bind:this={launch} class="shrink-0">
            <Button icon="solar:radar-2-linear" disabled={phase === 'running'}>{t('landing.demo.launch')}</Button>
          </span>
        </div>

        <div class="flex items-baseline justify-between gap-3 px-1">
          <span class="text-fc-sm font-bold text-fc-fg">{t('nav.tab.leads')}</span>
          <Roll class="text-fc-sm text-fc-fg-muted tabular-nums" value={found} />
        </div>

        <ul class="hd-list">
          {#each LEADS.slice(0, shown) as lead (lead.name)}
            <li class="hd-row" in:grow out:fade={{ duration: 200 }}>
              <span class="size-8 shrink-0 rounded-fc-md" style="background:{lead.logo}"></span>
              <span class="flex min-w-0 flex-1 flex-col gap-1.5">
                <span class="truncate text-fc-sm font-bold text-fc-fg">{lead.name}</span>
                <Bar w="{lead.city}%" />
              </span>
              {#if !compact}<span class="hd-mail"><Bar w="80%" /></span>{/if}
              <span class="hd-score"><Badge tone={lead.score === 'HOT' ? 'danger' : 'neutral'}>{lead.score}</Badge></span>
            </li>
          {/each}
          {#if shown === 0}
            {#each [0, 1, 2] as i (i)}
              <li class="hd-row hd-ghost" out:fade={{ duration: 150 }}>
                <span class="size-8 shrink-0 rounded-fc-md bg-fc-fg/10"></span>
                <span class="flex flex-1 flex-col gap-1.5"><Bar w="{50 - i * 8}%" /><Bar w="{34 - i * 4}%" /></span>
              </li>
            {/each}
          {/if}
        </ul>
      </div>
    </Window>
    <Cursor {cursor} />
  {/snippet}
</Stage>

<style>
  .hd-body {
    display: flex;
    flex-direction: column;
    gap: 18px;
    height: 100%;
    padding: 24px 28px;
    font-family: var(--font-fc-body);
  }

  .hd-compact {
    gap: 14px;
    padding: 16px;
  }

  .hd-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-radius: var(--radius-fc-lg);
    background: var(--color-fc-surface);
  }

  .hd-compact .hd-head {
    padding: 12px 14px;
  }

  .hd-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .hd-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 6px;
  }

  .hd-ghost {
    opacity: 0.6;
  }

  .hd-score {
    display: flex;
    width: 64px;
    flex-shrink: 0;
    justify-content: flex-end;
  }

  .hd-mail {
    width: 150px;
    flex-shrink: 0;
  }
</style>
