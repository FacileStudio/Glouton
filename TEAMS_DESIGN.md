# Architecture Teams - Glouton

## Vue d'ensemble

Système de teams permettant la collaboration sur les leads, hunts, audits et outreach.
Architecture conçue pour minimiser les changements au code existant.

## 1. Schéma de base de données

### Nouvelles tables

```prisma
enum TeamRole {
  OWNER
  ADMIN
  MEMBER
}

model Team {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Text
  name        String   @db.Text
  description String?  @db.Text

  hunterApiKey       String?   @db.Text
  apolloApiKey       String?   @db.Text
  snovApiKey         String?   @db.Text
  hasdataApiKey      String?   @db.Text
  contactoutApiKey   String?   @db.Text
  googleMapsApiKey   String?   @db.Text
  smtpHost           String?   @db.Text
  smtpPort           Int?
  smtpSecure         Boolean?
  smtpUser           String?   @db.Text
  smtpPass           String?   @db.Text
  smtpFromName       String?   @db.Text
  smtpFromEmail      String?   @db.Text

  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime @default(now()) @updatedAt @db.Timestamptz(3)

  members     TeamMember[]
  leads       Lead[]
  huntSessions HuntSession[]
  auditSessions AuditSession[]
  emailOutreaches EmailOutreach[]

  @@index([name])
}

model TeamMember {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Text
  teamId    String   @db.Text
  userId    String   @db.Text
  role      TeamRole @default(MEMBER)
  joinedAt  DateTime @default(now()) @db.Timestamptz(3)

  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([teamId])
  @@index([userId])
  @@index([role])
}
```

### Modifications aux tables existantes

```prisma
model Lead {
  teamId String? @db.Text
  team   Team?   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
  @@index([teamId, status, createdAt])
}

model HuntSession {
  teamId String? @db.Text
  team   Team?   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
}

model AuditSession {
  teamId String? @db.Text
  team   Team?   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
}

model EmailOutreach {
  teamId String? @db.Text
  team   Team?   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@index([teamId])
}

model User {
  teamMembers TeamMember[]
}
```

## 2. Backend - Architecture

### 2.1 Context augmenté

Modifier le context tRPC pour inclure les teams:

```typescript
// packages/trpc/src/context.ts
export interface Context {
  user?: {
    id: string;
    role: UserRole;
    teams: Array<{
      id: string;
      role: TeamRole;
    }>;
  };
  activeTeamId?: string | null;
}
```

### 2.2 Nouveau module tRPC: `team`

```typescript
// packages/trpc/src/modules/team/router.ts
export const teamRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return await listUserTeams(ctx.user.id);
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string(), description: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      return await createTeam(input, ctx.user.id);
    }),

  update: protectedProcedure
    .input(z.object({ teamId: z.string(), name: z.string(), ... }))
    .mutation(async ({ input, ctx }) => {
      await checkTeamPermission(ctx.user.id, input.teamId, 'ADMIN');
      return await updateTeam(input);
    }),

  delete: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await checkTeamPermission(ctx.user.id, input.teamId, 'OWNER');
      return await deleteTeam(input.teamId);
    }),

  addMember: protectedProcedure
    .input(z.object({ teamId: z.string(), email: z.string(), role: z.enum(['ADMIN', 'MEMBER']) }))
    .mutation(async ({ input, ctx }) => {
      await checkTeamPermission(ctx.user.id, input.teamId, 'ADMIN');
      return await addTeamMember(input);
    }),

  removeMember: protectedProcedure
    .input(z.object({ teamId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await checkTeamPermission(ctx.user.id, input.teamId, 'ADMIN');
      return await removeTeamMember(input);
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({ teamId: z.string(), userId: z.string(), role: z.enum(['OWNER', 'ADMIN', 'MEMBER']) }))
    .mutation(async ({ input, ctx }) => {
      await checkTeamPermission(ctx.user.id, input.teamId, 'OWNER');
      return await updateTeamMemberRole(input);
    }),

  leave: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return await leaveTeam(input.teamId, ctx.user.id);
    }),
});
```

### 2.3 Modifications aux modules existants

#### Logique de scope (personal vs team)

