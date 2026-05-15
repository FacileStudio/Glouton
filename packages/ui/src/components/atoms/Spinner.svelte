<script lang="ts">
    import { cva, type VariantProps } from 'class-variance-authority';
    import 'iconify-icon';

    const spinnerClass = cva(
        "inline-flex items-center justify-center",
        {
            variants: {
                size: {
                    xs: "",
                    sm: "",
                    md: "",
                    lg: "",
                    xl: "",
                },
                color: {
                    primary: "text-foreground",
                    accent: "text-muted-foreground",
                    white: "text-white",
                    slate: "text-slate-600",
                    neutral: "text-muted-foreground",
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
        xs: '14',
        sm: '16',
        md: '24',
        lg: '40',
        xl: '64'
    };

    $: iconSize = sizeMap[size || 'md'];
</script>

<span class={spinnerClass({ size, color, class: className })} role="status" aria-label="Loading">
    <iconify-icon icon="svg-spinners:blocks-shuffle-3" width={iconSize}></iconify-icon>
</span>
