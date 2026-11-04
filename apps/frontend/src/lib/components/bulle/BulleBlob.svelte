<script lang="ts">
  import '@facile/blob/motion.css';
  import '@facile/blob/gaze.css';
  import { Blob, gaze, happy, thinking } from '@facile/blob';
  import { MediaQuery } from 'svelte/reactivity';
  import type { BulleMood } from './status';

  interface Props {
    name?: string;
    mood?: BulleMood;
    size?: number;
    class?: string;
  }

  let { name = 'Bulle', mood = 'idle', size = 40, class: className = '' }: Props = $props();

  const reduced = new MediaQuery('(prefers-reduced-motion: reduce)');
  const eyes = gaze({ travel: 4, target: 'pointer' });

  const animate = $derived(mood === 'thinking' && !reduced.current ? 'always' : undefined);
  const expression = $derived(mood === 'done' ? happy : mood === 'thinking' ? thinking : undefined);
  const tone = $derived(mood === 'unavailable' ? 'opacity-50 grayscale' : '');
</script>

<Blob {@attach eyes} {name} {size} {animate} {expression} class="shrink-0 {tone} {className}" />