```typescript
// packages/trpc/src/utils/scope.ts
export type Scope =
  | { type: 'personal'; userId: string }
  | { type: 'team'; teamId: string; userId: string };

export async function resolveScope(
  userId: string,
  teamId?: string | null
): Promise<Scope> {
  if (!teamId) {
    return { type: 'personal', userId };
  }

  const member = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } }
  });

  if (!member) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a team member' });
  }

  return { type: 'team', teamId, userId };
}

export function buildLeadFilter(scope: Scope) {
  if (scope.type === 'personal') {
    return { userId: scope.userId, teamId: null };
  }
  return { teamId: scope.teamId };
}
```

#### Modification du module `lead`

```typescript
// packages/trpc/src/modules/lead/router.ts
export const leadRouter = router({
  list: protectedProcedure
    .input(z.object({
      teamId: z.string().optional(),
      ...existingFilters
    }))
    .query(async ({ input, ctx }) => {
      const scope = await resolveScope(ctx.user.id, input.teamId);
      const filter = buildLeadFilter(scope);
      return await listLeads({ ...filter, ...input });
    }),

  startHunt: protectedProcedure
    .input(z.object({
      teamId: z.string().optional(),
      ...existingHuntInput
    }))
    .mutation(async ({ input, ctx }) => {
      const scope = await resolveScope(ctx.user.id, input.teamId);

      const apiKeys = scope.type === 'team'
        ? await getTeamApiKeys(scope.teamId)
        : await getUserApiKeys(ctx.user.id);

      return await startHunt({
        ...input,
        userId: ctx.user.id,
        teamId: scope.type === 'team' ? scope.teamId : null,
        apiKeys,
      });
    }),
});
```

### 2.4 Service de permissions

```typescript
// packages/trpc/src/services/team-permissions.ts
export async function checkTeamPermission(
  userId: string,
  teamId: string,
  requiredRole: TeamRole | TeamRole[]
): Promise<void> {
  const member = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } }
  });

  if (!member) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a team member' });
  }

  const roleHierarchy: Record<TeamRole, number> = {
    OWNER: 3,
    ADMIN: 2,
    MEMBER: 1,
  };

  const required = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const hasPermission = required.some(role =>
    roleHierarchy[member.role] >= roleHierarchy[role]
  );

  if (!hasPermission) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
  }
}

export async function canAccessLead(userId: string, leadId: string): Promise<boolean> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { userId: true, teamId: true }
  });

  if (!lead) return false;

  if (lead.userId === userId && !lead.teamId) return true;

  if (lead.teamId) {
    const member = await db.teamMember.findUnique({
      where: { teamId_userId: { teamId: lead.teamId, userId } }
    });
    return !!member;
  }

  return false;
}
```

## 3. Frontend - Architecture UI

### 3.1 Structure de navigation

```
/app
  /leads                    -> Personal leads
  /leads?team=:teamId       -> Team leads
  /hunts                    -> Personal hunts
  /hunts?team=:teamId       -> Team hunts
  /teams                    -> List teams
  /teams/:teamId            -> Team dashboard
  /teams/:teamId/settings   -> Team settings
  /teams/:teamId/members    -> Team members
```

### 3.2 Store Svelte pour le context team

```typescript
// apps/frontend/src/lib/stores/team-context.ts
import { writable } from 'svelte/store';

export type TeamContext = {
  type: 'personal';
} | {
  type: 'team';
  teamId: string;
  name: string;
  role: TeamRole;
};

function createTeamContextStore() {
  const { subscribe, set } = writable<TeamContext>({ type: 'personal' });

  return {
    subscribe,
    setPersonal: () => set({ type: 'personal' }),
    setTeam: (teamId: string, name: string, role: TeamRole) =>
      set({ type: 'team', teamId, name, role }),
  };
}

export const teamContext = createTeamContextStore();
```

### 3.3 Composant de switch de contexte

```svelte
<!-- apps/frontend/src/lib/components/TeamContextSwitcher.svelte -->
<script lang="ts">
  import { teamContext } from '$lib/stores/team-context';
  import { trpc } from '$lib/trpc';

  const teams = trpc.team.list.createQuery();

  function switchContext(context: TeamContext) {
    teamContext.set(context);
  }
</script>

<div class="context-switcher">
  <button
    class:active={$teamContext.type === 'personal'}
    on:click={() => switchContext({ type: 'personal' })}
  >
    Personal
  </button>

  {#if $teams.data}
    {#each $teams.data as team}
      <button
        class:active={$teamContext.type === 'team' && $teamContext.teamId === team.id}
        on:click={() => switchContext({
          type: 'team',
          teamId: team.id,
          name: team.name,
          role: team.role
        })}
      >
        {team.name}
      </button>
    {/each}
  {/if}

  <button on:click={() => goto('/teams/new')}>
    + New Team
  </button>
</div>
```

