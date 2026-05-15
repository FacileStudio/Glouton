<script lang="ts">
    import { cn } from '@repo/utils';

    export let label = '';
    export let value = '';
    export let icon = '';
    export let trend: 'up' | 'down' | 'neutral' = 'neutral';
    export let trendValue = '';
    let className = "";
    export { className as class };

    const trendColors = {
        up: 'text-success bg-success/10',
        down: 'text-destructive bg-destructive/10',
        neutral: 'text-muted-foreground bg-muted',
    };

    const trendIcons = {
        up: 'solar:arrow-up-bold',
        down: 'solar:arrow-down-bold',
        neutral: 'solar:minus-circle-bold',
    };
</script>

<div class={cn("bg-card p-6 rounded-xl border border-border", className)}>
    <div class="flex items-start justify-between mb-4">
        <div class="text-sm font-medium text-muted-foreground">
            {label}
        </div>
        {#if icon}
            <div class="flex size-9 items-center justify-center rounded-md border border-border bg-background">
                <iconify-icon {icon} width="20" class="text-foreground"></iconify-icon>
            </div>
        {/if}
    </div>

    <div class="text-3xl font-semibold text-foreground mb-2">
        {value}
    </div>

    {#if trendValue}
        <div class={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", trendColors[trend])}>
            <iconify-icon icon={trendIcons[trend]} width="14"></iconify-icon>
            {trendValue}
        </div>
    {/if}
</div>
