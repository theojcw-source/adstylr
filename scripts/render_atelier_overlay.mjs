import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const configPath = "public/brand/atelier-de-sevres/overlay-config.json";
const editableSvgPath = "public/brand/atelier-de-sevres/overlay-editable.svg";
const logoOutput = "public/brand/atelier-de-sevres/logo.png";
const taglineOutput = "public/brand/atelier-de-sevres/tagline.png";
const assets = {
  "logo-original": { file: "logo-original.png", width: 917, height: 596 },
  "ads-logo": { file: "ads-logo.svg", width: 1105, height: 632 },
  "event-original": { file: "event-original.png", width: 724, height: 467 },
  "jpo-4-dates-v1": { file: "jpo-4-dates-v1.svg", width: 790, height: 922 },
  "jpo-4-dates-v2": { file: "jpo-4-dates-v2.svg", width: 975, height: 666 },
  "admissions-ouvertes": { file: "admissions-ouvertes.svg", width: 916, height: 369 },
  "hors-parcoursup": { file: "hors-parcoursup.svg", width: 756, height: 374 },
  "clair-cta": { file: "clair-cta.svg", width: 836, height: 375 },
  "prepa-art": { file: "prepa-art.svg", width: 786, height: 490 },
  "prepa-anim": { file: "prepa-anim.svg", width: 986, height: 630 },
  "stage-decouverte": { file: "stage-decouverte.svg", width: 1054, height: 754 },
};
const defaultConfig = {
  atelierLogo: { assetId: "logo-original", scaleX: 1, scaleY: 1, x: 110, y: 210 },
  eventBlock: { assetId: "event-original", scaleX: 1, scaleY: 1, x: 78, y: 896 },
};
const defaultGradients = {
  bottomOpacity: 1,
  topOpacity: 1,
};
function getAsset(block, fallback) {
  return assets[block.assetId] ?? assets[fallback];
}

async function readConfig() {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    const blocks = parsed.blocks ?? parsed;
    return {
      blocks: {
        atelierLogo: { ...defaultConfig.atelierLogo, ...blocks.atelierLogo },
        eventBlock: { ...defaultConfig.eventBlock, ...blocks.eventBlock },
      },
      gradients: { ...defaultGradients, ...parsed.gradients },
    };
  } catch {
    return { blocks: defaultConfig, gradients: defaultGradients };
  }
}

function editableSvg(config) {
  const logo = getAsset(config.atelierLogo, "logo-original");
  const event = getAsset(config.eventBlock, "event-original");

  return `<svg width="1080" height="1920" viewBox="0 0 1080 1920" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g id="atelier-logo" transform="translate(${config.atelierLogo.x} ${config.atelierLogo.y}) scale(${config.atelierLogo.scaleX} ${config.atelierLogo.scaleY})">
    <image href="assets/${logo.file}" width="${logo.width}" height="${logo.height}"/>
  </g>
  <g id="event-block" transform="translate(${config.eventBlock.x} ${config.eventBlock.y}) scale(${config.eventBlock.scaleX} ${config.eventBlock.scaleY})">
    <image href="assets/${event.file}" width="${event.width}" height="${event.height}"/>
  </g>
</svg>
`;
}

const storedConfig = await readConfig();
const config = storedConfig.blocks;
const selectedLogoAsset = getAsset(config.atelierLogo, "logo-original");
const selectedEventAsset = getAsset(config.eventBlock, "event-original");
await writeFile(configPath, `${JSON.stringify(storedConfig, null, 2)}\n`);
await writeFile(editableSvgPath, editableSvg(config));

const logo = await sharp(`public/brand/atelier-de-sevres/assets/${selectedLogoAsset.file}`)
  .resize({
    width: Math.round(selectedLogoAsset.width * config.atelierLogo.scaleX),
    height: Math.round(selectedLogoAsset.height * config.atelierLogo.scaleY),
    fit: "fill",
  })
  .png()
  .toBuffer();
const eventBlock = await sharp(`public/brand/atelier-de-sevres/assets/${selectedEventAsset.file}`)
  .resize({
    width: Math.round(selectedEventAsset.width * config.eventBlock.scaleX),
    height: Math.round(selectedEventAsset.height * config.eventBlock.scaleY),
    fit: "fill",
  })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 1080,
    height: 1920,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: logo, left: config.atelierLogo.x, top: config.atelierLogo.y },
    { input: eventBlock, left: config.eventBlock.x, top: config.eventBlock.y },
  ])
  .png()
  .toFile(logoOutput);

await sharp({
  create: {
    width: 1080,
    height: 1920,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .png()
  .toFile(taglineOutput);

console.log(`Rendered ${logoOutput}`);
