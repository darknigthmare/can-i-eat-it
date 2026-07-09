import type { RuleId, Strictness, UserProfile } from '../types';

export const RULE_LABELS: Record<RuleId, string> = {
  vegetarian: 'Végétarien',
  vegan: 'Vegan',
  pescetarian: 'Pescétarien',
  no_pork: 'Sans porc',
  no_beef: 'Sans bœuf',
  no_alcohol: 'Sans alcool',
  halal: 'Halal',
  kosher: 'Casher',
  christian_lent: 'Carême / vendredi sans viande',
  hindu_no_beef: 'Hindou : sans bœuf',
  low_lactose: 'Faible lactose',
  gluten_free: 'Sans gluten',
  custom_strict: 'Règles personnelles strictes',
};

export const RULE_DESCRIPTIONS: Record<RuleId, string> = {
  vegetarian: 'Bloque viande, poisson, crustacés, mollusques, bouillons de viande et gélatine animale probable.',
  vegan: 'Bloque tous les produits animaux : viande, poisson, lait, œufs, miel, gélatine, fromage, beurre.',
  pescetarian: 'Autorise poisson/fruits de mer mais bloque viande terrestre.',
  no_pork: 'Bloque porc explicite et dérivés probables.',
  no_beef: 'Bloque bœuf et veau.',
  no_alcohol: 'Bloque alcool explicite et met en alerte les recettes au vin/bière/spiritueux.',
  halal: 'Bloque porc/alcool et met en alerte les viandes non certifiées, gélatine, bouillons et contamination selon niveau strict.',
  kosher: 'Met en alerte porc, fruits de mer, viande non certifiée, mélanges lait/viande et sources inconnues.',
  christian_lent: 'Option pratique personnelle : alerte viande terrestre, surtout utile certains jours/périodes.',
  hindu_no_beef: 'Bloque bœuf/veau et met en alerte bouillons ou graisses animales inconnues.',
  low_lactose: 'Alerte lait, crème, fromage, beurre, yaourt et sauces lactées.',
  gluten_free: 'Alerte blé/farine/pain/pâte/panure/couscous et contamination de friture.',
  custom_strict: 'Applique les termes interdits et termes à vérifier ajoutés par l’utilisateur.',
};

export const STRICTNESS_LABELS: Record<Strictness, string> = {
  relaxed: 'Souple',
  normal: 'Normal',
  strict: 'Strict',
};

export const DEFAULT_PROFILE: UserProfile = {
  id: 'profile-halal-veg-lactose',
  name: 'Moi · végétarien halal lactose',
  rules: ['vegetarian', 'halal', 'no_alcohol', 'low_lactose'],
  allergens: [],
  intolerances: ['milk'],
  strictness: 'normal',
  customForbiddenTerms: ['porc', 'jambon', 'bacon', 'alcool'],
  customCautionTerms: ['sauce maison', 'bouillon', 'gélatine', 'fromage', 'crème'],
  enabled: true,
  color: '#74f7b0',
};
