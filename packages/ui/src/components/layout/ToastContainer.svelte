<script lang="ts">
    import { toast } from '@repo/utils';
    import { flip } from 'svelte/animate';
    import { fly } from 'svelte/transition';
    import 'iconify-icon';

    const icons = {
        success: 'solar:check-circle-bold',
        error: 'solar:danger-circle-bold',
        info: 'solar:info-circle-bold',
        warning: 'solar:bell-bold'
    };

    const colors = {
        success: 'text-emerald-600',
        error: 'text-rose-600',
        info: 'text-indigo-600',
        warning: 'text-amber-600'
    };
</script>

<div class="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none" style="width: 280px; position: fixed !important; bottom: 1rem !important; right: 1rem !important;">
    {#each $toast as t (t.id)}
        <div
            animate:flip={{ duration: 200 }}
            in:fly={{ x: 30, duration: 300 }}
            out:fly={{ x: 30, duration: 200 }}
            class="flex items-center gap-2 p-3 rounded-lg bg-white shadow-lg pointer-events-auto {colors[t.type]}"
        >
            <div class="flex-shrink-0">
                <iconify-icon icon={icons[t.type]} width="18"></iconify-icon>
            </div>

            <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-gray-700 line-clamp-2">
                    {t.message}
                </p>
            </div>

            <button
                on:click={() => toast.remove(t.id)}
                class="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                aria-label="Close notification"
            >
                <iconify-icon icon="solar:close-line-duotone" width="16"></iconify-icon>
            </button>
        </div>
    {/each}
</div>
