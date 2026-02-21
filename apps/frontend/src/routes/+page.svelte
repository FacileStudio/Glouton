<script lang="ts">
  import { resolve } from '$app/paths';
  import { trpc } from '$lib/trpc';
  import authStore from '$lib/auth-store';
  import { logger } from '@repo/logger';
  import 'iconify-icon';

  let email = '',
    firstName = '',
    lastName = '',
    loading = false,
    message = '';

  /**
   * scrollTo
   */
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    /**
     * if
     */
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  /**
   * handleSubmit
   */
  async function handleSubmit() {
    loading = true;
    try {
      message = 'Bienvenue dans la meute. Le buffet est ouvert !';
      email = firstName = lastName = '';
    } catch (error: unknown) {
      message = 'Erreur. Glouton a eu une indigestion.';
    }
    loading = false;
  }
</script>

<div class="min-h-screen text-black font-sans selection:text-black" style="background-color: #FAF7F5; selection-background-color: #FEC129;">

  <nav class="fixed top-0 w-full flex items-center justify-between px-8 py-6 z-[100] backdrop-blur-md border-b border-neutral-100" style="background-color: rgba(250, 247, 245, 0.8);">
    <div class="text-2xl font-black tracking-tight flex items-center gap-3" style="color: #291334;">
      <img src="/logo.png" alt="Glouton Logo" class="w-10 h-10 rounded-xl" />
      Glouton<span style="color: #FEC129;">.</span>
    </div>

    <div class="flex items-center gap-6">
      {#if !$authStore.session}
        <a href={resolve('/login')} class="text-sm font-black tracking-wide hover:transition flex items-center gap-2" style="color: #291334;" onmouseenter={(e) => e.currentTarget.style.color = '#FEC129'} onmouseleave={(e) => e.currentTarget.style.color = '#291334'}>
          <iconify-icon icon="solar:login-3-bold-duotone" width="18"></iconify-icon>
          Login
        </a>
        <a href={resolve('/register')} class="nav-btn group flex items-center gap-2 text-sm font-black tracking-wide bg-black text-white px-6 py-3 rounded-xl transition-all active:scale-95" style="border: 2px solid #291334;">
          <iconify-icon icon="mdi:account-plus" width="18"></iconify-icon>
          Commencer gratuitement
        </a>
      {:else}
        <a href={resolve('/app/leads')} class="nav-btn flex items-center gap-2 font-black text-sm tracking-wide bg-black text-white px-6 py-3 rounded-xl transition-all" style="border: 2px solid #291334;">
          <iconify-icon icon="solar:widget-5-bold-duotone" width="18"></iconify-icon>
          Dashboard
        </a>
      {/if}
    </div>
  </nav>

  <section class="relative pt-48 pb-24 px-6 flex flex-col items-center text-center">
    <span class="inline-block px-4 py-1.5 mb-8 text-[10px] font-black uppercase tracking-[0.2em] rounded-full shadow-lg" style="background-color: #FEC129; box-shadow: 0 10px 25px rgba(254, 193, 41, 0.2);">
      Mode Aspiration : Activé ⚡
    </span>
    <h1 class="text-6xl md:text-9xl font-black tracking-tighter leading-[0.85] mb-10 text-balance" style="color: #291334;">
      Ne laissez plus aucune <br />
      <span style="color: #FEC129;">miette</span> de business.
    </h1>
    <p class="max-w-2xl text-lg md:text-2xl text-neutral-500 font-medium leading-relaxed mb-12">
      Le moteur d'acquisition hybride conçu pour dévorer le web, sniffer les opportunités
      et extraire la substance commerciale brute.
    </p>

    <div class="flex flex-col md:flex-row gap-4">
      <a href={resolve('/register')} class="cta-btn group px-10 py-5 bg-black text-white font-black tracking-wide rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3 shadow-2xl shadow-black/10" style="border: 2px solid #291334;">
        <iconify-icon icon="solar:rocket-2-bold-duotone" width="22"></iconify-icon>
        Démarrer maintenant
      </a>
      <button onclick={() => scrollTo('features')} class="secondary-btn group px-10 py-5 text-black border-2 font-black tracking-wide rounded-2xl transition flex items-center justify-center gap-3 cursor-pointer" style="background-color: #EFEAE6; border-color: #291334;">
        <iconify-icon icon="solar:list-check-bold-duotone" width="22"></iconify-icon>
        Voir le menu
      </button>
    </div>
  </section>

  <section id="features" class="py-32 px-6 scroll-mt-24" style="background-color: #FAF7F5;">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-20">
        <h2 class="text-5xl md:text-7xl font-black tracking-tighter mb-6" style="color: #291334;">
          Votre moteur de <span style="color: #FEC129;">prospection</span> automatisé
        </h2>
        <p class="text-xl text-neutral-500 font-medium max-w-3xl mx-auto">
          Glouton combine crawling intelligent, détection d'opportunités multi-plateformes et géolocalisation pour transformer votre prospection.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        {#each [
          { icon: 'solar:planet-bold-duotone', title: 'Crawling Web Automatisé', desc: 'Lancez des hunts pour crawler des milliers de domaines. Collectez automatiquement leads, emails et détectez les technologies utilisées.' },
          { icon: 'solar:case-round-bold-duotone', title: 'Opportunités Multi-Plateformes', desc: 'Scrapez en temps réel 16+ plateformes freelance (Malt, Codeur, Upwork...) avec filtrage par budget, catégorie et localisation.' },
          { icon: 'solar:map-point-wave-bold-duotone', title: 'Géolocalisation Intelligente', desc: 'Visualisez vos leads sur carte interactive, ciblez par zone géographique et optimisez votre prospection locale.' }
        ] as feature (feature.title)}
          <div class="feature-card p-10 rounded-2xl shadow-lg transition-all group" style="background-color: #EFEAE6;">
            <div class="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-all duration-500" style="color: #FEC129;">
              <iconify-icon icon={feature.icon} width="28"></iconify-icon>
            </div>
            <h3 class="text-xl font-black mb-4 tracking-tight" style="color: #291334;">{feature.title}</h3>
            <p class="text-neutral-500 leading-relaxed font-medium">{feature.desc}</p>
          </div>
        {/each}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="p-12 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-6" style="color: #FEC129;">
            <iconify-icon icon="solar:chart-bold-duotone" width="32"></iconify-icon>
          </div>
          <h3 class="text-2xl font-black mb-4 tracking-tight" style="color: #291334;">Scoring Intelligent des Leads</h3>
          <p class="text-neutral-500 leading-relaxed font-medium mb-6">
            Chaque lead est automatiquement qualifié (HOT/WARM/COLD) selon sa qualité, technologies détectées et potentiel commercial.
          </p>
          <ul class="space-y-3 text-neutral-600 font-medium">
            <li class="flex items-start gap-3">
              <iconify-icon icon="solar:check-circle-bold-duotone" width="20" style="color: #FEC129;" class="mt-0.5 flex-shrink-0"></iconify-icon>
              <span>Détection automatique email, téléphone, adresse</span>
            </li>
            <li class="flex items-start gap-3">
              <iconify-icon icon="solar:check-circle-bold-duotone" width="20" style="color: #FEC129;" class="mt-0.5 flex-shrink-0"></iconify-icon>
              <span>Analyse des technologies (WordPress, Shopify, etc.)</span>
            </li>
            <li class="flex items-start gap-3">
              <iconify-icon icon="solar:check-circle-bold-duotone" width="20" style="color: #FEC129;" class="mt-0.5 flex-shrink-0"></iconify-icon>
              <span>Score de qualité et priorité automatique</span>
            </li>
          </ul>
        </div>

        <div class="p-12 rounded-2xl shadow-lg" style="background-color: #EFEAE6;">
          <div class="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-6" style="color: #FEC129;">
            <iconify-icon icon="solar:bolt-bold-duotone" width="32"></iconify-icon>
          </div>
          <h3 class="text-2xl font-black mb-4 tracking-tight" style="color: #291334;">Mises à Jour en Temps Réel</h3>
          <p class="text-neutral-500 leading-relaxed font-medium mb-6">
            WebSocket intégré pour suivre vos hunts en direct et recevoir instantanément les nouvelles opportunités des plateformes.
          </p>
          <ul class="space-y-3 text-neutral-600 font-medium">
            <li class="flex items-start gap-3">
              <iconify-icon icon="solar:check-circle-bold-duotone" width="20" style="color: #FEC129;" class="mt-0.5 flex-shrink-0"></iconify-icon>
              <span>Progression des crawls en temps réel</span>
            </li>
            <li class="flex items-start gap-3">
              <iconify-icon icon="solar:check-circle-bold-duotone" width="20" style="color: #FEC129;" class="mt-0.5 flex-shrink-0"></iconify-icon>
              <span>Notifications instantanées nouvelles opportunités</span>
            </li>
            <li class="flex items-start gap-3">
              <iconify-icon icon="solar:check-circle-bold-duotone" width="20" style="color: #FEC129;" class="mt-0.5 flex-shrink-0"></iconify-icon>
              <span>Dashboard synchronisé multi-appareils</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>



  <footer class="pt-24 pb-12 px-10" style="background-color: #FAF7F5;">
    <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start border-t border-neutral-100 pt-16 gap-16">
      <div class="max-w-xs">
        <div class="text-2xl font-black tracking-tight mb-6 flex items-center gap-3" style="color: #291334;">
           <img src="/logo.png" alt="Glouton Logo" class="w-8 h-8 rounded-xl" />
           Glouton<span style="color: #FEC129;">.</span>
        </div>
        <p class="text-sm text-neutral-400 font-bold leading-relaxed">
          Le prédateur alpha de votre prospection.
          Ne se nourrit que de données fraîches.
        </p>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-3 gap-16 md:gap-32">
        <div class="flex flex-col gap-5">
          <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Produit</span>
          <button onclick={() => scrollTo('features')} class="footer-link text-left text-sm font-black transition" style="color: #291334;">Le Menu</button>
          <a href={resolve('/pricing')} class="footer-link text-sm font-black transition" style="color: #291334;">Tarifs</a>
        </div>
        <div class="flex flex-col gap-5">
          <span class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Social</span>
          <a href="https://github.com" target="_blank" class="footer-link text-sm font-black transition" style="color: #291334;">GitHub</a>
        </div>
      </div>
    </div>
    <div class="mt-24 text-center text-[10px] font-black uppercase tracking-[0.4em] text-neutral-300">
      &copy; {new Date().getFullYear()} GLOUTON ENGINE<span style="color: #FEC129;">.</span>
    </div>
  </footer>
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
    overflow-y: auto !important;
  }
  :global(body) {
    overflow: auto !important;
    height: auto !important;
  }

  .nav-btn:hover {
    background-color: #FEC129 !important;
    color: black !important;
  }

  .cta-btn:hover {
    background-color: #FEC129 !important;
    color: black !important;
  }

  .secondary-btn:hover {
    background-color: #E5DED8 !important;
  }

  .feature-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
  }

  .feature-card:hover .w-14 {
    background-color: #FEC129 !important;
    color: black !important;
  }



  .submit-btn:hover:not(:disabled) {
    background-color: white !important;
  }

  .footer-link:hover {
    color: #FEC129 !important;
  }
</style>
