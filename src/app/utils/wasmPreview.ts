type WasmPreviewModule = {
  default: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<void>;
  render_preview: (
    configJson: string,
    sourceRgba: Uint8Array,
    sourceWidth: number,
    sourceHeight: number,
  ) => Uint8Array;
};

export type WasmPreviewConfig = {
  background?: string;
  colorBlocks?: Array<{
    color: string;
    height: number;
    opacity?: number;
    width: number;
    x: number;
    y: number;
  }>;
  fit?: "cover" | "contain";
  gradients?: {
    bottom?: string;
    bottomOpacity?: number;
    top?: string;
    topOpacity?: number;
  };
  height: number;
  imageTransform?: {
    scale?: number;
    x?: number;
    y?: number;
  };
  width: number;
};

let previewModulePromise: Promise<WasmPreviewModule> | null = null;

async function loadWasmPreview() {
  if (!previewModulePromise) {
    const importModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<WasmPreviewModule>;
    previewModulePromise = importModule("/wasm/styleforge-preview/styleforge_wasm_preview.js")
      .then(async (module: WasmPreviewModule) => {
        await module.default();
        return module;
      });
  }

  return previewModulePromise;
}

export async function renderWasmPreview(
  config: WasmPreviewConfig,
  source: ImageData,
) {
  const preview = await loadWasmPreview();
  const output = preview.render_preview(
    JSON.stringify(config),
    new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength),
    source.width,
    source.height,
  );

  return new ImageData(
    new Uint8ClampedArray(output),
    config.width,
    config.height,
  );
}
