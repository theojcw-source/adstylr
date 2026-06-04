# StyleForge Comfy on fal

This folder is the ComfyUI backend that StyleForge can call through `/api/comfy/generate`.

## Run once locally

```bash
pip install fal
fal auth login
fal run fal-comfy/app.py
```

## Deploy

```bash
fal deploy fal-comfy/app.py
```

Then copy the deployed endpoint id into `.env.local`:

```bash
FAL_COMFY_ENDPOINT="your-username/styleforge-comfy/generate"
```

## Replace the workflow

Export a ComfyUI workflow with **Save (API Format)** and replace `workflow.json`.
Then update the node IDs at the top of `app.py`:

```py
POSITIVE_PROMPT_NODE = "6"
NEGATIVE_PROMPT_NODE = "7"
LATENT_NODE = "5"
SAMPLER_NODE = "13"
STEPS_NODE = "22"
```

The Next app sends:

- `prompt`
- `negative_prompt`
- `width`
- `height`
- `num_images`
- `num_inference_steps`
- `guidance_scale`
- `output_format`
- `loras`

The scaffold currently maps prompt, size, batch, seed, cfg, and steps. Add LoRA node mapping once the final Comfy graph is chosen.
