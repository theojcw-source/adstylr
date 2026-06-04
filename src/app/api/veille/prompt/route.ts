import { supabase } from "@/lib/supabase";

type PromptRequest = {
  advertiserName?: string;
  copy?: string;
  imageUrl?: string;
  tags?: string[];
};

type AnthropicTextBlock = {
  text?: string;
  type?: string;
};

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const COPY_MAX_CHARS = 180;
const CTA_MAX_CHARS = 20;
const NO_GENERATED_TEXT_RULE =
  "Interdiction absolue dans l'image generee: aucun texte lisible, aucune lettre, aucun mot, aucun slogan, aucun logo, aucune typographie, aucune affiche avec ecriture; garder seulement des zones graphiques neutres pour le branding ajoute ensuite.";
const ATELIER_STYLE_BRIEF = [
  "Brief Atelier de Sevres a respecter:",
  "- Ecole d'art et d'animation a Paris 6e, fondee en 1979; prepas, bachelors, masteres; 92% de reussite aux concours en 2025 si un chiffre est utile.",
  "- Positionnement: exigence academique + liberte creative; artistes singuliers et employables; ni institution froide, ni atelier bohème sans structure.",
  "- Valeurs a incarner: emancipation creative, exigence bienveillante, ancrage professionnel, vivacite parisienne, pratique en atelier.",
  "- Ton: inspirant, direct, humain. Concis, concret, jamais agressif, jamais academique froid, jamais langage jeune force.",
  "- Lexique utile: atelier, sensibilite artistique, langage visuel, singularite, style personnel, experimentation, concours, reconnaissance, suivi personnalise, professionnels de terrain, Quartier Latin, Paris artistique, dossier personnel, prepa.",
  "- Eviter: excellence, passion, leader, solution, reveler votre potentiel, accompagnement sur-mesure, curriculum, boost, synergies, holistic.",
  "- Visuel: lumiere naturelle diffuse, profondeur de champ maitrisee, grain fin possible, tons legerement desatures, composition centree sur le geste et la pratique.",
  "- Montrer: etudiants en train de creer, mains, croquis, outils, matieres, storyboard, peinture, 3D, stop-motion, ateliers vivants, Paris comme campus elargi.",
  "- Ne pas montrer: amphis generiques, sourires stock-camera, visuels trop tech/futuristes, images corporate, violence ou contenu offensant.",
  "- Palette DA: creme #F8F5F0, noir profond #1A1A1A, terracotta #C85A3A, graphite #4A4A4A, or mat #B8973A.",
  "- Regle qualite: si le contenu pourrait s'appliquer a n'importe quelle ecole d'art, il est trop generique.",
].join("\n");

function mediaTypeFromPath(storagePath: string) {
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
}

async function downloadFromStorage(storagePath: string) {
  const { data, error } = await supabase.storage.from("images").download(storagePath);
  if (error || !data) throw new Error("Impossible de lire l'image source (storage).");
  const buffer = Buffer.from(await data.arrayBuffer());
  return { data: buffer.toString("base64"), mediaType: mediaTypeFromPath(storagePath) };
}

