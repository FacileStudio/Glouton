<script lang="ts">
    export let value: string | number = "";
    export let placeholder = "";
    export let type: "text" | "email" | "password" | "number" | "tel" | "url" = "text";
    export let error = false;
    export let id = "";
    export let name = "";

    let className = "";
    export { className as class };
</script>

<input
    {id}
    {name}
    {type}
    {placeholder}
    bind:value
    class="flex h-9 w-full rounded-lg border bg-background px-3 py-1 text-sm text-foreground shadow-none transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50
    {error ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20' : 'border-input hover:bg-muted/30'}
    {className}"
    {...$$restProps}
    on:input
    on:blur
    on:keydown
/>
