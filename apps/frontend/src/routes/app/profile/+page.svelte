<script lang="ts">
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import { onMount } from 'svelte';
  import { fade, scale, fly } from 'svelte/transition';
  import { uploadFileSimple } from '@repo/storage-client';
  import { toast } from '@repo/utils';
  import 'iconify-icon';

  interface UserData {
    firstName?: string;
    lastName?: string;
    email: string;
    createdAt: Date;
    role: string;
    avatar?: { url: string };
    coverImage?: { url: string };
  }

  let loading = true;
  let actionLoading: 'avatar' | 'cover' | 'removeAvatar' | 'removeCover' | '' = '';
  let user: UserData | null = null;
  let isPremiumUser = false;

  let avatarInput: HTMLInputElement;
  let coverInput: HTMLInputElement;

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

  async function handleFileUpload(event: Event, type: 'avatar' | 'cover') {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    actionLoading = type;
    try {
      const { uploadUrl, publicUrl, fileKey } = await trpc.media.getUploadUrl.mutate({
        fileName: file.name,
        fileType: file.type,
      });
      await uploadFileSimple(file, uploadUrl);
      if (type === 'avatar') {
        await trpc.media.updateAvatar.mutate({ url: publicUrl, key: fileKey, size: file.size });
      } else {
        await trpc.media.updateCover.mutate({ url: publicUrl, key: fileKey, size: file.size });
      }
      await loadData();
      toast.push(`${type === 'avatar' ? 'Identité' : 'Territoire'} mis à jour !`, 'success');
    } catch {
      toast.push('Échec de l\'aspiration. Réessayez.', 'error');
    } finally {
      actionLoading = '';
      target.value = '';
    }
  }

  async function handleRemoveMedia(type: 'avatar' | 'cover') {
    if (!confirm(`Supprimer cette image du festin ?`)) return;
    actionLoading = type === 'avatar' ? 'removeAvatar' : 'removeCover';
    try {
      if (type === 'avatar') await trpc.media.removeAvatar.mutate();
      else await trpc.media.removeCover.mutate();
      await loadData();
      toast.push('Média dévoré (supprimé)', 'success');
    } catch {
      toast.push('Erreur lors de la suppression', 'error');
    } finally {
      actionLoading = '';
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
    <section class="relative h-[40vh] min-h-[350px] w-full bg-black group overflow-hidden">
      {#if user.coverImage?.url && actionLoading !== 'cover'}
        <img
          src={user.coverImage.url}
          alt="Territoire"
          class="w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-110 grayscale hover:grayscale-0 transition-all"
          in:fade
        />
      {:else if actionLoading === 'cover' || actionLoading === 'removeCover'}
        <div class="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <iconify-icon icon="svg-spinners:bars-scale-middle" width="40" class="text-yellow-400"></iconify-icon>
        </div>
      {:else}
        <div class="absolute inset-0 flex items-center justify-center bg-neutral-100">
           <span class="text-[10px] font-black uppercase tracking-[0.5em] text-neutral-300">Aucun territoire défini</span>
        </div>
      {/if}

      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 z-20 backdrop-blur-sm">
        <button
          on:click={() => coverInput.click()}
          class="bg-yellow-400 text-black px-8 py-3 rounded-full font-black uppercase text-xs tracking-widest hover:scale-105 transition shadow-2xl flex items-center gap-2"
        >
          <iconify-icon icon="solar:map-arrow-square-bold" width="18"></iconify-icon>
          Changer de bannière
        </button>
        {#if user.coverImage}
          <button
            on:click={() => handleRemoveMedia('cover')}
            class="bg-white text-red-600 p-3 rounded-full hover:bg-red-600 hover:text-white transition shadow-2xl"
          >
            <iconify-icon icon="solar:trash-bold-duotone" width="22"></iconify-icon>
          </button>
        {/if}
      </div>
      <input type="file" bind:this={coverInput} on:change={(e) => handleFileUpload(e, 'cover')} class="hidden" accept="image/*" />
    </section>

    <div class="max-w-7xl mx-auto px-6">
      <div class="relative -mt-32 flex flex-col md:flex-row items-end gap-12 pb-12 border-b-2 border-neutral-100">
        
        <aside class="relative z-30 flex flex-col items-center md:items-start">
          <div class="relative group">
            <div class="w-64 h-64 rounded-[60px] border-[12px] border-white bg-black overflow-hidden shadow-2xl relative transition-all duration-700 group-hover:rounded-[30px] group-hover:rotate-2">
              {#if user.avatar?.url && actionLoading !== 'avatar'}
                <img src={user.avatar.url} alt="L'Ogre" class="w-full h-full object-cover" in:scale />
              {:else if actionLoading === 'avatar' || actionLoading === 'removeAvatar'}
                <div class="w-full h-full flex items-center justify-center bg-neutral-900">
                  <iconify-icon icon="svg-spinners:90-ring-with-bg" width="40" class="text-yellow-400"></iconify-icon>
                </div>
              {:else}
                <div class="w-full h-full flex items-center justify-center text-yellow-400 bg-neutral-900">
                  <iconify-icon icon="solar:ghost-bold" width="100"></iconify-icon>
                </div>
              {/if}
            </div>

            <button
              on:click={() => avatarInput.click()}
              class="absolute -bottom-2 -right-2 bg-yellow-400 text-black w-16 h-16 rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition active:scale-90 border-[6px] border-white z-40"
              disabled={actionLoading !== ''}
            >
              <iconify-icon icon="solar:camera-bold" width="24"></iconify-icon>
            </button>
            <input type="file" bind:this={avatarInput} on:change={(e) => handleFileUpload(e, 'avatar')} class="hidden" accept="image/*" />
          </div>
        </aside>

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
