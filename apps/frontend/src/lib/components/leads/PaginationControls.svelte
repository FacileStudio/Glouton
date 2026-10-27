<script lang="ts">
  import { Card, IconButton, Select } from '@facile/muse';

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
  <Card class="flex flex-col items-center justify-between gap-3 p-3 sm:flex-row sm:px-4">
    <div class="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
      <Select
        value={String(pageSize)}
        onchange={(e) => changePageSize(Number(e.currentTarget.value))}
        aria-label="Leads par page"
        class="w-auto"
      >
        <option value="10">10 / page</option>
        <option value="25">25 / page</option>
        <option value="50">50 / page</option>
        <option value="100">100 / page</option>
      </Select>
      <p class="whitespace-nowrap text-fc-xs text-fc-fg-muted sm:text-fc-sm">
        {startItem}–{endItem} sur {totalItems}
      </p>
    </div>

    <div class="flex w-full items-center justify-between gap-1.5 sm:w-auto sm:justify-start">
      <IconButton variant="ghost" onclick={() => goToPage(1)} disabled={currentPage === 1} aria-label="Première page">
        <iconify-icon icon="mdi:chevron-double-left" width="18" height="18" class="block"></iconify-icon>
      </IconButton>
      <IconButton variant="ghost" onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Page précédente">
        <iconify-icon icon="mdi:chevron-left" width="18" height="18" class="block"></iconify-icon>
      </IconButton>
      <span class="whitespace-nowrap px-2 text-fc-xs font-medium text-fc-fg-muted">
        Page {currentPage} / {totalPages}
      </span>
      <IconButton variant="ghost" onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Page suivante">
        <iconify-icon icon="mdi:chevron-right" width="18" height="18" class="block"></iconify-icon>
      </IconButton>
      <IconButton variant="ghost" onclick={() => goToPage(totalPages)} disabled={currentPage === totalPages} aria-label="Dernière page">
        <iconify-icon icon="mdi:chevron-double-right" width="18" height="18" class="block"></iconify-icon>
      </IconButton>
    </div>
  </Card>
{/if}
