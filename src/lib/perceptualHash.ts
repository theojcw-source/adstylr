// Client-side perceptual hashing via Zig WASM.
// Uses dHash: resize to 9×8, compare adjacent pixel luminance.
// Hamming distance ≤ 10 → likely duplicate; ≤ 20 → visually similar.

type PerceptualWasm = {
  memory: WebAssembly.Memory;
  getPixelBufPtr: () => number;
  dHash: () => bigint;
  hammingDistance: (a: bigint, b: bigint) => number;
};

let wasm: PerceptualWasm | null = null;

async function getWasm(): Promise<PerceptualWasm> {
  if (wasm) return wasm;
  const res = await fetch("/wasm/perceptual.wasm");
  const { instance } = await WebAssembly.instantiateStreaming(res);
  wasm = instance.exports as unknown as PerceptualWasm;
  return wasm;
}

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function renderTo9x8(bitmap: ImageBitmap): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(9, 8);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, 9, 8);
  return ctx.getImageData(0, 0, 9, 8).data;
}

export async function hashFile(file: File): Promise<bigint> {
  const w = await getWasm();
  const bitmap = await fileToImageBitmap(file);
  const pixels = renderTo9x8(bitmap);
  bitmap.close();

  const ptr = w.getPixelBufPtr();
  const buf = new Uint8Array(w.memory.buffer, ptr, 9 * 8 * 4);
  buf.set(pixels);

  return w.dHash();
}

export async function hammingDistance(a: bigint, b: bigint): Promise<number> {
  const w = await getWasm();
  return w.hammingDistance(a, b);
}

export type DuplicateGroup = { files: File[]; hash: bigint };

/** Groups files by visual similarity. threshold=10 catches dupes; 20 catches variants. */
export async function findDuplicates(
  files: File[],
  threshold = 10,
): Promise<DuplicateGroup[]> {
  const entries: { file: File; hash: bigint }[] = await Promise.all(
    files.map(async (f) => ({ file: f, hash: await hashFile(f) })),
  );

  const w = await getWasm();
  const groups: DuplicateGroup[] = [];
  const used = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue;
    const group: DuplicateGroup = { files: [entries[i].file], hash: entries[i].hash };
    for (let j = i + 1; j < entries.length; j++) {
      if (used.has(j)) continue;
      const dist = w.hammingDistance(entries[i].hash, entries[j].hash);
      if (dist <= threshold) {
        group.files.push(entries[j].file);
        used.add(j);
      }
    }
    if (group.files.length > 1) groups.push(group);
    used.add(i);
  }

  return groups;
}
