<script lang="ts">
    import { cn } from '@repo/utils';

    export let tabs: Array<{ label: string; value: string; icon?: string }> = [];
    export let activeTab = '';
    let className = "";
    export { className as class };

    $: if (!activeTab && tabs.length > 0) {
        activeTab = tabs[0].value;
    }
</script>

<div class={cn("grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200", className)}>
    {#each tabs as tab (tab.value)}
        <button
            onclick={() => activeTab = tab.value}
            class={cn(
                "px-6 py-4 rounded-xl text-base font-black transition-all uppercase flex items-center justify-center gap-3 cursor-pointer",
                activeTab === tab.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
            )}
        >
            {#if tab.icon}
                <iconify-icon icon={tab.icon} width="22"></iconify-icon>
            {/if}
            {tab.label}
        </button>
    {/each}
</div>

<div class="mt-6">
    <slot {activeTab} />
</div>
