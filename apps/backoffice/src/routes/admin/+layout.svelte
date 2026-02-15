<script lang="ts">
    import authStore from '$lib/auth-store';
    import { page } from '$app/stores';
    import { resolve } from '$app/paths';
    import { Button } from '@repo/ui';
    import 'iconify-icon';

    const menuItems = [
        { name: 'Statistics', icon: 'solar:chart-bold', href: '/admin/statistics' },
        { name: 'Users', icon: 'solar:users-group-rounded-bold', href: '/admin/users' },
    ];
</script>

<div class="flex min-h-screen font-sans" style="background-color: #FAF7F5; color: #291334;">
    <aside class="w-72 flex flex-col sticky top-0 h-screen shadow-lg" style="background-color: #EFEAE6;">
        <div class="p-8">
            <div class="flex items-center gap-3 px-2">
                <img src="/logo.png" alt="Logo" class="w-10 h-10 rounded-xl" />
                <span class="text-xl font-black tracking-tighter" style="color: #291334;">Admin Panel</span>
            </div>
        </div>

        <nav class="flex-1 px-4 space-y-2">
            {#each menuItems as item (item.href)}
                <a
                    href={resolve(item.href)}
                    class="flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all
                    {$page.url.pathname === item.href
                        ? 'shadow-sm'
                        : ''}"
                    style="{$page.url.pathname === item.href
                        ? 'background-color: rgba(254, 193, 41, 0.15); color: #FEC129;'
                        : 'color: rgba(41, 19, 52, 0.4);'}"
                >
                    <iconify-icon icon="{item.icon.replace('-bold', '-bold-duotone')}" width="22"></iconify-icon>
                    {item.name}
                </a>
            {/each}
        </nav>

        <div class="p-6 mt-auto space-y-3">
            <div class="flex items-center gap-3 p-3 rounded-2xl shadow-lg" style="background-color: #FAF7F5;">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-black" style="background-color: rgba(254, 193, 41, 0.15); color: #FEC129;">
                    {$authStore.user?.firstName?.[0] || 'A'}
                </div>
                <div class="overflow-hidden flex-1">
                    <p class="text-sm font-black truncate" style="color: #291334;">{$authStore.user?.firstName}</p>
                    <p class="text-[10px] truncate" style="color: rgba(41, 19, 52, 0.5);">{$authStore.user?.email}</p>
                </div>
            </div>
            <Button intent="danger" onclick={() => authStore.logout()} class="w-full">
                <iconify-icon icon="solar:logout-2-bold-duotone" width="18"></iconify-icon>
                Logout
            </Button>
        </div>
    </aside>

    <main class="flex-1 overflow-y-auto">
        <slot />
    </main>
</div>
