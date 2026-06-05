# Adstylr

Adstylr est une application Next.js pour generer, decliner et suivre des creations publicitaires. Le projet a ete monte rapidement: certaines briques sont fonctionnelles, d'autres sont encore experimentales ou partiellement cablees.

## Vue d'ensemble

L'application principale est dans `src/app`. Elle fournit un dashboard, des routes API Next.js, une page de veille publicitaire, des outils de generation d'images et des workflows de branding.

Les briques principales sont:

- `src/app`: interface Next.js et routes API.
- `src/lib/supabase*.ts`: clients Supabase serveur et navigateur.
- `fal-comfy/`: workflow ComfyUI et backend fal.ai optionnel.
- `go-renderer/`: moteur Go de rendu/declinaison d'images.
- `scripts/`: scripts de collecte, synchro Supabase, import/export et maintenance.
- `public/wasm/` et `wasm-preview/`: preview WASM utilisee par certains outils.
- `supabase/`: config locale Supabase et migrations.

## Installation locale

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

L'application tourne ensuite sur:

```txt
http://localhost:3000
```

Les variables de `.env.local` doivent etre completees selon les parties que l'on veut utiliser. Sans Supabase, plusieurs routes API et pages du dashboard ne fonctionneront pas.

## Variables d'environnement

Variables importantes:

```bash
FAL_KEY=
REPLICATE_API_KEY=
REPLICATE_DESTINATION=theojcw-source/styleforge-loras
FAL_COMFY_ENDPOINT=
FACE_RESTORE=false

COMFY_LOCAL_URL=http://127.0.0.1:8000
COMFY_POSITIVE_PROMPT_NODE=6
COMFY_NEGATIVE_PROMPT_NODE=7
COMFY_LATENT_NODE=5
COMFY_SAMPLER_NODE=13
COMFY_STEPS_NODE=22
COMFY_UPSCALE_NODE=3

RENDERER_URL=
STYLEFORGE_RENDERER_BIN=

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Supabase est aussi attendu par plusieurs routes, meme si les variables ne sont pas toutes listees dans `.env.local.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Generation d'images

Le flux fal.ai est fonctionnel et a deja servi a generer beaucoup d'images. Les routes de generation utilisent `FAL_KEY` cote serveur pour appeler les modeles fal.ai, puis persistent les resultats et les versions brandees.

Variables fal.ai principales:

```bash
FAL_KEY=
REPLICATE_API_KEY=
REPLICATE_DESTINATION=theojcw-source/styleforge-loras
FACE_RESTORE=false
```

Le point d'entree principal cote app est `POST /api/comfy/generate`. Le nom de la route vient de l'integration Comfy, mais elle gere aussi les appels fal.ai directs selon le modele demande et la configuration disponible.

## Analyse concurrente avec Claude

La page de veille ne se contente pas d'afficher des pubs concurrentes: elle utilise aussi Claude Vision pour transformer une creation concurrente en brief exploitable pour generer une nouvelle creation Atelier de Sevres.

Variables necessaires:

```bash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Le flux principal est dans `src/app/veille/page.tsx`:

1. L'utilisateur selectionne une creation concurrente dans la veille.
2. L'app appelle `POST /api/veille/prompt`.
3. Claude Vision analyse l'image concurrente, lit la copy principale, decrit le mecanisme creatif et renvoie un JSON.
4. Le serveur construit un prompt text-to-image Atelier, non litteral, sans logo concurrent et sans texte dans l'image generee.
5. L'app lance ensuite la generation d'image via le flux fal.ai/Comfy selon la configuration.
6. Le branding applicatif ajoute la copy, le CTA, les overlays et la DA Atelier apres generation.

La route `src/app/api/veille/prompt/route.ts` demande a Claude de renvoyer notamment:

- `analysis`: lecture courte de la publicite concurrente.
- `angle`: angle marketing a retenir.
- `visual_brief`: description factuelle de la scene, des sujets, des matieres et de l'ambiance.
- `copy`: texte principal lu dans l'image concurrente par OCR Claude Vision.
- `cta`: CTA court adapte a Atelier.
- `prompt`: prompt image optionnel, ensuite reconstruit cote serveur depuis `visual_brief`.
- `branding`: recette de DA inspiree de la grammaire concurrente mais traduite en palette Atelier.
- `use_lora` et `lora_reason`: activation de la LoRA Atelier pour garder une coherence publicitaire.

Une deuxieme route, `src/app/api/veille/refine-branding/route.ts`, peut relire le rendu final image + branding. Claude sert alors de DA senior pour ajuster le placement typographique, le CTA et les zones de texte sans reformuler la copy issue de l'OCR.

Regle importante du flux: Claude peut s'inspirer de l'intention publicitaire concurrente, mais ne doit pas demander de reproduire la composition exacte, les logos, les marques, les slogans ou les textes visibles. Le texte est ajoute ensuite par l'application, pas genere dans l'image IA.

## ComfyUI local

ComfyUI peut aussi tourner en parallele de Next.js pour generer localement. Cette partie est utile pour iterer sur un workflow Comfy sans passer par un backend distant. Elle est plus sensible au workflow JSON et aux IDs de nodes, donc a retester de bout en bout lors d'une reprise.

Chemin prevu:

1. Lancer ComfyUI localement.
2. Exposer son serveur HTTP, par exemple `http://127.0.0.1:8000`.
3. Renseigner `COMFY_LOCAL_URL=http://127.0.0.1:8000` dans `.env.local`.
4. Lancer Next.js avec `npm run dev`.
5. Les generations passent par `POST /api/comfy/generate`.

