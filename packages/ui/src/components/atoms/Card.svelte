<script lang="ts">
    import { cva, type VariantProps } from 'class-variance-authority';

    const cardClass = cva(
        "bg-card text-card-foreground border border-border transition-colors",
        {
            variants: {
                padding: {
                    none: "p-0",
                    sm: "p-4",
                    md: "p-6",
                    lg: "p-8",
                },
                rounded: {
                    sm: "rounded-md",
                    md: "rounded-lg",
                    lg: "rounded-xl",
                    xl: "rounded-xl",
                },
                shadow: {
                    none: "shadow-none",
                    sm: "shadow-none",
                    md: "shadow-none",
                    lg: "shadow-none",
                },
                hover: {
                    none: "",
                    lift: "hover:bg-muted/40 cursor-pointer",
                    scale: "hover:bg-muted/40 cursor-pointer",
                    glow: "hover:bg-muted/40 cursor-pointer",
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
