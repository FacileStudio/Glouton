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
    class="w-full px-5 py-3 rounded-2xl bg-slate-50/50 border-2 transition-all duration-200 font-medium text-brand-purple placeholder:text-slate-400 outline-none
    {error ? 'border-danger/30 focus:border-danger focus:bg-danger-light' : 'border-slate-100 focus:border-brand-gold focus:bg-white hover:bg-white'}
    {className}"
    {...$$restProps}
    on:input
    on:blur
    on:keydown
/>
