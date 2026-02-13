<script lang="ts">
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { onMount } from 'svelte';
  import { fade, scale, fly } from 'svelte/transition';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  interface UserData {
    firstName?: string;
    lastName?: string;
    email: string;
    createdAt: Date;
    role: string;
  }

  let loading = true;
  let user: UserData | null = null;
  let isPremiumUser = false;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    try {
      user = await trpc.user.me.query();
      const subscription = await trpc.stripe.getSubscription.query();
      isPremiumUser = subscription.isPremium;
    } catch {
      toast.push('Erreur de synchronisation avec le buffet', 'error');
    } finally {
      loading = false;
    }
  }
</script>

<main class="min-h-screen bg-white text-black pb-20 selection:bg-yellow-400 selection:text-black">
  {#if loading}
    <div class="flex flex-col items-center justify-center h-screen space-y-6" in:fade>
      <iconify-icon icon="solar:ghost-bold" width="64" class="animate-bounce text-yellow-400"></iconify-icon>
      <p class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-400 animate-pulse">
        Affutage des dents...
      </p>
    </div>
  {:else if user}
    <div class="max-w-7xl mx-auto px-6 pt-12">
      <div class="relative flex flex-col md:flex-row items-end gap-12 pb-12 border-b-2 border-neutral-100">
        <div class="flex-1 text-center md:text-left space-y-4 pb-4">
          <div class="flex flex-col md:flex-row md:items-center gap-4">
            <h1 class="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">
              {user.firstName || 'Chasseur'} {user.lastName || 'Anonyme'}
            </h1>
            {#if isPremiumUser}
               <div class="inline-flex bg-yellow-400 text-black text-[10px] px-4 py-2 rounded-full font-black uppercase tracking-[0.2em] animate-pulse">
                 Ogre Élite
               </div>
            {/if}
          </div>
          <p class="text-neutral-400 font-bold tracking-tight text-xl">{user.email}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-12 gap-8 mt-12">
        
        <div class="md:col-span-4 space-y-6">
          <div class="p-8 bg-neutral-50 rounded-[40px] border-2 border-neutral-100">
            <p class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400 mb-6">Appétit Actuel</p>
            <div class="space-y-4">
                <div class="flex justify-between items-end">
                    <span class="font-black uppercase text-sm">Niveau de gavage</span>
                    <span class="font-black text-2xl">{isPremiumUser ? 'ILLIMITÉ' : '1000/jour'}</span>
                </div>
                <div class="w-full h-4 bg-neutral-200 rounded-full overflow-hidden">
                    <div class="h-full bg-black w-[65%]"></div>
                </div>
                <a
                    href={resolve('/app/premium')}
                    class="block w-full text-center py-5 mt-6 {isPremiumUser ? 'bg-white border-2 border-black' : 'bg-black text-white'} rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] transition"
                >
                    {isPremiumUser ? 'Gérer le Gavage' : 'Passer en Gavage Illimité'}
                </a>
            </div>
          </div>
        </div>

        <div class="md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="p-10 bg-white border-2 border-neutral-100 rounded-[40px] hover:border-yellow-400 transition-all group">
                <div class="flex items-center justify-between mb-8">
                    <span class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-300 group-hover:text-black">Traque Commencée</span>
                    <iconify-icon icon="solar:calendar-bold" width="24" class="text-neutral-200 group-hover:text-yellow-400"></iconify-icon>
                </div>
                <p class="text-4xl font-black uppercase tracking-tighter">
                    {new Date(user.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </p>
                <p class="text-xs font-bold uppercase text-neutral-400 mt-2">Membre de la meute</p>
            </div>

            <div class="p-10 bg-black text-white rounded-[40px] relative overflow-hidden group">
                <div class="relative z-10">
                    <span class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500">Statut de l'Ogre</span>
                    <p class="text-4xl font-black uppercase tracking-tighter text-yellow-400 mt-4">
                        {isPremiumUser ? 'INSATIABLE' : 'AFFAMÉ'}
                    </p>
                </div>
                <iconify-icon 
                    icon="solar:fire-bold" 
                    width="140" 
                    class="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-125 transition-transform duration-700 text-yellow-400"
                ></iconify-icon>
            </div>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    background-color: white;
    overflow-x: hidden;
  }
</style>
