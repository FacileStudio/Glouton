<script lang="ts">
  import 'iconify-icon';

  let {
    currentPage = $bindable(),
    totalPages,
    pageSize = $bindable(),
    totalItems,
    onPageChange,
  }: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
  } = $props();

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      currentPage = page;
      onPageChange(page);
    }
  }

  function changePageSize(newSize: number) {
    pageSize = newSize;
    currentPage = 1;
    onPageChange(1);
  }

  const startItem = $derived((currentPage - 1) * pageSize + 1);
  const endItem = $derived(Math.min(currentPage * pageSize, totalItems));

  const navButtonClass =
    'inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-background';
</script>

{#if totalPages > 0}
  <div
    class="flex flex-col items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:px-4"
  >
    <div class="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
      <select
        bind:value={pageSize}
        onchange={(e) => changePageSize(Number(e.currentTarget.value))}
        class="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-foreground"
      >
        <option value={10}>10 / page</option>
        <option value={25}>25 / page</option>
        <option value={50}>50 / page</option>
        <option value={100}>100 / page</option>
      </select>
      <p class="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
        {startItem}–{endItem} sur {totalItems}
      </p>
    </div>

    <div class="flex w-full items-center justify-between gap-1.5 sm:w-auto sm:justify-start">
      <button
        onclick={() => goToPage(1)}
        disabled={currentPage === 1}
        aria-label="Première page"
        class={navButtonClass}
      >
        <iconify-icon icon="solar:double-alt-arrow-left-linear" width="16"></iconify-icon>
      </button>
      <button
        onclick={() => goToPage(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Page précédente"
        class={navButtonClass}
      >
        <iconify-icon icon="solar:alt-arrow-left-linear" width="16"></iconify-icon>
      </button>
      <span class="whitespace-nowrap px-2 text-xs font-medium text-muted-foreground">
        Page {currentPage} / {totalPages}
      </span>
      <button
        onclick={() => goToPage(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Page suivante"
        class={navButtonClass}
      >
        <iconify-icon icon="solar:alt-arrow-right-linear" width="16"></iconify-icon>
      </button>
      <button
        onclick={() => goToPage(totalPages)}
        disabled={currentPage === totalPages}
        aria-label="Dernière page"
        class={navButtonClass}
      >
        <iconify-icon icon="solar:double-alt-arrow-right-linear" width="16"></iconify-icon>
      </button>
    </div>
  </div>
{/if}
