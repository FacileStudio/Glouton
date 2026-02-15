<script lang="ts">
    import { cva, type VariantProps } from 'class-variance-authority';
    import type { Snippet } from 'svelte';

    const badgeClass = cva(
        "inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight border min-w-[70px] transition-all duration-200",
        {
            variants: {
                variant: {
                    primary: "bg-brand-purple/10 text-brand-purple border-brand-purple/20",
                    accent: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
                    success: "bg-success-light text-success border-success/20",
                    warning: "bg-warning-light text-warning-hover border-warning/20",
                    danger: "bg-danger-light text-danger border-danger/20",
                    slate: "bg-slate-50 text-slate-500 border-slate-100"
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
