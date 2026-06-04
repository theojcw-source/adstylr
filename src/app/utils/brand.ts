import type { Brand, PublishedStyle } from "../types";

export function normalizeOrganizationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function getBrandStyleScore(brand: Brand, style: PublishedStyle) {
  const brandKeys = [brand.id, brand.name]
    .map(normalizeOrganizationKey)
    .filter(Boolean);
  const styleKeys = [style.id, style.name, style.triggerWord, style.school ?? ""]
    .map(normalizeOrganizationKey)
    .filter(Boolean);

  return brandKeys.reduce((bestScore, brandKey) => {
    const score = styleKeys.reduce((currentScore, styleKey) => {
      if (!styleKey || !brandKey) {
        return currentScore;
      }

      if (styleKey === brandKey) {
        return Math.max(currentScore, 3);
      }

      if (styleKey.includes(brandKey) || brandKey.includes(styleKey)) {
        return Math.max(currentScore, 2);
      }

      return currentScore;
    }, 0);

    return Math.max(bestScore, score);
  }, 0);
}

export function findStyleForBrand(brand: Brand, styles: PublishedStyle[]) {
  return styles.reduce<{ score: number; style: PublishedStyle | null }>(
    (best, style) => {
      const score = getBrandStyleScore(brand, style);
      return score > best.score ? { score, style } : best;
    },
    { score: 0, style: null },
  ).style;
}
