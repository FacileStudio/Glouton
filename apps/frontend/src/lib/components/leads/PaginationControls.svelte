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
</script>

{#if totalPages > 0}
  <div class="rounded-[32px] shadow-lg px-10 py-6 flex flex-col md:flex-row justify-between items-center gap-4" style="background-color: #EFEAE6;">
    <div class="flex items-center gap-4">
      <select
        bind:value={pageSize}
        onchange={(e) => changePageSize(Number(e.currentTarget.value))}
        class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none focus:border-black transition"
      >
        <option value={10}>10 par page</option>
        <option value={25}>25 par page</option>
        <option value={50}>50 par page</option>
        <option value={100}>100 par page</option>
      </select>
      <p class="text-sm font-medium text-neutral-600">
        Affichage {startItem} - {endItem} sur {totalItems} leads
      </p>
    </div>

    <div class="flex gap-2">
      <button
        onclick={() => goToPage(1)}
        disabled={currentPage === 1}
        class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
      >
        Première
      </button>
      <button
        onclick={() => goToPage(currentPage - 1)}
        disabled={currentPage === 1}
        class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
      >
        Précédente
      </button>
      <div class="flex items-center gap-2 px-4">
        <span class="text-xs font-bold text-neutral-600">Page {currentPage} sur {totalPages}</span>
      </div>
      <button
        onclick={() => goToPage(currentPage + 1)}
        disabled={currentPage === totalPages}
        class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
      >
        Suivante
      </button>
      <button
        onclick={() => goToPage(totalPages)}
        disabled={currentPage === totalPages}
        class="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-50 transition"
      >
        Dernière
      </button>
    </div>
  </div>
{/if}