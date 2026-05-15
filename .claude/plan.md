# Planning Document: Persistent Leads Sorting & Filtering

**Task:** Améliorer le système de tris et de filtres dans la page des leads en les rendant persistants via URL et localStorage. L'URL contiendra les paramètres de tri/filtres/pagination pour permettre le partage et la persistance à travers la navigation.

**Created:** 2026-02-23

---

## 🎯 Objective Clarification

> What is the primary goal of this task? What problem does it solve?

**Answer:** [FILL IN - Confirm: Permettre aux utilisateurs de (1) partager des vues filtrées/triées avec leurs collègues via URL, (2) conserver leurs préférences de tri/filtres lors de la navigation, et (3) revenir à leur vue précédente après avoir quitté la page?]

---

## 🏗️ Architecture & Design Decisions

### Question 1: URL State vs localStorage Priority
> Context: Vous mentionnez à la fois URL et localStorage. Quelle est la hiérarchie?

**Options:**
- Option A: URL est la source de vérité, localStorage est seulement un fallback
- Option B: localStorage est prioritaire, URL peut override
- Option C: Fusionner les deux (URL override localStorage)
- Other: [User can describe alternative]

**Preferred Approach:** C

### Question 2: URL Format Strategy
> Context: Comment structurer les paramètres URL pour lisibilité et compatibilité?

**Options:**
- Option A: Query params simples (`?sort=name&order=asc&status=active`)
- Option B: Query params avec namespacing (`?filter.status=active&sort.field=name`)
- Option C: Encoded JSON object (`?state=eyJzb3J0Ijp7...}`)
- Other: [User can describe alternative]

**Preferred Approach:** [FILL IN]

**Rationale:** [FILL IN]

### Question 3: State Synchronization Timing
> Context: Quand mettre à jour l'URL?

**Options:**
- Option A: Immédiatement sur chaque changement (debounced)
- Option B: Après validation (ex: après avoir cliqué "Apply filters")
- Option C: Mix - certains changements immédiats (tri, pagination), d'autres validés (filtres complexes)
- Other: [User can describe alternative]

**Preferred Approach:** [FILL IN]

**Rationale:** [FILL IN]

### Question 4: Browser History Management
> Context: Chaque changement devrait-il créer une entrée dans l'historique du navigateur?

**Options:**
- Option A: Oui, utiliser `pushState` pour permettre back/forward
- Option B: Non, utiliser `replaceState` pour éviter de polluer l'historique
- Option C: Mix - pagination utilise `pushState`, filtres utilisent `replaceState`
- Other: [User can describe alternative]

**Preferred Approach:** [FILL IN]

**Rationale:** [FILL IN]

---

## 🛠️ Technical Stack & Dependencies

### Question: What technologies/libraries should be used?

**Required Technologies:**
- URL State Management: [FILL IN - SvelteKit searchParams natifs, ou library comme sveltekit-search-params?]
- localStorage Management: [FILL IN - vanilla JS, ou wrapper custom?]
- Debouncing: [FILL IN - custom, lodash, ou autre?]