### 3.4 Modification des pages existantes

```svelte
<!-- apps/frontend/src/routes/leads/+page.svelte -->
<script lang="ts">
  import { teamContext } from '$lib/stores/team-context';
  import { trpc } from '$lib/trpc';

  $: leads = trpc.lead.list.createQuery({
    teamId: $teamContext.type === 'team' ? $teamContext.teamId : undefined
  });

  $: canStartHunt = $teamContext.type === 'personal' ||
    ($teamContext.type === 'team' && ['OWNER', 'ADMIN'].includes($teamContext.role));
</script>

<TeamContextSwitcher />

<h1>
  {#if $teamContext.type === 'personal'}
    My Leads
  {:else}
    {$teamContext.name} - Leads
  {/if}
</h1>

{#if canStartHunt}
  <button on:click={startHunt}>Start Hunt</button>
{/if}

<LeadTable leads={$leads.data} />
```

### 3.5 Page de gestion d'équipe

```svelte
<!-- apps/frontend/src/routes/teams/[teamId]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { trpc } from '$lib/trpc';

  $: teamId = $page.params.teamId;
  $: team = trpc.team.get.createQuery({ teamId });
  $: members = trpc.team.members.createQuery({ teamId });
  $: stats = trpc.team.stats.createQuery({ teamId });
</script>

<div class="team-dashboard">
  <h1>{$team.data?.name}</h1>

  <div class="stats-grid">
    <StatCard label="Total Leads" value={$stats.data?.totalLeads} />
    <StatCard label="Active Hunts" value={$stats.data?.activeHunts} />
    <StatCard label="Emails Sent" value={$stats.data?.emailsSent} />
    <StatCard label="Members" value={$members.data?.length} />
  </div>

  <section>
    <h2>Recent Activity</h2>
    <ActivityFeed teamId={teamId} />
  </section>

  <section>
    <h2>Team Members</h2>
    <MembersList teamId={teamId} members={$members.data} />
  </section>
</div>
```

## 4. Migration progressive

### Phase 1: Database + Backend Core
1. Ajouter tables Team et TeamMember
2. Ajouter teamId aux tables Lead, HuntSession, etc.
3. Créer module tRPC team
4. Créer services de permissions

### Phase 2: Backend Integration
1. Modifier lead.list pour supporter teamId
2. Modifier lead.startHunt pour supporter teamId
3. Modifier audit.start pour supporter teamId
4. Modifier email.send pour supporter teamId

### Phase 3: Frontend Core
1. Créer store teamContext
2. Créer composant TeamContextSwitcher
3. Créer page /teams

### Phase 4: Frontend Integration
1. Modifier page /leads pour supporter team context
2. Modifier page /hunts pour supporter team context
3. Ajouter team dashboard

### Phase 5: Polish
1. Team settings (API keys, SMTP)
2. Member management UI
3. Activity feed
4. Permissions UI

## 5. Avantages de cette approche

1. **Backward compatible**: teamId optionnel, tout fonctionne sans teams
2. **Minimal changes**: Ajout d'un paramètre teamId aux fonctions existantes
3. **Flexible**: Utilisateurs peuvent travailler en personal ou team mode
4. **Scalable**: Architecture prête pour multi-teams par user
5. **Clear separation**: Context explicite (personal vs team)
6. **Permissions**: Système de rôles granulaire (OWNER/ADMIN/MEMBER)

## 6. Points d'attention

### API Keys & SMTP
- Team peut avoir ses propres API keys
- Fallback sur les API keys du user si team n'en a pas
- Config SMTP au niveau team pour outreach unifié

### Quotas & Billing
- Considérer si les quotas sont par user ou par team
- Peut nécessiter un système de billing au niveau team

### Notifications
- WebSocket: broadcast to all team members
- Email notifications pour activité team

### Data isolation
- Garantir qu'un user ne peut pas accéder aux leads d'une team dont il n'est pas membre
- Tester les edge cases dans les permissions
