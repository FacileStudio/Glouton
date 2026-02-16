<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { fly, fade } from 'svelte/transition';
  import { trpc } from '$lib/trpc';
  import authStore from '$lib/auth-store';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import 'iconify-icon';

  let loading = false;
  let error = '';
  let email = '';
  let password = '';

  async function handleLogin() {
    loading = true;
    error = '';
    try {
      const result = await trpc.auth.login.mutate({ email, password });
      authStore.setAuth({ token: result.token }, result.user);
      await goto(resolve('/app/leads'));
    } catch (err: any) {
      console.error('Login error:', err);
      error = getTrpcErrorMessage(err);
      loading = false;
    }
  }

  function focusInput(node: HTMLElement) {
    setTimeout(() => node.focus(), 100);
  }

  const inputClass =
    'text-2xl md:text-4xl font-bold bg-transparent border-b-4 border-neutral-300 outline-none py-4 transition-all placeholder:text-neutral-300 focus:placeholder:text-neutral-200 w-full';
  const btnClass =
    'px-12 py-5 bg-black text-white font-black uppercase tracking-widest rounded-2xl disabled:opacity-30 transition-all active:enabled:scale-95 shadow-xl shadow-black/5 flex items-center justify-center gap-3';
</script>

<main
  class="h-screen w-full text-black font-sans overflow-hidden flex flex-col selection:text-black"
  style="background-color: #FAF7F5; selection-background-color: #FEC129;"
>
  <nav class="p-8 flex justify-between items-center relative z-10" style="background-color: #FAF7F5;">
    <a
      href={resolve('/')}
      class="px-6 py-3 bg-neutral-100 border-2 border-black hover:bg-black hover:text-white transition-all rounded-xl flex items-center gap-3 text-sm font-black uppercase tracking-wide"
    >
      <iconify-icon
        icon="solar:arrow-left-bold"
        width="18"
      ></iconify-icon>
      Home
    </a>
    <div class="flex items-center gap-3">
      <img src="/logo.png" alt="Glouton Logo" class="w-10 h-10 rounded-xl" />
      <div class="text-2xl font-black tracking-tight" style="color: #291334;">
        Glouton<span style="color: #FEC129;">.</span>
      </div>
    </div>
  </nav>

  <div class="flex-1 flex items-center justify-center px-6 relative">
    <form
      on:submit|preventDefault={handleLogin}
      in:fly={{ y: 20, duration: 600 }}
      class="max-w-xl w-full"
    >
      <span
        class="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-400 mb-4 block underline underline-offset-8 decoration-2"
        style="text-decoration-color: #FEC129;"
        >Access Portal</span
      >

      <h2 class="text-6xl md:text-8xl font-black tracking-tighter leading-none mb-12" style="color: #291334;">
        Welcome <br /> <span style="color: #FEC129;">Back.</span>
      </h2>

      <div class="space-y-8">
        <input
          type="email"
          bind:value={email}
          placeholder="Email Address"
          class="login-input {inputClass}"
          required
          use:focusInput
        />
        <input
          type="password"
          bind:value={password}
          placeholder="Password"
          class="login-input {inputClass}"
          required
        />
      </div>

      {#if error}
        <div class="mt-6 p-4 bg-black rounded-xl flex items-center gap-3" style="color: #FEC129;" in:fade>
          <iconify-icon icon="solar:danger-triangle-bold" width="20"></iconify-icon>
          <span class="text-[10px] font-black uppercase tracking-widest">{error}</span>
        </div>
      {/if}

      <div class="flex flex-col md:flex-row items-center gap-10 mt-12">
        <button type="submit" disabled={loading || !email || !password} class="login-btn {btnClass}" style="border: 2px solid #291334;">
          {#if loading}
            <iconify-icon icon="svg-spinners:18-dots-revolve" width="24"></iconify-icon>
            Verifying...
          {:else}
            <iconify-icon icon="solar:login-3-bold" width="22"></iconify-icon>
            Sign In
          {/if}
        </button>

        <a
          href={resolve('/register')}
          class="login-link text-xs font-black uppercase tracking-[0.2em] transition-all"
        >
          Create Account
        </a>
      </div>
    </form>
  </div>

  <div class="fixed bottom-0 right-0 p-12 pointer-events-none overflow-hidden hidden md:block">
    <div
      class="text-[20vh] font-black uppercase tracking-tighter leading-none opacity-[0.03] select-none translate-y-1/4"
    >
      Login.
    </div>
  </div>
</main>

<style>
  :global(body) {
    overflow: hidden;
    background-color: #FAF7F5;
  }
  input::placeholder {
    opacity: 1;
  }
  .login-input:focus {
    border-color: #FEC129;
  }
  .login-btn:hover:enabled {
    background-color: #FEC129;
    color: black;
  }
  .login-link:hover {
    color: #FEC129;
  }
</style>
