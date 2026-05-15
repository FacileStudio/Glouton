<script lang="ts">
    import { cva, type VariantProps } from 'class-variance-authority';
    import type { Snippet } from 'svelte';

    const badgeClass = cva(
        "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
        {
            variants: {
                variant: {
                    primary: "border-transparent bg-primary text-primary-foreground",
                    accent: "border-border bg-muted text-foreground",
                    success: "border-transparent bg-success/10 text-success",
                    warning: "border-transparent bg-warning/10 text-warning-hover",
                    danger: "border-transparent bg-destructive/10 text-destructive",
                    slate: "border-border bg-background text-muted-foreground"
                }
            },
            defaultVariants: {
                variant: "slate"
            }
        }
    );

    let { variant = 'slate', children }: { variant?: VariantProps<typeof badgeClass>['variant']; children?: Snippet } = $props();
</script>

<span class={badgeClass({ variant })}>
    {@render children?.()}
</span>
