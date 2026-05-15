<script lang="ts">
    import { cva, type VariantProps } from 'class-variance-authority';
    import type { Snippet } from 'svelte';

    const buttonClass = cva(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-transparent bg-clip-padding px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        {
            variants: {
                intent: {
                    primary: "bg-primary text-primary-foreground hover:bg-primary/85",
                    secondary: "border-border bg-background text-foreground hover:bg-muted",
                    danger: "bg-destructive/10 text-destructive hover:bg-destructive/20",
                    ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                },
                size: {
                    sm: "h-8 px-2.5 text-xs",
                    md: "h-9 px-3 text-sm",
                    lg: "h-10 px-4 text-sm"
                }
            },
            defaultVariants: {
                intent: "primary",
                size: "md"
            }
        }
    );

    let {
        intent = 'primary',
        size = 'md',
        type = 'button',
        disabled = false,
        class: className = '',
        onclick,
        children,
        ...restProps
    }: {
        intent?: VariantProps<typeof buttonClass>['intent'];
        size?: VariantProps<typeof buttonClass>['size'];
        type?: "button" | "submit";
        disabled?: boolean;
        class?: string;
        onclick?: () => void;
        children?: Snippet;
        [key: string]: unknown;
    } = $props();
</script>

<button
    {type}
    {disabled}
    class={buttonClass({ intent, size, class: className })}
    {onclick}
    {...restProps}
>
    {@render children?.()}
</button>
