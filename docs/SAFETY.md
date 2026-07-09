# Sécurité alimentaire et allergies

Cette application doit toujours rester prudente.

## Formulations autorisées

- Compatible avec le profil actuel.
- Aucun conflit détecté.
- Compatible probable.
- À vérifier avec le restaurant.
- Non compatible selon le profil.
- Composition insuffisante.

## Formulations à éviter

- Garanti sans allergène.
- 100 % sûr.
- Tu peux le manger sans risque.
- Aucun risque de contamination.

## Principe pour les allergies

Si un allergène déclaré est détecté ou probable, le plat doit être classé en `blocked`.

Si la composition est inconnue et que l'utilisateur a des allergies déclarées, l'app doit recommander de vérifier avec le restaurant.

Même une correction apprise ne doit pas être présentée comme garantie médicale : elle améliore la reconnaissance, mais ne confirme pas l'absence de contamination croisée.

## Principe pour religion/régime

Les règles religieuses peuvent varier selon les personnes. Le profil doit donc permettre des niveaux :

- Souple
- Normal
- Strict

Exemple halal :

- Souple : bloque porc et alcool explicite.
- Normal : alerte viande non certifiée, gélatine, bouillon.
- Strict : peut bloquer viande non certifiée et cuisson partagée.

## Principe pour la V3

La V3 est un assistant de décision, pas une source médicale ou religieuse officielle.

Le mode groupe ne doit jamais masquer un risque individuel : un plat peut être OK pour une personne et bloqué pour une autre.

La mémoire apprise doit être visible dans les résultats via le match `learned-db` afin que l'utilisateur sache que la conclusion vient d'une correction locale.
