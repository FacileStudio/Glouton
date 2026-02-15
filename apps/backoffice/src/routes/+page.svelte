<script lang="ts">
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import authStore from '$lib/auth-store';
    import { trpc } from '$lib/trpc'
    import { isAdmin, loginSchema, type SessionUser } from '@repo/auth-shared';
    import { Button, Input, Alert, Card, Spinner } from '@repo/ui';
    import { logger } from '@repo/logger';
    import 'iconify-icon';

    let email = '', password = '', error = '', isLoggingIn = false;

    /**
     * handleLogin
     */
    async function handleLogin() {
        isLoggingIn = true;
        error = '';

        const validation = loginSchema.safeParse({ email, password });
        /**
         * if
         */
        if (!validation.success) {
            error = validation.error.issues[0].message;
            isLoggingIn = false;
            return;
        }

        try {
            const { token, user } = await trpc.auth.login.mutate({ email, password });

            /**
             * if
             */
            if (!isAdmin(user as SessionUser)) {
                error = "Accès refusé : espace réservé aux administrateurs.";
                isLoggingIn = false;
                return;
            }

            authStore.setAuth(
                { token },
                user as SessionUser
            );
            /**
             * goto
             */
            goto(resolve('/admin/contacts'));
        } catch (err) {
            logger.error({ err }, 'Login error');
            error = err instanceof Error ? err.message : "Une erreur est survenue lors de la connexion";
            isLoggingIn = false;
        }
    }
</script>

<main class="min-h-screen flex items-center justify-center p-4" style="background-color: #FAF7F5;">
    {#if $authStore.loading}
        <Spinner size="xl" />
    {:else}
        <div class="max-w-md w-full rounded-2xl shadow-lg p-8" style="background-color: #EFEAE6;">
            <div class="text-center mb-8">
                <img src="/logo.png" alt="Logo" class="w-24 h-24 mx-auto mb-4" />
                <h1 class="text-3xl font-black tracking-tight" style="color: #291334;">Backoffice</h1>
                <p class="font-medium" style="color: #291334; opacity: 0.6;">Connectez-vous pour gérer le site</p>
            </div>

            <form on:submit|preventDefault={handleLogin} class="space-y-4">
                <Input
                    type="email"
                    bind:value={email}
                    placeholder="Email"
                    required
                />
                <Input
                    type="password"
                    bind:value={password}
                    placeholder="Mot de passe"
                    required
                />

                {#if error}
                    <Alert variant="danger">{error}</Alert>
                {/if}

                <Button
                    type="submit"
                    disabled={isLoggingIn}
                    class="w-full text-lg"
                >
                    {isLoggingIn ? 'Vérification...' : 'Connexion'}
                </Button>
            </form>
        </div>
    {/if}
</main>
