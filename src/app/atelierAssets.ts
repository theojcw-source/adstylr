export const ATELIER_ASSETS = [
  {
    file: "logo-original.png",
    height: 596,
    id: "logo-original",
    label: "Logo ADS original",
    width: 917,
  },
  {
    file: "ads-logo.svg",
    height: 632,
    id: "ads-logo",
    label: "Logo ADS",
    width: 1105,
  },
  {
    file: "event-original.png",
    height: 467,
    id: "event-original",
    label: "Portes ouvertes original",
    width: 724,
  },
  {
    file: "jpo-4-dates-v1.svg",
    height: 922,
    id: "jpo-4-dates-v1",
    label: "JPO 4 dates V1",
    width: 790,
  },
  {
    file: "jpo-4-dates-v2.svg",
    height: 666,
    id: "jpo-4-dates-v2",
    label: "JPO 4 dates V2",
    width: 975,
  },
  {
    file: "admissions-ouvertes.svg",
    height: 369,
    id: "admissions-ouvertes",
    label: "Admissions ouvertes",
    width: 916,
  },
  {
    file: "hors-parcoursup.svg",
    height: 374,
    id: "hors-parcoursup",
    label: "Hors Parcoursup",
    width: 756,
  },
  {
    file: "clair-cta.svg",
    height: 375,
    id: "clair-cta",
    label: "Clair + CTA",
    width: 836,
  },
  {
    file: "prepa-art.svg",
    height: 490,
    id: "prepa-art",
    label: "Prepa Art",
    width: 786,
  },
  {
    file: "prepa-anim.svg",
    height: 630,
    id: "prepa-anim",
    label: "Prepa Anim",
    width: 986,
  },
  {
    file: "stage-decouverte.svg",
    height: 754,
    id: "stage-decouverte",
    label: "Stage decouverte",
    width: 1054,
  },
] as const;

export type AtelierAsset = (typeof ATELIER_ASSETS)[number];
export type AtelierAssetId = AtelierAsset["id"];

export const ATELIER_ASSET_BY_ID = Object.fromEntries(
  ATELIER_ASSETS.map((asset) => [asset.id, asset]),
) as Record<AtelierAssetId, AtelierAsset>;
