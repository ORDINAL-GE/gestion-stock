# Stock - test du parcours Réserver

La page reproduit le cycle mobile prévu pour l'application Stock :

1. l'ouverture HTTPS affiche le menu ;
2. seul le bouton `Réserver` est actif ;
3. `Réserver` ouvre directement la caméra ;
4. un QR `Article` renseigne le cadre supérieur ;
5. un QR `Client` renseigne le cadre inférieur ;
6. le bouton `Scan` permet de recommencer sans limite et remplace uniquement la valeur du même type.

## Formats reconnus

```text
Article
9119
```

```text
Client
244048
```

Les séparateurs CR, LF et CRLF sont acceptés. Le type doit être `Article` ou `Client` et l'identifiant doit être un entier positif.

## Utilisation

Servir le dossier `web` en HTTPS, puis ouvrir `index.html` depuis Safari sur iOS ou Chrome, Firefox ou Edge sur Android. La lecture depuis une photo reste disponible comme solution de repli.

Cette étape ne consulte pas encore HFSQL : seuls le type et l'identifiant lus dans le QR sont affichés. Les informations détaillées et les actions de validation seront ajoutées avec l'API de données.
