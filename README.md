# TCL Live Dashboard

Application web React + Vite + TypeScript pour afficher des lignes de bus TCL sur un dashboard grand format, sans carte geographique, avec un mode mock fonctionnel par defaut.

## Installation

```bash
npm install
```

## Lancement

```bash
npm run dev
```

Puis ouvrir l'URL affichee par Vite, en general `http://localhost:5173`.

## Configuration rapide

Le fichier `.env.example` documente les variables utiles.

- sans configuration, l'application tourne en mode `mock`
- le projet local est deja configure en `.env.local` pour utiliser le temps reel via `Bus Tracker`

## Build de verification

```bash
npm run build
```

## Deploiement GitHub Pages

Le repo `hug0live/tuutuut` peut maintenant se publier automatiquement sur GitHub Pages via le workflow `.github/workflows/deploy-pages.yml`.

- le build GitHub Pages detecte automatiquement le sous-chemin du repo et sort les assets sous `/tuutuut/`
- le workflow publie sur chaque push vers `main`
- le build Pages force `VITE_DATA_SOURCE=tcl`
- aucun secret n'est necessaire pour ce mode, car `bus-tracker.fr` est appele directement depuis le navigateur

Activation une seule fois dans GitHub :

1. ouvrir `Settings` -> `Pages`
2. verifier que la source est `GitHub Actions`
3. pousser sur `main` ou lancer le workflow manuellement depuis l'onglet `Actions`

Pour tester localement le meme contexte que GitHub Pages :

```bash
VITE_BASE_PATH=/tuutuut/ VITE_DATA_SOURCE=tcl npm run build
```

Important :

- le mode local par defaut reste `mock`, afin de garder un demarrage sans dependance externe

## Fonctionnalites

- recherche d'arret TCL
- selection d'un arret
- chargement des lignes desservant cet arret
- selection multiple de lignes et de directions
- affichage horizontal SVG des arrets dans le bon ordre
- positionnement temps reel des vehicules sur chaque ligne
- rafraichissement automatique toutes les 10 secondes
- arrets, lignes et directions reels issus d'un snapshot GTFS TCL officiel
- resilience UI avec loading, empty state et erreur non bloquante

## Architecture

```text
src/
  app/
    App.tsx
  components/
    Dashboard.tsx
    ErrorState.tsx
    LineDiagram.tsx
    LineSelector.tsx
    LoadingState.tsx
    StatusBar.tsx
    StopMarker.tsx
    StopSelector.tsx
    VehicleMarker.tsx
  domain/
    lineProjection.ts
    types.ts
    vehiclePositioning.ts
  hooks/
    useLineStops.ts
    useLinesByStop.ts
    usePolling.ts
    useRealtimeVehicles.ts
    useStopsSearch.ts
  mocks/
    tclBusCatalog.json
  services/
    api/
      tclClient.ts
      adapters/
        mockAdapter.ts
        tclAdapter.ts
  store/
    useAppStore.ts
  styles/
    app.css
  main.tsx
```

## Mode mock

Le mode mock est la source active par defaut.

- aucune API externe n'est necessaire
- les arrets, lignes et directions proviennent d'un snapshot GTFS TCL officiel derive localement
- la relation arret -> lignes -> directions est calculee depuis ce catalogue reel
- l'ordre des arrets par ligne est derive du GTFS, avec prise en compte de plusieurs patterns par direction
- les vehicules ne sont pas figes : leur position est simulee localement a partir du temps courant et evolue a chaque refresh

Le choix de la source se fait dans `src/services/api/tclClient.ts`. Par defaut, `VITE_DATA_SOURCE` vaut implicitement `mock`. Pour preparer un branchement reel plus tard, on peut lancer Vite avec :

```bash
VITE_DATA_SOURCE=tcl npm run dev
```

Dans ce mode :

- la recherche d'arrets, les lignes et les schemas de ligne restent bases sur le catalogue GTFS local reel
- les positions vehicules sont lues depuis l'API publique `bus-tracker.fr`
- si la source choisie est indisponible, l'UI reste stable et affiche `Temps reel indisponible`

## Points de branchement TCL reels

Le point d'extension principal est l'interface `TransportAdapter` dans `src/services/api/tclClient.ts`.

Methodes attendues :

- `searchStops(query)`
- `getLinesByStop(stopId)`
- `getLineStops(lineId, directionId?)`
- `getRealtimeVehicles(lineId)`
- `getRealtimePassages(stopId, lineIds?)`

Le fichier `src/services/api/adapters/tclAdapter.ts` branche maintenant :

- la topologie statique depuis le catalogue GTFS local reel
- le flux public Bus Tracker pour les positions vehicules temps reel sans credentials
- une projection GPS -> segment de ligne quand les references d'arrets ne suffisent pas

Il reste volontairement un TODO sur `getRealtimePassages`, qui utilise encore le fallback mock tant que le `StopMonitoring` reel n'est pas raccorde.

## Mode temps reel actif

Par defaut dans ce repo local :

```bash
VITE_DATA_SOURCE=tcl
```

Ce mode fournit :

- de vraies positions GPS temps reel pour les vehicules TCL
- sans credentials supplementaires
- avec `access-control-allow-origin: *` sur l'API publique Bus Tracker, donc appel direct depuis le frontend

## Notes de conception

- Le rendu horizontal SVG est calcule dans `src/domain/lineProjection.ts`.
- Le placement des vehicules et le leger decalage anti-collision sont geres dans `src/domain/vehiclePositioning.ts`.
- Le polling temps reel est centralise dans `src/hooks/usePolling.ts`.
- L'etat de selection est volontairement leger et persiste en `localStorage` via `src/store/useAppStore.ts`.
- Le catalogue local reel est genere par `scripts/build_tcl_bus_catalog.py` a partir d'un GTFS TCL officiel.

## Priorite respectee

1. mode mock operationnel immediatement
2. selection arret -> lignes
3. rendu horizontal SVG
4. vehicules dynamiques
5. architecture prete pour une integration temps reel ciblee Bus Tracker
