# Adstylr

Adstylr is a [Next.js](https://nextjs.org) app for AI-assisted ad generation, brand overlays, and creative monitoring workflows.

## Getting Started

StyleForge can run image generation through your local ComfyUI server while you iterate.
Set this in `.env.local`:

```bash
COMFY_LOCAL_URL="http://127.0.0.1:8000"
```

The Next route reads `fal-comfy/workflow.json`, queues it on ComfyUI, polls `/history`, and proxies output images through `/api/comfy/view`.
Each generation is also copied into two local delivery folders:

```bash
public/generated/clean
public/generated/branded
```

The Next API upscales the clean image to the delivery size first, then creates the branded version from that upscaled image. The Comfy workflow stays focused on generation and cleanup; DA/branding is never resized after it has been applied.

For remote models inside ComfyUI, install custom nodes in your ComfyUI user directory. Example setup:

```bash
cd /path/to/ComfyUI/custom_nodes
git clone https://github.com/gokayfem/ComfyUI-fal-API.git
/path/to/ComfyUI/.venv/bin/python -m pip install -r ComfyUI-fal-API/requirements.txt
```

Then put your fal key in `ComfyUI-fal-API/config.ini` or expose `FAL_KEY` when launching ComfyUI. Restart ComfyUI and search for the `FAL` nodes.

If you later get fal Serverless access, StyleForge can also run the same workflow through a ComfyUI backend deployed on fal. Set both variables in `.env.local`:

```bash
FAL_KEY="..."
FAL_COMFY_ENDPOINT="your-username/styleforge-comfy/generate"
```

The starter fal backend lives in `fal-comfy/`. Deploy it with:

```bash
python3 -m pip install fal
python3 -m fal auth login
python3 -m fal deploy fal-comfy/app.py
```

Collected monitoring data is generated locally into `public/data/*.json` and is intentionally ignored for the public repository.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
