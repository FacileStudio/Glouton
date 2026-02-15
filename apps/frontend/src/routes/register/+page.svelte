<script lang="ts">
  import authStore from '$lib/auth-store';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { fly, fade } from 'svelte/transition';
  import type { User } from '@repo/types';
  import { trpc } from '$lib/trpc';
  import { getTrpcErrorMessage } from '$lib/utils/trpc-error';
  import 'iconify-icon';

  let step = 1;
  let email = '',
    password = '',
    confirmPassword = '',
    firstName = '',
    lastName = '';
  let loading = false;
  let error = '';

  /**
   * nextStep
   */
  const nextStep = () => {
    /**
     * if
     */
    if (step === 1 && firstName && lastName) step = 2;
    else if (step === 2 && email) step = 3;
  };

  /**
   * prevStep
   */
  const prevStep = () => (step > 1 ? step-- : goto(resolve('/login')));

  /**
   * handleRegister
   */
  async function handleRegister() {
    /**
     * if
     */
    if (password !== confirmPassword) {
      error = 'Passwords do not match.';
      return;
    }
    loading = true;
    error = '';
    try {
      const result = await trpc.auth.register.mutate({
        email,
        password,
        confirmPassword,
        firstName,
        lastName,
      });
      authStore.setAuth({ token: result.token }, result.user as User);
      await goto(resolve('/app/leads'));
    } catch (err: any) {
      console.error('Registration error:', err);
      error = getTrpcErrorMessage(err);
      loading = false;
    }
  }

  /**
   * focusInput
   */
  function focusInput(node: HTMLElement) {
    /**
     * setTimeout
     */
    setTimeout(() => node.focus(), 100);
  }

  const inputClass =
    'text-3xl md:text-5xl font-bold bg-transparent border-b-4 border-neutral-300 outline-none py-6 transition-all placeholder:text-neutral-300 focus:placeholder:text-neutral-200 w-full';
  const btnClass =
    'mt-16 px-12 py-6 bg-black text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-2xl shadow-black/10 disabled:opacity-30 disabled:cursor-not-allowed active:enabled:scale-95';
</script>

<main
  class="h-screen w-full text-black font-sans overflow-hidden flex flex-col selection:text-black"
  style="background-color: #FAF7F5;"
>
  <div class="fixed top-0 left-0 w-full h-1.5 bg-neutral-200 z-[100]">
    <div
      class="h-full transition-all duration-700 ease-in-out"
      style="width: {(step / 3) * 100}%; background-color: #FEC129;"
    ></div>
  </div>

  <nav class="p-8 flex justify-between items-center relative z-10" style="background-color: #FAF7F5;">
    <button
      on:click={prevStep}
      class="px-6 py-3 bg-neutral-100 border-2 border-black hover:bg-black hover:text-white transition-all rounded-xl flex items-center gap-3 text-sm font-black uppercase tracking-wide cursor-pointer"
    >
      <iconify-icon
        icon="solar:arrow-left-bold"
        width="18"
      ></iconify-icon>
      {step === 1 ? 'Back to Login' : 'Previous'}
    </button>
    <div class="flex items-center gap-3">
      <img src="/logo.png" alt="Glouton Logo" class="w-10 h-10 rounded-xl" />
      <div class="text-2xl font-black tracking-tight" style="color: #291334;">
        Glouton<span style="color: #FEC129;">.</span>
      </div>
    </div>
  </nav>

  <div class="flex-1 flex items-center justify-center px-6 relative">
    {#if step === 1}
      <form
        on:submit|preventDefault={nextStep}
        in:fly={{ x: 40, duration: 600 }}
        out:fly={{ x: -40, duration: 400 }}
        class="max-w-2xl w-full"
      >
        <span
          class="text-sm font-black uppercase tracking-widest text-neutral-500 mb-6 block"
          >01 — Identity</span
        >
        <h2
          class="text-6xl md:text-[120px] font-black tracking-tighter leading-[0.85] mb-12"
          style="color: #291334;"
        >
          Personal <br /> <span style="color: #FEC129;">Information.</span>
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <input
            bind:value={firstName}
            placeholder="First Name"
            class="register-input {inputClass}"
            required
            use:focusInput
          />
          <input bind:value={lastName} placeholder="Last Name" class="register-input {inputClass}" required />
        </div>
        <button type="submit" disabled={!firstName || !lastName} class="register-btn {btnClass}" style="border: 2px solid #291334;">
          Continue
        </button>
      </form>
    {:else if step === 2}
      <form
        on:submit|preventDefault={nextStep}
        in:fly={{ x: 40, duration: 600 }}
        out:fly={{ x: -40, duration: 400 }}
        class="max-w-2xl w-full"
      >
        <span
          class="text-sm font-black uppercase tracking-widest text-neutral-500 mb-6 block"
          >Email</span
        >
        <h2
          class="text-6xl md:text-[120px] font-black tracking-tighter leading-[0.85] mb-12"
          style="color: #291334;"
        >
          Email <br /> <span style="color: #FEC129;">Address.</span>
        </h2>
        <input
          type="email"
          bind:value={email}
          placeholder="name@company.com"
          class="register-input {inputClass}"
          required
          use:focusInput
        />
        <button type="submit" disabled={!email} class="register-btn {btnClass}" style="border: 2px solid #291334;"> Continue </button>
      </form>
    {:else if step === 3}
      <form
        on:submit|preventDefault={handleRegister}
        in:fly={{ x: 40, duration: 600 }}
        out:fly={{ x: -40, duration: 400 }}
        class="max-w-2xl w-full"
      >
        <span
          class="text-sm font-black uppercase tracking-widest text-neutral-500 mb-6 block"
          >03 — Security</span
        >
        <h2
          class="text-6xl md:text-[120px] font-black tracking-tighter leading-[0.85] mb-12"
          style="color: #291334;"
        >
          Secure <br /> <span style="color: #FEC129;">Password.</span>
        </h2>
        <div class="space-y-8">
          <input
            type="password"
            bind:value={password}
            placeholder="Password"
            class="register-input {inputClass}"
            required
            use:focusInput
          />
          <input
            type="password"
            bind:value={confirmPassword}
            placeholder="Confirm Password"
            class="register-input {inputClass}"
            required
          />
        </div>

        {#if error}
          <div
            class="mt-6 flex items-center gap-2 font-black uppercase text-[10px] tracking-widest bg-black p-4 rounded-xl"
            style="color: #FEC129;"
            in:fade
          >
            <iconify-icon icon="solar:danger-bold" width="16"></iconify-icon>
            {error}
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading || !password || !confirmPassword}
          class="register-btn {btnClass} w-full md:w-auto flex items-center justify-center gap-4"
          style="border: 2px solid #291334;"
        >
          {#if loading}
            <iconify-icon icon="svg-spinners:18-dots-revolve" width="24"></iconify-icon>
            Processing...
          {:else}
            Create Account
          {/if}
        </button>
      </form>
    {/if}
  </div>

  <div
    class="fixed bottom-0 right-0 p-12 pointer-events-none opacity-[0.03] select-none hidden md:block"
  >
    <div class="text-[25vh] font-black uppercase tracking-tighter leading-none translate-y-1/3">
      JOIN.
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
  .register-input:focus {
    border-color: #FEC129;
  }
  .register-btn:hover:enabled {
    background-color: #FEC129;
    color: black;
  }
</style>
