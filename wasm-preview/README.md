# StyleForge WASM Preview

Rust renderer for instant browser previews.

This module is scoped to the live editor preview. It does not generate final
exports; the Go renderer remains the server export path. The goal is fast
feedback while dragging, zooming, and tweaking branding layers.

## What It Does Now

- accepts source image pixels as RGBA `ImageData`
- cover/contain fit
- image transform: scale, x, y
- vertical gradients
- color blocks
- returns a RGBA buffer for `<canvas>`

Overlays and text are the next step. They should use the same JSON shape as the
Go renderer so preview and export stay aligned.

## Install Tooling

If Rust is not available globally, install it in your user space:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
```

## Build

From the repo root:

```bash
npm run preview:wasm:build
```

Generated files under `public/wasm/styleforge-preview` are build artifacts until
the front integration is finalized.
