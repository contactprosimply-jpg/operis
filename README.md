# Operis — Gestion des appels d'offres BTP

Application Next.js + Supabase pour consulter fournisseurs, suivre les AO et la messagerie.

**Production :** https://operis-f26g78.vercel.app

## Développement

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Application desktop (Electron)

```bash
npm run desktop:icon    # génère electron/icon.png + icon.ico
npm run desktop         # ouvre l'app (URL prod par défaut)
npm run desktop:build   # installeur Windows + version portable → dist-desktop/
```

Variable optionnelle : `OPERIS_URL=https://...` pour pointer vers un autre environnement.

## Migrations Supabase

Si les liens d'invitation Famille échouent, exécuter dans le SQL Editor Supabase le fichier :

`supabase/migrations/014_organization_invites.sql`

## Crons Vercel (variables : `CRON_SECRET`, SMTP, Supabase)

| Route | Fréquence | Rôle |
|-------|-----------|------|
| `/api/cron/sync` | toutes les 2 min | sync IMAP |
| `/api/cron/alerts` | 7h UTC | alertes deadlines + digest |
| `/api/cron/relaunch` | 7h30 UTC | relances auto fournisseurs (J+7 sans réponse) |

Test manuel : `curl -H "Authorization: Bearer $CRON_SECRET" https://operis-f26g78.vercel.app/api/cron/relaunch`

## Scénario démo Famille

1. **contact@** (admin Famille) — tableau de bord, notifications, tous les AO du groupe.
2. **b.uros** (membre) — crée un AO → visible sur contact@ avec badge **Créé par b.uros**.
3. Admin assigne l'AO au membre → badge **Assigné à …** côté admin.
4. Consultation fournisseurs depuis le compte du créateur (messagerie personnelle).
5. Sans réponse après 7 jours → relance automatique (cron) ou manuelle sur la fiche AO.

## Build production

```bash
npm run build
npm start
```
