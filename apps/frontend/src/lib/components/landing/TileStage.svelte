<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Stage, type Act } from '@facile/mise-en-scene';

  interface Props {
    script: (act: Act) => Promise<void>;
    reset: () => void;
    poster: () => void;
    children: Snippet;
  }

  let { script, reset, poster, children: scene }: Props = $props();

  let slot = $state(0);
</script>

<div bind:clientWidth={slot}>
  <Stage width={Math.max(300, slot || 320)} height={240} {script} {reset} {poster}>
    {@render scene()}
  </Stage>
</div>
