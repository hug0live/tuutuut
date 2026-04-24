# tuutuut

Application web React + Vite + TypeScript pour suivre les prochains passages de bus en temps reel.

L'application propose une interface simple pour consulter rapidement un arret et voir :

- les lignes qui desservent l'arret
- la direction choisie
- les prochains passages
- les vehicules observes sur le trajet
- suivre jusqu'a 2 arrets en parallele

## Fonctionnement

L'utilisateur commence par choisir une ville ou un reseau, puis recherche un arret.

Une fois l'arret selectionne, l'application permet de choisir une direction et une ou plusieurs lignes afin d'afficher un dashboard synthétique. L'interface combine les informations statiques du reseau avec les donnees temps reel pour estimer les prochains passages et visualiser la position des vehicules.

Les donnees statiques sont embarquees dans le projet. Les donnees temps reel sont recuperees via `bus-tracker.fr`.

## Lancer l'application

Installer les dependances :

```bash
npm install
```

Demarrer le serveur de developpement :

```bash
npm run dev
```

L'application est ensuite accessible en general sur `http://localhost:5173`.

En local, Vite proxifie les appels API pour permettre a l'application d'interroger la source temps reel pendant le developpement.

## Build

Produire un build de production :

```bash
npm run build
```

Previsualiser le build localement :

```bash
npm run preview
```
