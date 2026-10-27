# Pronos Star Ac' (saison 14)

Site de pronostics entre amis pour la Star Academy 2026. Site non officiel.

En ligne : https://pronos-starac.github.io/Star-Academy/

## Comment ça marche

- Le site est hébergé par **GitHub Pages**.
- Les pronos sont enregistrés dans **Firebase Firestore**, une base de données gratuite de Google.
- Chaque joueur choisit un **pseudo** et un **code de 4 à 8 chiffres**. Avec les mêmes pseudo et code, il retrouve ses pronos sur n'importe quel appareil. Aucune adresse e-mail n'est demandée.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | Le site complet |
| `firebase-config.js` | La configuration de ton projet Firebase |
| `firestore.rules` | Les règles de sécurité à coller dans Firebase |
| `photos/` | Les portraits officiels TF1 des 17 élèves (300 px de large) |

## Brancher Firebase (une seule fois, environ 10 minutes)

1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google. Clique sur **Créer un projet**, nomme-le (par exemple `pronos-star-ac`), puis désactive Google Analytics.
2. Sur l'accueil du projet, clique sur l'icône **Web** (`</>`). Nomme l'application, puis clique sur **Enregistrer l'application**. Ne coche pas « Firebase Hosting ». Firebase t'affiche un bloc `const firebaseConfig = { ... }` : copie-le.
3. Colle ce bloc dans `firebase-config.js` à la place de `null` (ou envoie-le à Claude, qui le fera).
4. Dans le menu de gauche, va dans **Build → Authentication → Commencer**, onglet **Sign-in method**. Active **Anonyme**, puis **Adresse e-mail/Mot de passe** (sans le lien e-mail), et enregistre.
5. Toujours dans **Authentication**, ouvre **Paramètres → Domaines autorisés**, clique sur **Ajouter un domaine** et ajoute `pronos-starac.github.io`.
6. Va dans **Build → Firestore Database → Créer une base de données**. Choisis un emplacement en Europe (par exemple `eur3`), puis le **mode production**.
7. Ouvre le site et connecte-toi avec le pseudo **Aurélien** et ton code.
8. Dans **Firestore → Règles**, colle tout le contenu de `firestore.rules`, puis clique sur **Publier**.
9. Reviens sur le site, ouvre l'onglet **Orga** et clique sur **Ouvrir la saison**.

Une fois ces étapes faites, tes amis peuvent jouer.

## Pendant la saison

**Reconnaissance des chansons (onglet Prime → Chansons)** : « Nouvelle chanson » écoute 10 secondes au micro et remplit le titre grâce à l'API AudD (https://audd.io, 300 requêtes offertes puis environ 5 $ les 1 000). L'organisateur colle la clé AudD dans l'onglet *Orga* ; elle est rangée dans Firestore (`config/audd`, règles VERSION 17) et lisible par les joueurs inscrits, donc pense à plafonner la dépense sur le compte AudD. Les reprises chantées en direct sont souvent mal reconnues : le titre reste modifiable à la main. Le bouton « Tous les élèves » sélectionne tous les élèves encore en lice.

**Les joueurs**, dans l'onglet *Mon prono* (après avoir saisi pseudo et code) :
- **Cette semaine** : ils choisissent qui sera éliminé (parmi les nominés) et qui sera immunisé. C'est enregistré dès qu'ils touchent un élève, et fermé automatiquement le dimanche à minuit.
- **Anti-spoiler** : chaque joueur peut cocher « Je regarde le prime le dimanche ». Les résultats du samedi sont alors masqués pour lui jusqu'à dimanche minuit. Du début du prime (samedi 21h10) à dimanche minuit, les commentaires écrits pendant ou après le prime qui citent un élève ou parlent du résultat sont aussi censurés (bouton « Afficher »), ainsi que le texte des notifications de commentaires. Pour le robot des notifications, l'option est enregistrée dans `notifprefs` (champ `noSun`, règles Firestore VERSION 13).
- **Pronostic final** : ils touchent les 17 élèves dans l'ordre (le 1er touché est le vainqueur). Une fois les 17 placés, la grille se range dans leur ordre : on peut alors déplacer un élève par glisser-déposer, puis cocher « Je valide mon classement ». Chaque clic est enregistré automatiquement, jusqu'à ce que tu verrouilles les classements.

**Toi**, dans l'*Espace organisateur* :
- le mercredi, saisis les **nominés** ;
- le samedi, saisis l'**immunisé** désigné au prime, puis l'**éliminé**, et confirme le KO ;
- sinon, l'éliminé et l'immunisé sont remplis automatiquement d'après le résumé de la quotidienne du dimanche (champs `primeOut` et `primeImmune` de `recaps.json`), seulement s'ils sont cohérents (éliminé parmi les nominés, immunisé parmi les candidats). Les points comptent aussitôt ; dans l'espace organisateur, **Valider** les enregistre, **Rejeter** les ignore pour saisir le résultat à la main. Ta saisie l'emporte toujours ;
- quand tu le décides, clique sur **Verrouiller les classements finaux**.

Chaque clic est enregistré tout de suite et visible par tout le monde.

## Heure de fermeture des choix de la semaine

Les choix de la semaine ferment chaque **dimanche à minuit**, heure de Paris, pour laisser voter ceux qui regardent le prime en replay.

Attention : entre la fin du prime du samedi et dimanche minuit, un joueur qui connaît déjà le résultat peut encore voter. Dès que tu saisis l'éliminé, le site passe à la semaine suivante et n'affiche plus le vote de la semaine terminée. Ça limite les abus, sans les empêcher complètement, puisque l'anti-spoiler garde la semaine ouverte pour ceux qui l'activent. Saisis donc l'éliminé et l'immunisé dès la fin du prime.

Pour changer l'heure :
1. Dans `index.html`, modifie `LOCK_DAYS` (nombre de jours après le samedi ; la fermeture tombe à 0h00 ce jour-là).
2. Les heures déjà enregistrées dans Firestore (document `season/main`, champ `locks`) ne changent pas toutes seules : modifie-les dans la console Firebase.

Si un prime tombe un autre jour, modifie aussi l'heure de la semaine concernée dans `locks`.

## Barème

| Situation | Points |
|---|---|
| Élève à sa place exacte dans le classement final | 5 |
| Élève à une place d'écart | 3 |
| Élève à deux places d'écart | 1 |
| Éliminé de la semaine trouvé | 3 |
| Immunisé de la semaine trouvé | 3 |
| Vainqueur trouvé | +10 |

Les points du classement final ne comptent que si le classement est complet (17 élèves).

## Changer une photo

Remplace le fichier dans `photos/` en gardant le même nom. Le nom du fichier est le prénom de l'élève en minuscules et sans accent : `amel`, `antoine`, `brieuc`, `cameron`, `elija`, `felix`, `isabella`, `khalil`, `kylian`, `leeloo`, `maud`, `melina`, `morgan`, `noemie`, `tracy`, `ydriss`, `zoe`.

## Droits d'organisateur

L'onglet **Orga** et le lien « Espace organisateur » n'apparaissent que pour le joueur dont le pseudo est **Aurélien** (identifiant `aurelien`), sur n'importe quel appareil. Les règles Firestore appliquent la même restriction côté serveur : même en bricolant la page, personne d'autre ne peut modifier les résultats.

Pour changer d'organisateur, remplace `aurelien` par le nouvel identifiant dans `ORGA_LOGIN` (fichier `index.html`) et dans `firestore.rules`, puis republie les règles.
