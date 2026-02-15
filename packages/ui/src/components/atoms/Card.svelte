<script lang="ts">
    import { cva, type VariantProps } from 'class-variance-authority';

    const cardClass = cva(
        "bg-white border transition-all duration-200",
        {
            variants: {
                padding: {
                    none: "p-0",
                    sm: "p-4",
                    md: "p-6",
                    lg: "p-8",
                },
                rounded: {
                    sm: "rounded-xl",
                    md: "rounded-2xl",
                    lg: "rounded-[32px]",
                    xl: "rounded-[35px]",
                },
                shadow: {
                    none: "shadow-none border-slate-100",
                    sm: "shadow-sm border-slate-100",
                    md: "shadow-md border-slate-100",
                    lg: "shadow-lg border-slate-100",
                },
                hover: {
                    none: "",
                    lift: "hover:shadow-xl hover:-translate-y-1 cursor-pointer",
                    scale: "hover:scale-[1.02] cursor-pointer",
                    glow: "hover:shadow-lg hover:shadow-brand-gold/20 hover:border-brand-gold/30 cursor-pointer",
                },
            },
            defaultVariants: {
                padding: "md",
                rounded: "lg",
                shadow: "sm",
                hover: "none",
            }
        }
    );

    export let padding: VariantProps<typeof cardClass>['padding'] = 'md';
    export let rounded: VariantProps<typeof cardClass>['rounded'] = 'lg';
    export let shadow: VariantProps<typeof cardClass>['shadow'] = 'md';
    export let hover: VariantProps<typeof cardClass>['hover'] = 'none';
    let className = "";
    export { className as class };
</script>

<div class={cardClass({ padding, rounded, shadow, hover, class: className })}>
    <slot />
</div>
