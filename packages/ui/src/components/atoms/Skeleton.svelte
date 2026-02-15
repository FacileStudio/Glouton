<script lang="ts">
  export let width: string = '100%';
  export let height: string = '1rem';
  export let rounded: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' = 'md';
  export let className: string = '';

  const roundedClasses = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  };
</script>

<div
  class="animate-pulse bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200 bg-[length:200%_100%] {roundedClasses[rounded]} {className}"
  style="width: {width}; height: {height}; animation: shimmer 1.5s ease-in-out infinite;"
></div>

<style>
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  .animate-pulse {
    animation: shimmer 1.5s ease-in-out infinite;
  }
</style>
