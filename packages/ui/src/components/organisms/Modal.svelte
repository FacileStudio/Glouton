<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { scale, fade } from 'svelte/transition';
  import 'iconify-icon';

  export let open = false;
  export let title = "";
  export let onClose: (() => void) | undefined = undefined;

  const dispatch = createEventDispatcher();
  let dialog: HTMLDialogElement;

  $: if (dialog && open) dialog.showModal();
  $: if (dialog && !open) dialog.close();

  /**
   * close
   */
  function close() {
    open = false;
    /**
     * dispatch
     */
    dispatch('close');
    /**
     * if
     */
    if (onClose) onClose();
  }
</script>

{#if open}
  <dialog
    bind:this={dialog}
    on:close={close}
    on:click|self={close}
    class="w-full h-screen bg-transparent outline-none backdrop:bg-brand-purple/30 backdrop:backdrop-blur-sm p-4 outline-none flex items-center justify-center z-50" >
    <div
      in:scale={{ start: 0.9, duration: 300, opacity: 0 }}
      out:scale={{ start: 0.95, duration: 200, opacity: 0 }}
      class="bg-white rounded-[35px] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
    >
      <header class="p-6 flex justify-between items-center border-b border-slate-100">
        <h3 class="font-black uppercase tracking-tight text-xl text-brand-purple">{title}</h3>
        <button
          on:click={close}
          class="text-slate-400 hover:text-danger hover:scale-110 transition-all duration-200 cursor-pointer"
          aria-label="Close modal"
        >
          <iconify-icon icon="solar:close-circle-bold" width="28"></iconify-icon>
        </button>
      </header>

      <div class="p-8">
        <slot />
      </div>
    </div>
  </dialog>
{/if}

<style>
  dialog::backdrop {
    animation: backdrop-fade-in 0.3s ease-out forwards;
  }

  @keyframes backdrop-fade-in {
    from {
      opacity: 0;
      backdrop-filter: blur(0px);
    }
    to {
      opacity: 1;
      backdrop-filter: blur(8px);
    }
  }
</style>
