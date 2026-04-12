# TCL Live Dashboard

Application web React + Vite + TypeScript pour afficher des lignes de bus TCL sur un dashboard grand format, sans carte géographique.

Le projet utilise une seule source temps réel : `bus-tracker.fr`.

## Ce que fait l'application

- recherche d'arrêts TCL
- chargement des lignes desservant un arrêt
- sélection multiple de lignes et de directions
- affichage horizontal SVG des arrêts dans le bon ordre
- positionnement temps réel des véhicules sur chaque ligne
- estimation des prochains passages à partir des véhicules observés
- rafraîchissement automatique toutes les 10 secondes
- cache local des dernières positions pour garder une UI stable si Bus Tracker répond mal

## Source de données

- les arrêts, lignes, directions et séquences d'arrêts proviennent du catalogue embarqué [src/tclBusCatalog.json](/home/olivier/labs/tuutuut/src/tclBusCatalog.json)
- les positions des véhicules proviennent de l'API publique `https://bus-tracker.fr/api`
- les passages sont estimés localement à partir de ces positions et de la topologie de ligne
- si Bus Tracker est indisponible, l'interface reste utilisable et affiche une erreur non bloquante

## Installation

```bash
npm install
```

## Lancement en local

```bash
npm run dev
```

Vite démarre en général sur `http://localhost:5173`.

En développement, Vite proxifie `/api/bus-tracker/*` vers `https://bus-tracker.fr/api/*`.

## Variables utiles

- `VITE_BASE_PATH`: permet de servir l'application sous un sous-chemin
- `VITE_BUS_TRACKER_PROXY_PATH` : permet de changer le préfixe local utilisé pour appeler Bus Tracker

Exemple:

```bash
VITE_BASE_PATH=/tuutuut/ npm run build
```

## Build

```bash
npm run build
```

Le build lance d'abord les vérifications TypeScript puis produit le bundle Vite.

## Déploiement

### GitHub Pages

Le projet peut être publié sous GitHub Pages.

- le base path est détecté automatiquement dans GitHub Actions à partir de `GITHUB_REPOSITORY`
- les assets sortent donc correctement sous `/tuutuut/` pour le repo `hug0live/tuutuut`
- aucun secret n'est nécessaire pour Bus Tracker

Pour tester localement le même contexte :

```bash
VITE_BASE_PATH=/tuutuut/ npm run build
```

### Vercel

Le fichier [vercel.json](/home/olivier/labs/tuutuut/vercel.json) :

- lance `npm run build`
- réécrit `/api/bus-tracker/*` vers `https://bus-tracker.fr/api/*`

## Architecture

```text
src/
  app/
    App.tsx
  components/
    CombinedStopDiagram.tsx
    Dashboard.tsx
    ErrorState.tsx
    LineMultiSelectDropdown.tsx
    LoadingState.tsx
    NextArrivalCard.tsx
    StopMarker.tsx
    StopSelector.tsx
    VehicleMarker.tsx
  domain/
    arrivalEstimation.ts
    lineDirections.ts
    lineProjection.ts
    types.ts
    vehiclePositioning.ts
  hooks/
    useLinesByStop.ts
    usePolling.ts
    useStopsSearch.ts
  services/
    api/
      adapters/
        tclAdapter.ts
      catalogData.ts
      tclClient.ts
    storage/
      realtimeCache.ts
  store/
    useAppStore.ts
  styles/
    app.css
  tclBusCatalog.json
  main.tsx
```

## Points clés du code

- [src/services/api/tclClient.ts](/home/olivier/labs/tuutuut/src/services/api/tclClient.ts) expose l'interface `TransportAdapter` et retourne l'unique adaptateur actif
- [src/services/api/adapters/tclAdapter.ts](/home/olivier/labs/tuutuut/src/services/api/adapters/tclAdapter.ts) branche Bus Tracker et projette les positions GPS sur les segments de ligne
- [src/services/api/catalogData.ts](/home/olivier/labs/tuutuut/src/services/api/catalogData.ts) charge le catalogue TCL embarqué et dérive les relations arrêt -> lignes -> directions -> arrêts
- [src/services/storage/realtimeCache.ts](/home/olivier/labs/tuutuut/src/services/storage/realtimeCache.ts) conserve les dernières positions en IndexedDB
- [src/components/CombinedStopDiagram.tsx](/home/olivier/labs/tuutuut/src/components/CombinedStopDiagram.tsx) assemble les lignes, véhicules, passages et états UI

## Régénérer le catalogue

Le catalogue local est généré par [scripts/build_tcl_bus_catalog.py](/home/olivier/labs/tuutuut/scripts/build_tcl_bus_catalog.py) à partir d'un GTFS TCL officiel.
