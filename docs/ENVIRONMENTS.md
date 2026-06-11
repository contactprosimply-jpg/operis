# Isolation test / production (Operis v8)

## Problème

Deux comptes Operis (prod `contact@nikodex.fr` et compte test) partagent le même projet Supabase → les mails se mélangent.

## Solution recommandée : Option A — deux projets Supabase

### Étape 1 — Créer le projet test

1. Aller sur [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Nom suggéré : `operis-test` (région proche de la prod).
3. Noter l’**URL** et les clés **anon** + **service_role** du nouveau projet.

### Étape 2 — Appliquer les migrations sur les deux projets

Dans l’éditeur SQL Supabase (prod **et** test), exécuter dans l’ordre tous les fichiers de `supabase/migrations/` :

```
001_*.sql … 012_family_mail_v8.sql
```

Vérifier notamment `012_family_mail_v8.sql` (colonnes `source_member_*`, `priority`, `labels`, RLS Famille).

### Étape 3 — Variables d’environnement

| Environnement | Fichier / hôte | Variables Supabase |
|---------------|----------------|-------------------|
| **Production** | Vercel `operis-f26g78` + secrets prod | URL + keys du projet **prod** |
| **Test / dev local** | `.env.local` du compte test | URL + keys du projet **test** |

Variables minimales (exemple) :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
APP_ENV=test   # ou production sur Vercel
```

**Règle** : ne jamais réutiliser les mêmes `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` entre test et prod.

### Étape 4 — Vercel (production)

1. `vercel env ls` — confirmer que les variables pointent vers le projet **prod**.
2. Sur Vercel, définir `APP_ENV=production` (optionnel, pour les logs).
3. Ne pas copier le `.env.local` test dans les variables Vercel.

### Étape 5 — Développement / test local

1. Cloner ou utiliser un dossier avec le compte test.
2. `.env.local` → clés du projet **test** uniquement.
3. `npm run dev` — les mails et AO restent isolés du prod.

### Étape 6 — Script `sync.mjs` (IMAP cron)

Le script lit `.env.local` et affiche l’URL Supabase au démarrage :

```bash
node sync.mjs
# → Operis sync — owner … — Supabase: https://xxxx.supabase.co (APP_ENV=test)
```

- **Une machine / un compte = un `.env.local`** (prod ou test, pas les deux).
- Vérifier la ligne `Supabase:` avant chaque sync manuelle.

### Étape 7 — API mail sync (garde-fou léger)

`POST /api/mail/sync` logue `APP_ENV` et l’hôte Supabase (sans clé) en console serveur. Aucun blocage en prod — uniquement de la visibilité pour éviter les mauvaises configs.

### Checklist avant sync / déploiement

- [ ] `.env.local` ou Vercel pointe vers le bon projet Supabase
- [ ] `APP_ENV` cohérent (`test` vs `production`)
- [ ] Migrations appliquées sur ce projet
- [ ] `sync.mjs` : l’URL affichée correspond à l’environnement voulu

## Option B (non recommandée)

Colonne `environment` + RLS — plus léger mais risque de fuite si une requête oublie le filtre.
