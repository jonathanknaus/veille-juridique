# Règles de la base Firebase — elles ne vivent pas ici

Cet outil écrit dans la base Realtime Database du projet **`afs-pls-auth-42a28`**, qui est la même
que celle de **Pennylane Learning Suite**. Les nœuds utilisés ici sont `veille/traitements`,
`veille/archives` et `veille/articles-manuels`.

**Le fichier `database.rules.json` est maintenu dans un seul dépôt :**

```
pennylane-learning-suite/database.rules.json
```

## Pourquoi une seule copie

Une base Realtime Database n'a **qu'un seul document de règles**. Les deux dépôts en ont longtemps
porté une copie chacun, alors qu'un collage dans la console Firebase remplace le document
**entièrement** : la dernière copie collée écrasait les règles décrites par l'autre dépôt, sans
avertissement ni trace. Les deux copies étaient alignées jusqu'ici par vigilance, pas par
construction.

## Ce qu'il faut faire pour modifier une règle

1. modifier `database.rules.json` dans le dépôt `pennylane-learning-suite` ;
2. y lancer `npm run verifier:regles` depuis `frontend/` — le script confronte les règles au code
   qui écrit dans Firebase : chemins couverts, champs autorisés (⚠️ `$autre: false` fait **refuser
   silencieusement** tout champ inconnu), valeurs énumérées acceptées ;
3. coller le fichier dans la console Firebase → Realtime Database → Règles.

⚠️ Une écriture refusée par les règles ne lève pas d'erreur visible : `pousser()` se contente d'un
`console.warn`. La donnée manque le jour où on en a besoin comme preuve Qualiopi. D'où l'étape 2.

## Ajouter un champ à une trace de veille

Les champs acceptés sont listés **deux fois** et doivent rester identiques :

- dans ce dépôt : `CHAMPS` et `CHAMPS_MANUEL` de `src/data/veille-storage.js` ;
- dans les règles : `veille/traitements/$trace` et `veille/articles-manuels/$article`.

`npm run verifier:regles` (côté PLS) compare les deux listes et échoue si elles divergent.
