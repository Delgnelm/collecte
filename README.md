# Collecte École — PWA Porte-à-Porte

Application Web Progressive (PWA) complète pour organiser une collecte de dons porte-à-porte pour une école : portail citoyen mobile-first, découpage cartographique des secteurs avec réassignation automatique par géométrie (`Turf.js`), gestion des bénévoles, diffusion par courriel sécurisé, vue terrain hors-ligne et purge de confidentialité **Loi 25**.

---

## 1. Architecture Technique

- **Frontend (`client/`) :** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, `vite-plugin-pwa` (Workbox : mise en cache App Shell, tuiles OpenStreetMap `CacheFirst`, API terrain `NetworkFirst` + file de synchronisation locale hors-ligne).
- **Cartographie & SIG :** `Leaflet` + `react-leaflet` + `@geoman-io/leaflet-geoman-free` (dessin, édition des sommets, déplacement et suppression de polygones).
- **Backend (`server/`) :** Node.js, Express, TypeScript, Prisma ORM, `@turf/turf` (`booleanPointInPolygon`), Zod (validation stricte), `express-rate-limit`, `helmet`, JWT (`jsonwebtoken`), `bcryptjs`, Nodemailer.
- **Bases de données :**
  - **SQLite (`server/prisma/schema.prisma`)** : démarrage local instantané sans serveur externe.
  - **PostgreSQL (`server/prisma/schema.postgresql.prisma`)** : production Docker avec type `Json` natif et énumération `DonationStatus`.
- **Géocodage modulaire :** **Photon Komoot** par défaut (gratuit, sans clé API), extensible vers **Mapbox** ou **Google Places** via `.env`.

---

## 2. Démarrage Local Rapide (SQLite)

### Prérequis
- Node.js 20+ et npm 10+

### Étape 1 — Backend
```bash
cd server
cp ../.env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```
Le backend écoute sur `http://localhost:4000`.

### Étape 2 — Frontend
```bash
cd client
npm install
npm run dev
```
L'interface est accessible sur `http://localhost:5173`.

- **Portail Public :** `http://localhost:5173/`
- **Administration :** `http://localhost:5173/admin` (identifiants par défaut dans `.env` : `admin@ecole.local` / `ChangeMe2026!`)
- **Vue Terrain Bénévole :** `http://localhost:5173/terrain/<accessToken>`

---

## 3. Déploiement Production (Docker Compose + PostgreSQL)

1. Copiez et adaptez la configuration à la racine :
   ```bash
   cp .env.example .env
   ```
   Modifiez impérativement `JWT_SECRET`, `ADMIN_PASSWORD`, `APP_BASE_URL` et `CORS_ORIGIN` (ex. `https://collecte.votreecole.ca`).
2. Lancez la pile complète :
   ```bash
   docker compose up -d --build
   ```
   - `postgres` démarre avec volume persistant `postgres_data`.
   - `server` bascule automatiquement sur `schema.postgresql.prisma`, applique le schéma (`prisma db push`), exécute le seed initial si nécessaire et démarre Express.
   - `client` compile la PWA et sert les fichiers statiques via Nginx sur le port `8080` en redirigeant `/api/*` vers le backend.

---

## 4. Configuration SMTP (Brevo / Gmail)

### Brevo (Recommandé pour les envois associatifs)
```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre-identifiant-brevo
SMTP_PASS=votre-cle-smtp-brevo
SMTP_FROM_NAME="Collecte École"
SMTP_FROM_EMAIL=collecte@votre-domaine.ca
SMTP_DRY_RUN=false
```

### Gmail (Mot de passe d'application requis)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=votre.compte@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx
SMTP_FROM_NAME="Collecte École"
SMTP_FROM_EMAIL=votre.compte@gmail.com
SMTP_DRY_RUN=false
```

> Tant que `SMTP_DRY_RUN=true` (ou que `SMTP_HOST` est vide), les courriels sont simulés sans erreur et les liens sécurisés `/terrain/:accessToken` sont retournés dans le journal d'administration pour faciliter les tests.

---

## 5. Basculer le Fournisseur de Géocodage

L'architecture `server/src/services/geocoding/` implémente l'interface `GeocodingProvider` :
- **Photon (par défaut) :** `GEOCODING_PROVIDER=photon` (aucune clé requise).
- **Mapbox :** `GEOCODING_PROVIDER=mapbox` + `MAPBOX_ACCESS_TOKEN=pk....`
- **Google Places / Geocoding :** `GEOCODING_PROVIDER=google` + `GOOGLE_PLACES_API_KEY=AIza...`

---

## 6. Protection des Renseignements Personnels (Loi 25)

Une fois la campagne terminée, rendez-vous dans **Administration → Paramètres & Loi 25 → Purger les données personnelles** :
1. Tapez `PURGER` pour confirmer l'opération irréversible.
2. En une transaction atomique :
   - Les adresses, noms, instructions, créneaux horaires et coordonnées GPS exactes des points de collecte sont anonymisés (`isAnonymized = true`).
   - Les noms complets, courriels, numéros de téléphone et notes des bénévoles sont anonymisés.
   - Tous les jetons d'accès terrain (`accessToken`) sont régénérés (invalidant immédiatement les anciens liens envoyés par courriel).
   - **Les statistiques globales et par secteur** (nombre de points collectés, absents, en attente) sont intégralement conservées pour le bilan de l'école.
