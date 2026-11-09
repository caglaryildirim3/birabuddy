/** Translate drink category/type keys stored in English (constants/drinks.js). */
export function translateDrinkCategory(t, category) {
  if (!category) return '';
  return t(`drinks.categories.${category}`, { defaultValue: category });
}

export function translateDrinkType(t, type) {
  if (!type) return '';
  return t(`drinks.types.${type}`, { defaultValue: type });
}