La route `src/app/api/comfy/generate/route.ts` lit le workflow local `fal-comfy/workflow.json`, le pousse dans ComfyUI, poll `/history`, puis proxy les images via `/api/comfy/view`.

Les IDs de nodes Comfy sont configurables:

```bash
COMFY_POSITIVE_PROMPT_NODE=6
COMFY_NEGATIVE_PROMPT_NODE=7
COMFY_LATENT_NODE=5
COMFY_SAMPLER_NODE=13
COMFY_STEPS_NODE=22
COMFY_UPSCALE_NODE=3
```

Si `COMFY_LOCAL_URL` n'est pas configure pour ce flux Comfy, la route peut passer par un backend Comfy deploye sur fal.ai avec `FAL_COMFY_ENDPOINT` et `FAL_KEY`. Le dossier `fal-comfy/` contient ce backend fal.ai possible pour executer un workflow Comfy a distance.

## Place de Go dans le projet

Le dossier `go-renderer/` contient un moteur de rendu ecrit en Go. Son role n'est pas de generer l'image avec IA, mais de produire des variantes deterministes a partir d'une image source et d'une config JSON: story, feed, square, overlays, gradients, blocs de couleur, exports brandes, etc.

Il existe deux modes:

### Mode CLI local

La route Next `POST /api/render/variants` peut lancer le renderer Go localement.

Par defaut, elle execute:

```bash
cd go-renderer
go run ./cmd/styleforge-render -config examples/atelier.config.json
```

Commandes utiles:

```bash
npm run render:go
npm run render:go:build
```

Apres build, on peut pointer Next vers le binaire:

```bash
STYLEFORGE_RENDERER_BIN=./bin/styleforge-render
```

Si `STYLEFORGE_RENDERER_BIN` n'est pas defini, la route essaie `GO_BIN`, puis un Go local dans `$HOME/.local/go-toolchain/go/bin/go`, puis `go` dans le `PATH`.

### Mode serveur HTTP distant

Le renderer Go peut aussi tourner comme service HTTP:

```bash
npm run render:go:server
```

Il expose:

```txt
GET  /healthz
POST /render
```

Quand `RENDERER_URL` est defini, `src/app/api/render/variants/route.ts` envoie le rendu a ce serveur distant au lieu de lancer Go localement. Le service renvoie les fichiers en base64, puis Next les upload dans Supabase Storage sous `images/variants/...`.

Le repo contient `render.yaml` et `go-renderer/Dockerfile` pour deployer ce service sur Render. A ce stade, je n'ai pas trouve d'URL reelle de serveur Go distant dans le repo: `RENDERER_URL` est vide dans `.env.local.example`. L'URL `https://styleforge-renderer.onrender.com` mentionnee dans `go-renderer/README.md` est un exemple, pas une valeur d'env active.

## Donnees de veille

Les donnees collectees pour la veille ne sont pas versionnees dans le repo public:

```txt
public/data/*.json
data/advertisers.json
data/manual-meta/
```

Les scripts peuvent recreer ces fichiers localement:

- `scripts/collect.py`
- `scripts/sync_supabase_veille_ads.mjs`
- `scripts/import_firecrawl_meta_ads.mjs`

Ces fichiers peuvent contenir des URLs signees, des resultats de scraping ou des donnees operationnelles. Ils restent ignores volontairement.

## Scripts utiles

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run render:atelier-overlay
npm run render:go
npm run render:go:server
npm run backfill:clean
```

Les scripts Python utilisent `scripts/requirements.txt`.

## Licence

Ce projet est distribue sous licence Apache-2.0. Voir `LICENSE`.

## Points a verifier en reprise

- Verifier que les variables Supabase necessaires sont bien documentees et coherentes entre frontend, API routes et scripts.
- Tester le flux ComfyUI local de bout en bout: lancement ComfyUI, `COMFY_LOCAL_URL`, workflow JSON, node IDs, generation, proxy `/api/comfy/view`, persistence Supabase.
- Decider si le renderer Go doit rester lance localement, etre build en binaire, ou etre deploye en service HTTP avec `RENDERER_URL`.
- Verifier les policies RLS Supabase avant toute exposition publique.
- Garder les donnees de veille et exports locaux hors Git.