async function imageToBase64(imageUrl: string, requestUrl: string) {
  // Proxy URL: /api/images/path → download from Supabase storage directly (no auth cookie needed server-side)
  if (imageUrl.startsWith("/api/images/")) {
    const storagePath = imageUrl.slice("/api/images/".length).split("?")[0] ?? "";
    return downloadFromStorage(storagePath);
  }

  // Legacy or current Supabase storage URL → extract path and download via SDK
  const storageMarker = "/storage/v1/object/public/images/";
  const markerIdx = imageUrl.indexOf(storageMarker);
  if (markerIdx >= 0) {
    const storagePath = imageUrl.slice(markerIdx + storageMarker.length).split("?")[0] ?? "";
    return downloadFromStorage(storagePath);
  }

  // External URL (Meta, TikTok preview) → fetch directly
  const url = new URL(imageUrl, requestUrl);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Impossible de lire l'image source (${response.status}).`);
  const mediaType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const supportedTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  if (!supportedTypes.has(mediaType)) throw new Error(`Format image non supporte par Claude Vision: ${mediaType}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { data: buffer.toString("base64"), mediaType };
}

type ClaudePromptDecision = {
  analysis?: string;
  angle?: string;
  branding?: ClaudeBrandingRecipe;
  copy?: string;
  cta?: string;
  lora_reason?: string;
  prompt?: string;
  use_lora?: boolean;
  visual_brief?: ClaudeVisualBrief;
};

type ClaudeBrandingRecipe = {
  colorBlocks?: unknown[];
  da_notes?: string;
  gradients?: {
    bottomOpacity?: unknown;
    topOpacity?: unknown;
  };
};

type ClaudeVisualBrief = {
  action?: unknown;
  atmosphere?: unknown;
  materials?: unknown;
  scene?: unknown;
  setting?: unknown;
  subjects?: unknown;
};

function parseClaudeJson(text: string) {
  try {
    return JSON.parse(text) as ClaudePromptDecision;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { prompt: text.trim() };
    try {
      return JSON.parse(match[0]) as ClaudePromptDecision;
    } catch {
      return { prompt: text.trim() };
    }
  }
}

function compactText(value: unknown, maxChars: number) {
  const text = (typeof value === "string" ? value : "").trim().replace(/\s+/g, " ");
  if (!text || text.length <= maxChars) return text;

  const clipped = text.slice(0, maxChars + 1);
  const wordBoundary = clipped.lastIndexOf(" ");
  return clipped.slice(0, wordBoundary > maxChars * 0.58 ? wordBoundary : maxChars).trim().replace(/[,:;.!?]+$/, "");
}

function usableObservedCopy(value: unknown, advertiserName?: string) {
  const text = (typeof value === "string" ? value : "").trim().replace(/\s+/g, " ");
  if (!text) return "";

  const lower = text.toLowerCase();
  if (lower.includes("meta ads library") || lower.includes("crea meta")) return "";
  if (advertiserName && lower === advertiserName.toLowerCase()) return "";
  return compactText(text, COPY_MAX_CHARS);
}

function readBriefValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => typeof item === "string" ? [item.trim()] : [])
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
  }

  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function buildPromptFromVisualBrief(brief: ClaudeVisualBrief | undefined, fallbackPrompt: string | undefined) {
  const scene = readBriefValue(brief?.scene);
  const subjects = readBriefValue(brief?.subjects);
  const action = readBriefValue(brief?.action);
  const setting = readBriefValue(brief?.setting);
  const materials = readBriefValue(brief?.materials);
  const atmosphere = readBriefValue(brief?.atmosphere);

  const visualParts = [
    scene && `scene: ${scene}`,
    subjects && `sujets: ${subjects}`,
    action && `action: ${action}`,
    setting && `lieu: ${setting}`,
    materials && `matieres: ${materials}`,
    atmosphere && `ambiance: ${atmosphere}`,
  ].filter(Boolean);

  if (visualParts.length === 0) return fallbackPrompt?.trim() ?? "";

  return [
    "Publicite verticale originale pour Atelier de Sevres, ecole d'art et d'animation a Paris.",
    visualParts.join("; "),
    "Photographie editoriale contemporaine, naturelle, sensible, vivante, avec la LoRA Atelier.",
    "Image sans texte lisible, sans lettres, sans logo, sans watermark.",
  ].join(" ");
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ message: "ANTHROPIC_API_KEY n'est pas configuree." }, { status: 503 });
  }

  const body = (await request.json()) as PromptRequest;
  if (!body.imageUrl && !body.copy) {
    return Response.json({ message: "Image ou copy requise." }, { status: 400 });
  }

  try {
    const content: unknown[] = [];

    if (body.imageUrl) {
      const image = await imageToBase64(body.imageUrl, request.url);
      content.push({
        source: {
          data: image.data,
          media_type: image.mediaType,
          type: "base64",
        },
        type: "image",
      });
    }

    content.push({
      text: [
        "Analyse cette publicite concurrente pour decrire son intention et proposer une nouvelle creation text-to-img Atelier, libre et non litterale.",
        `Annonceur source: ${body.advertiserName || "inconnu"}.`,
        body.tags?.length ? `Categorie: ${body.tags.join(", ")}.` : "",
        body.copy ? `Copy observee: ${body.copy}` : "",
        "",
        ATELIER_STYLE_BRIEF,
        "",
        "Retourne uniquement un JSON valide avec ces champs:",
        "- analysis: description courte de ce que montre l'image et du mecanisme publicitaire",
        "- angle: angle marketing a retenir",
        '- visual_brief: description factuelle de ce que tu vois dans l image, format { "scene": "...", "subjects": "...", "action": "...", "setting": "...", "materials": "...", "atmosphere": "..." }',
        `- copy: texte principal lu directement dans l'image concurrente par Claude Vision, mot pour mot autant que possible, jusqu'a ${COPY_MAX_CHARS} caracteres; si plusieurs textes importants sont visibles, conserve l'accroche complete et les segments utiles, ignore seulement mentions legales, URL, prix parasites et metadata`,
        `- cta: CTA ultra court Atelier de Sevres, maximum 3 mots et ${CTA_MAX_CHARS} caracteres`,
        "- prompt: optionnel; si tu le fournis, il doit etre une reformulation directe de visual_brief, sans inventer un autre concept",
        '- branding: recette CSS/overlay inspiree de la DA concurrente mais traduite en DA Atelier, format { "da_notes": "...", "gradients": { "topOpacity": 0-1.2, "bottomOpacity": 0-1.2 }, "colorBlocks": [{ "id": "css-1", "color": "cream|black|terracotta|graphite|gold|white", "x": 0-1080, "y": 0-1920, "width": 12-1400, "height": 12-1400, "opacity": 0-1, "radius": 0-120 }] }',
        "- use_lora: true par defaut pour appliquer la DA publicitaire Atelier via LoRA",
        "- lora_reason: justification courte indiquant que la LoRA Atelier structure la qualite publicitaire",
        "",
        "Regles importantes:",
        NO_GENERATED_TEXT_RULE,
        "- le prompt image ne doit pas mentionner l'annonceur concurrent, ni demander de reproduire la composition exacte",
        "- le prompt image doit rester en 1 a 2 phrases maximum",
        "- le prompt image doit explicitement demander une image sans texte lisible et sans logo",
        "- visual_brief doit etre connecte a l'image: pas de scene generique si tu vois une personne, un objet, une posture, un decor ou une matiere precise",
        "- ne change pas de sujet entre visual_brief et prompt; le prompt final sera construit cote serveur depuis visual_brief",
        "- lis le texte visible pour remplir le champ copy; cette copy servira uniquement d'overlay ajoute apres generation, pas de texte dessine dans l'image IA",
        "- si la copy observee est fournie mais que l'image contient une accroche plus claire, privilegie ce que tu lis dans l'image",
        "- ne traduis pas, ne reformule pas, ne rends pas la copy plus Atelier: branche le texte lu dans l'image concurrente tel quel",
        "- ne produis pas de phrase longue pour la copy: pas de sous-titre, pas de virgule, pas de proposition explicative",
        "- ne conserve pas la composition de maniere reconnaissable; inspire-toi seulement de l'intention publicitaire",
        "- ne reproduis pas les logos, noms de marque concurrents, slogans ou textes visibles",
        "- pour branding, lis la grammaire DA concurrente (aplat, cadre, cartouche, marge, densite, contraste), mais utilise uniquement les couleurs Atelier: cream, black, terracotta, graphite, gold, white",
        "- branding ne doit contenir aucun texte et aucun logo; uniquement gradients et blocs CSS decoratifs",
      ].filter(Boolean).join("\n"),
      type: "text",
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify({
        max_tokens: 1100,
        messages: [{ content, role: "user" }],
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        system:
          `Tu prepares des prompts text-to-img courts pour des social ads Atelier de Sevres. Pour le champ copy, tu fais de l'OCR: tu renvoies le texte principal visible dans l'image source, sans le reformuler. Cette copy est un overlay applicatif separe et ne doit jamais etre demandee dans l'image generee. Le prompt image doit etre libre, original, non litteral, et ne pas chercher a refaire la publicite source. ${NO_GENERATED_TEXT_RULE} Tu renvoies un JSON strict sans markdown.`,
      }),
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      method: "POST",
    });

    const payload = await response.json();
    if (!response.ok) {
      return Response.json(
        {
          message: payload?.error?.message || "Claude Vision indisponible.",
        },
        { status: response.status },
      );
    }

    const text = (payload.content || [])
      .map((block: AnthropicTextBlock) => (block.type === "text" ? block.text || "" : ""))
      .join("\n")
      .trim();
    const parsed = parseClaudeJson(text);
    const observedCopy = usableObservedCopy(body.copy, body.advertiserName);
    const connectedPrompt = buildPromptFromVisualBrief(parsed.visual_brief, parsed.prompt || text);

    return Response.json({
      analysis: parsed.analysis || "",
      angle: parsed.angle || "",
      copy: compactText(parsed.copy, COPY_MAX_CHARS) || observedCopy,
      cta: compactText(parsed.cta, CTA_MAX_CHARS),
      branding: parsed.branding ?? null,
      loraReason: parsed.lora_reason || "LoRA Atelier activee pour garder une DA publicitaire coherente.",
      prompt: [connectedPrompt, NO_GENERATED_TEXT_RULE].filter(Boolean).join(" "),
      useLora: parsed.use_lora !== false,
      visualBrief: parsed.visual_brief ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        message: error instanceof Error ? error.message : "Erreur inconnue pendant l'analyse Claude.",
      },
      { status: 500 },
    );
  }
}
