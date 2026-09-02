# Stock - étape 3 : lecture du QR Article

Cette page mobile teste le décodage WINDEV du QR Article avec une implémentation HTML/JavaScript.

## Format reconnu

Le format repris de `Documentation_Stock.pdf` est composé de deux lignes :

```text
Article
9119
```

Les séparateurs CR, LF et CRLF sont acceptés. Le type doit être `Article` et l'identifiant doit être un entier positif. Les exemples fournis correspondent aux articles `9119`, `12979` et `361`.

## Utilisation

Servir le dossier `web` en HTTPS, puis ouvrir `index.html` depuis Safari sur iOS ou Chrome, Firefox ou Edge sur Android. L'accès caméra Web est refusé par les navigateurs mobiles si la page n'est pas en HTTPS (hors `localhost`).

La lecture depuis une photo est disponible comme solution de repli et reste entièrement locale dans le navigateur.

## Connexion future aux données Article

La lecture du QR fonctionne sans serveur et retourne l'ID Article. Pour afficher les informations HFSQL, charger avant `app.js` une configuration équivalente à `config.example.js`. L'URL peut contenir `{id}` et doit retourner du JSON :

```json
{
  "matiere": "Azul macaubas (Q)",
  "finition": "Polie",
  "dimensions": "215 x 147 x 2",
  "fournisseur": "Fournisseur",
  "facture": "Facture"
}
```

Il ne faut pas exposer directement les identifiants HFSQL dans le JavaScript du navigateur : l'accès doit passer par une API HTTPS côté serveur.
