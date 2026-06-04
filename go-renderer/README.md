# StyleForge Go Renderer

Small image-declination engine for StyleForge.

It takes one clean source image plus a JSON render config and writes deterministic
variants: story, feed, square, thumbnails, branded exports, and so on.

This first pass intentionally uses only the Go standard library:

- PNG/JPEG input
- PNG/JPEG output
- cover/contain resize
- vertical gradients
- color blocks
- PNG/JPEG overlays

Text rendering and SVG overlays should come next with an explicit dependency
choice once the Go toolchain is installed locally.

## Usage

```bash
cd go-renderer
go run ./cmd/styleforge-render \
  -config examples/atelier.config.json
```

The command prints JSON:

```json
{
  "files": [
    {
      "id": "story",
    "path": "../../public/generated/variants/atelier-demo-story.png",
      "width": 1080,
      "height": 1920,
      "format": "png"
    }
  ]
}
```

Overrides are available for orchestration from Next or a worker:

```bash
go run ./cmd/styleforge-render \
  -config examples/atelier.config.json \
  -input ../public/generated/clean/source.png \
  -out ../public/generated/variants \
  -prefix styleforge-123
```

From the Next app, the renderer is exposed through:

```bash
curl -X POST http://localhost:3000/api/render/variants \
  -H "Content-Type: application/json" \
  -d '{
    "input": "/generated/clean/styleforge-1780498969724-1.png",
    "prefix": "atelier-demo"
  }'
```

By default the route runs `go run ./cmd/styleforge-render`. It uses `GO_BIN`
when set, otherwise it tries `$HOME/.local/go-toolchain/go/bin/go` before
falling back to `go` from `PATH`.

For production, build a binary and point the route at it:

```bash
npm run render:go:build
STYLEFORGE_RENDERER_BIN="./bin/styleforge-render"
```

## HTTP Server

For Vercel-compatible rendering, run the Go renderer as an HTTP service:

```bash
npm run render:go:server
```

It exposes:

```txt
GET  /healthz
POST /render
```

Next uses it when `RENDERER_URL` is set:

```bash
RENDERER_URL="https://styleforge-renderer.onrender.com"
```

The server accepts the same render config as the CLI. For private or proxied
source images, Next sends `inputDataBase64`, so the Go service does not need
cookies or direct access to `/api/images`.

## Render Free Deploy

This repo includes `render.yaml` and `go-renderer/Dockerfile`.

On Render:

1. Create a new Blueprint from the repo.
2. Render will use `render.yaml`.
3. Copy the resulting service URL.
4. Add it to Vercel as `RENDERER_URL`.

## Config Shape

```json
{
  "input": "../../public/generated/clean/source.png",
  "outputDir": "../../public/generated/variants",
  "prefix": "styleforge-123",
  "variants": [
    {
      "id": "story",
      "width": 1080,
      "height": 1920,
      "fit": "cover",
      "format": "png",
      "gradient": {
        "top": "#000000",
        "topOpacity": 0.2,
        "bottom": "#000000",
        "bottomOpacity": 0.5
      },
      "colorBlocks": [
        {
          "color": "#000000",
          "opacity": 0.35,
          "x": 0,
          "y": 1500,
          "width": 1080,
          "height": 420
        }
      ],
      "overlays": [
        {
          "path": "../../public/brand/atelier-de-sevres/assets/logo-original.png",
          "x": 110,
          "y": 210,
          "width": 400,
          "height": 180,
          "opacity": 1
        }
      ]
    }
  ]
}
```