**New Dependencies (if any):**
- [FILL IN - Nécessite-t-on une library pour la gestion d'état URL? Si oui, laquelle?]

---

## 📁 File Structure & Organization

### Question: Where should new files/modules be located?

**Current Lead Page Location:** [FILL IN - apps/frontend/src/routes/...?]

**Proposed Structure:**
```
apps/frontend/src/
├── routes/
│   └── leads/
│       ├── +page.svelte (page principale)
│       └── [FILL IN - autres fichiers?]
├── lib/
│   ├── stores/
│   │   └── [FILL IN - store pour lead filters/sort?]
│   └── utils/
│       ├── url-state.ts (gestion URL state)
│       └── storage.ts (gestion localStorage)
```

**Rationale:** [FILL IN]

---

## 🔌 Integration Points

### Question: What existing systems/modules will this integrate with?

**Integration Points:**
1. tRPC lead.list query: [FILL IN - Comment les filtres/sorts sont-ils actuellement passés au backend? Faut-il modifier les types?]
2. Existing filter/sort UI components: [FILL IN - Où se trouvent-ils? Components réutilisables ou inline?]
3. Pagination system: [FILL IN - Système de pagination existant? Où est-il défini?]

**Potential Conflicts:** [FILL IN - Y a-t-il d'autres pages avec des systèmes de filtrage à harmoniser?]

---

## 📊 Data Model & Schema

### Question: What filter/sort parameters need to be persisted?

**Available Filters (Current):**
[FILL IN - Liste complète des filtres disponibles:
- Status? (LeadStatus enum?)
- Score? (HOT/WARM/COLD)
- Date range?
- Search text?
- Source?
- Autres?]

**Available Sort Options (Current):**
[FILL IN - Liste des champs triables:
- Name
- Created date
- Score
- Autres?]

**URL State Schema (Proposed):**
```typescript
interface LeadListState {
  // Sort
  sortField?: [FILL IN - 'name' | 'createdAt' | ...?]
  sortOrder?: 'asc' | 'desc'

  // Filters
  status?: [FILL IN - type?]
  score?: [FILL IN - type?]
  search?: string
  [FILL IN - autres filtres?]

  // Pagination
  page?: number
  pageSize?: number
}
```

**localStorage Schema (if different):**
[FILL IN - Même structure ou différente? Y a-t-il des données additionnelles à sauver localement?]

**Migrations Needed:** [FILL IN - Faut-il gérer la migration d'anciennes versions de localStorage?]

---

## 🎨 User Interface & Experience

### Question: What should the user interface look like?

**UI Components to Update:**
- [FILL IN - Filter panel: Où se trouve-t-il? Design actuel?]
- [FILL IN - Sort dropdown: Où se trouve-t-il?]
- [FILL IN - Pagination controls: Design actuel?]

**User Flow:**
1. [FILL IN - User arrives on page with URL params → ...]
2. [FILL IN - User changes filter → ...]
3. [FILL IN - User changes sort → ...]
4. [FILL IN - User changes page → ...]
5. [FILL IN - User shares URL → ...]
6. [FILL IN - User returns later → ...]

**Visual Feedback:**
- [FILL IN - Afficher un indicateur lors de la mise à jour de l'URL?]
- [FILL IN - Afficher un bouton "Copy link" ou "Share filters"?]
- [FILL IN - Afficher les filtres actifs de manière claire?]
- [FILL IN - Bouton "Reset filters"?]

**Design Constraints:** [FILL IN - Style guide existant? Patterns de filtering à suivre?]

---

## ✅ Testing Strategy

### Question: How should this be tested?

**Testing Approach:**
- Unit tests: [FILL IN - Tester les fonctions de serialization/deserialization URL/localStorage]
- Integration tests: [FILL IN - Tester l'interaction complète filters → tRPC query]
- Manual testing: [FILL IN - Scénarios à tester manuellement]

**Edge Cases to Consider:**
1. [FILL IN - URL avec paramètres invalides ou obsolètes]
2. [FILL IN - localStorage corrompu ou ancien format]
3. [FILL IN - Conflits entre URL et localStorage]
4. [FILL IN - Pagination hors limites]
5. [FILL IN - Caractères spéciaux dans search/filters]
6. [FILL IN - Taille maximale de l'URL (2048 chars limit)]

---

## 🚀 Deployment & Rollout

### Question: Impact on existing users?

**Deployment Strategy:** [FILL IN - Déploiement direct ou feature flag?]

**Backward Compatibility:**
- [FILL IN - Les utilisateurs avec d'anciens liens (sans params) doivent-ils voir un état par défaut?]
- [FILL IN - Migration de l'ancien localStorage (s'il existe)?]

**Rollback Plan:** [FILL IN - Comment rollback si problème?]

---

## 🎯 Success Criteria

### Question: How do we know this task is complete?

**Completion Checklist:**
- [ ] URL updates automatically when filters/sort/pagination change
- [ ] URL params are correctly parsed and applied on page load
- [ ] Sharing URL with colleague shows same filtered view
- [ ] localStorage persists preferences across sessions
- [ ] Browser back/forward works as expected
- [ ] Invalid URL params are handled gracefully
- [ ] [FILL IN - Autres critères?]

**Performance Goals:** [FILL IN - Temps de réponse max pour mise à jour URL? Impact sur perf?]

---

## ❓ Open Questions & Concerns

**Uncertainties:**
1. Default state: [FILL IN - Quel est l'état par défaut si aucun param? Tous les leads? Filtres par défaut?]
2. State per user vs global: [FILL IN - Les préférences localStorage sont-elles globales ou par user/team?]
3. URL length limit: [FILL IN - Que faire si trop de filtres dépassent la limite URL? Utiliser seulement localStorage?]
4. Multi-tab behavior: [FILL IN - Comment gérer plusieurs onglets avec différents filtres?]

**Risks & Mitigation:**
- Risk: URL trop longue avec beaucoup de filtres → Mitigation: [FILL IN]
- Risk: Confusion entre localStorage et URL state → Mitigation: [FILL IN]
- Risk: Performance dégradée avec debouncing mal configuré → Mitigation: [FILL IN]

---

## 📝 Additional Notes

**Existing Implementations:**
[FILL IN - Y a-t-il d'autres pages dans Glouton avec des systèmes similaires qu'on pourrait réutiliser ou harmoniser?]

**Future Enhancements (Out of Scope):**
[FILL IN - Saved filter presets? Named views? Autres idées?]

**Team Considerations:**
[FILL IN - Combien d'utilisateurs? Fréquence d'utilisation du partage de liens?]

---

**Instructions:** Please fill in all `[FILL IN]` sections above. Remove any sections that are not relevant to this task. Add any additional questions or sections you think are important. When you're done, save this file and let me know so I can proceed with implementation.
