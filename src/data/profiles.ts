import type { UserProfile } from '../types';

export function cloneProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    rules: [...profile.rules],
    allergens: [...profile.allergens],
    intolerances: [...profile.intolerances],
    customForbiddenTerms: [...profile.customForbiddenTerms],
    customCautionTerms: [...profile.customCautionTerms],
  };
}
