<script lang="ts">
    import { cva, type VariantProps } from 'class-variance-authority';
    import 'iconify-icon';

    const spinnerClass = cva(
        "inline-flex items-center justify-center",
        {
            variants: {
                size: {
                    sm: "",
                    md: "",
                    lg: "",
                    xl: "",
                },
                color: {
                    primary: "text-brand-purple",
                    accent: "text-brand-gold",
                    white: "text-white",
                    slate: "text-slate-600",
                }
            },
            defaultVariants: {
                size: "md",
                color: "primary",
            }
        }
    );

    export let size: VariantProps<typeof spinnerClass>['size'] = 'md';
    export let color: VariantProps<typeof spinnerClass>['color'] = 'primary';
    let className = "";
    export { className as class };

    const sizeMap = {
        sm: '16',
        md: '24',
        lg: '40',
        xl: '64'
    };

    $: iconSize = sizeMap[size || 'md'];
</script>

<span class={spinnerClass({ size, color, class: className })} role="status">
    <iconify-icon icon="svg-spinners:blocks-shuffle-3" width={iconSize}></iconify-icon>
    <span class="sr-only">Loading...</span>
</span>
