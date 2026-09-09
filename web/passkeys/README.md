# Stock — prototype passkeys statique

Ouvrir `https://ordinal-ge.github.io/gestion-stock/passkeys/` après publication.

## Parcours sur téléphone

1. Ouvrir le prototype directement dans Chrome (Android) ou Safari (iPhone).
2. Pour tester une PWA, ajouter Stock Test à l’écran d’accueil puis ouvrir cette icône.
3. Commencer l’activation, simuler la création du compte autorisé, saisir le nom d’utilisateur et le mot de passe temporaires affichés, puis créer la passkey.
4. Tester la connexion et accepter la confirmation du gestionnaire de clés.
5. Fermer la session simulée puis se reconnecter.
6. Dans « Essayer un autre navigateur », préparer et copier le lien. L’ouvrir dans l’autre environnement, charger la fiche publique et tester la même passkey. La fiche ne copie aucune clé privée : le gestionnaire doit fournir la passkey (ou une authentification croisée).
7. Télécharger le compte rendu depuis « Résultats et diagnostic ».

Les profils sont fictifs. Les identifiants temporaires fictifs sont affichés sur place et ne sont jamais envoyés. Ils restent uniquement dans la mémoire de la page, expirent après 10 minutes et sont effacés après succès ou navigation. Cinq erreurs bloquent cet essai ; recommencer la simulation renouvelle les identifiants. Ce mécanisme local n’offre aucune protection serveur. Ne saisir aucune information de production.

## Ce qui est réel

- WebAuthn natif `navigator.credentials.create/get`, clé ES256 P-256 découvrable, vérification utilisateur obligatoire.
- Gestion de la clé privée par le gestionnaire du téléphone. Aucune clé privée n’est générée, lue ou exportée par le code de l’application.
- Vérification locale de signature avec WebCrypto, défi à usage unique de 90 secondes, origine exacte, hash RP ID, indicateurs UP/UV et userHandle. Conversion DER vers P1363 strictement bornée.
- Export/import d’une fiche publique validée : format, origine, RP ID, credential ID, userHandle et clé publique SPKI. Le lien utilise un fragment, retiré de l’adresse dès l’ouverture. Ce lien contient une identité de test corrélable : ne pas le traiter comme un secret d’accès, ni y placer des données personnelles.
- Parcours History explicites ; aucun lancement WebAuthn automatique au retour, au chargement ou à la restauration BFCache. Abandon des résultats périmés après navigation/pagehide.

## Ce qui est simulé (ne pas utiliser en production)

- Base HFSQL remplacée par un objet localStorage, limité à un profil de test par stockage.
- Approbation, nom d’utilisateur et mot de passe d’activation locaux, manipulables par l’utilisateur. En production, l’administrateur vérifie l’identité, remet les identifiants par un canal vérifié, et le serveur valide un hachage du mot de passe puis le consomme après enrôlement réussi.
- Session de cinq minutes dans sessionStorage ; aucun cookie HttpOnly et aucune API protégée.
- Révocation locale, sans effet sur les autres navigateurs. Réinitialiser/importer peut recréer un état autorisé : ce n’est pas un système d’autorisation.
- Vérifications dans le navigateur, contournables. Une signature valide ici démontre l’interopérabilité, pas une frontière de sécurité serveur.
- Pas d’attestation matérielle ni de garantie d’appareil physique. Les compteurs sont lus sans politique anti-clonage ; les clés synchronisées peuvent avoir un compteur nul. Les flags de sauvegarde sont des indications, pas une garantie de synchronisation effective.

La production utilisera SimpleWebAuthn côté Node.js, une validation serveur complète, des sessions sécurisées et HFSQL. Le présent adaptateur natif et la conversion DER servent exclusivement à ce prototype sans backend.

## Isolation et déploiement

Tous les fichiers sont sous `web/passkeys/`, publiés par le workflow Pages existant. Les fichiers de Stock et le workflow restent inchangés. Service worker réseau uniquement, scope `./`, aucun cache hors ligne, aucun accès caméra ni réseau externe ajouté.

RP ID : le hostname réel, sans chemin (`ordinal-ge.github.io` sur Pages). Le RP ID n’isole pas les dépôts partageant le même hostname ; ce domaine sert aux essais uniquement. Sur un domaine de production différent, créer de nouvelles passkeys. Ne pas choisir `github.io` comme RP ID.

L’icône installée peut avoir un stockage distinct selon la plateforme. Importer la fiche publique si nécessaire. Effacer les données du prototype ne supprime pas la passkey du gestionnaire ; supprimer ensuite manuellement l’entrée « Stock — Prototype » si souhaité.

## Validation automatisée

Depuis la racine du dépôt : `node --test tests/passkeys/crypto.test.mjs`.

`tests/passkeys/browser.mjs` utilise Playwright et un authentificateur virtuel Chromium pour tester création, signature, erreurs, stockage séparé, session, révocation et navigation. Définir `PLAYWRIGHT_MODULE` et éventuellement `BROWSER_EXE` selon le poste. `PROTOTYPE_URL` permet de répéter les essais sur l’adresse publiée. Cet essai ne remplace pas les tests biométriques iPhone/Android réels.

Références : https://www.w3.org/TR/webauthn/ et https://simplewebauthn.dev/docs/packages/server
