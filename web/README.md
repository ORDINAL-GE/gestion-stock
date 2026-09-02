# Stock - étape 2 : lecture du QR Client

Cette page mobile remplace le décodage WINDEV du QR Client par une implémentation HTML/JavaScript.

## Format reconnu

Le format repris de `Documentation_Stock.pdf` est composé de deux lignes :

```text
Client
244048
```

Les séparateurs CR, LF et CRLF sont acceptés. Le type doit être `Client` et l'identifiant doit être un entier positif.

## Utilisation

Servir le dossier `web` en HTTPS, puis ouvrir `index.html` depuis Safari sur iOS ou Chrome, Firefox ou Edge sur Android. L'accès caméra Web est refusé par les navigateurs mobiles si la page n'est pas en HTTPS (hors `localhost`).

La lecture depuis une photo est disponible comme solution de repli et reste entièrement locale dans le navigateur.

## Connexion future aux données Client

La lecture du QR fonctionne sans serveur et retourne l'ID Client. Pour afficher les informations HFSQL, charger avant `app.js` une configuration équivalente à `config.example.js`. L'URL peut contenir `{id}` et doit retourner du JSON :

```json
{
  "client": "Nom de l'entreprise",
  "clientFinal": "Nom du client final",
  "chantier": "Nom du chantier",
  "ordre": 123
}
```

Il ne faut pas exposer directement les identifiants HFSQL dans le JavaScript du navigateur : l'accès doit passer par une API HTTPS côté serveur.