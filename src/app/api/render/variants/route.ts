import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const GO_RENDERER_DIR = path.join(ROOT_DIR, "go-renderer");
const DEFAULT_CONFIG_PATH = path.join(GO_RENDERER_DIR, "examples", "atelier.config.json");
const DEFAULT_OUTPUT_DIR = path.join(PUBLIC_DIR, "generated", "variants");
const TEMP_CONFIG_DIR = path.join(ROOT_DIR, ".tmp", "styleforge-render");
const RENDER_TIMEOUT_MS = 120_000;
const LOCAL_GO_BIN = path.join(process.env.HOME ?? "", ".local", "go-toolchain", "go", "bin", "go");

type RenderRequest = {
  config?: RenderConfigInput;
  configPath?: string;
  input?: string;
  outputDir?: string;
  prefix?: string;
  variants?: RenderVariantInput[];
};

type RenderConfigInput = {
  input?: string;
  outputDir?: string;
  prefix?: string;
  variants?: RenderVariantInput[];
};

type RenderVariantInput = {
  id?: string;
  overlays?: RenderOverlayInput[];
  [key: string]: unknown;
};

type RenderOverlayInput = {
  path?: string;
  [key: string]: unknown;
};

type RenderResult = {
  files?: RenderedFile[];
};

type RenderedFile = {
  id: string;
  path?: string;
  width: number;
  height: number;
  format: string;
  contentType?: string;
  dataBase64?: string;
  url?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanPathInput(value: string) {
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname);
  } catch {
    return decodeURIComponent(value.split("?")[0] ?? value);
  }
}

function assertInside(baseDir: string, targetPath: string, label: string) {
  const relative = path.relative(baseDir, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} doit rester dans ${baseDir}.`);
  }
  return targetPath;
}

function resolveWorkspacePath(value: string, label: string) {
  const cleanValue = cleanPathInput(value);
  const targetPath = path.isAbsolute(cleanValue) && cleanValue.startsWith(ROOT_DIR)
    ? cleanValue
    : cleanValue.startsWith("/")
      ? path.join(PUBLIC_DIR, cleanValue.replace(/^\/+/, ""))
      : path.join(ROOT_DIR, cleanValue.replace(/^\/+/, ""));

  return assertInside(ROOT_DIR, path.normalize(targetPath), label);
}

function resolvePublicPath(value: string, label: string) {
  const cleanValue = cleanPathInput(value);
  const targetPath = path.isAbsolute(cleanValue) && cleanValue.startsWith(PUBLIC_DIR)
    ? cleanValue
    : path.join(PUBLIC_DIR, cleanValue.replace(/^\/+/, ""));

  return assertInside(PUBLIC_DIR, path.normalize(targetPath), label);
}

function normalizePrefix(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") {
    return `styleforge-render-${Date.now()}`;
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `styleforge-render-${Date.now()}`;
}

function normalizeCustomConfig(body: RenderRequest) {
  const source = isObject(body.config) ? body.config : {};
  const inputValue = body.input ?? source.input;

  if (typeof inputValue !== "string" || inputValue.trim() === "") {
    throw new Error("input est requis.");
  }

  const variants = body.variants ?? source.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error("variants doit contenir au moins une variante.");
  }

  return {
    ...source,
    input: resolveWorkspacePath(inputValue, "input"),
    outputDir: resolvePublicPath(body.outputDir ?? source.outputDir ?? DEFAULT_OUTPUT_DIR, "outputDir"),
    prefix: normalizePrefix(body.prefix ?? source.prefix),
    variants: variants.map(normalizeVariant),
  };
}

async function buildRemoteConfig(body: RenderRequest, request: Request) {
  const source = isObject(body.config)
    ? body.config
    : body.variants
      ? {}
      : await readJSONConfig(body.configPath ?? DEFAULT_CONFIG_PATH);
  const inputValue = body.input ?? source.input;
  const origin = new URL(request.url).origin;

  if (typeof inputValue !== "string" || inputValue.trim() === "") {
    throw new Error("input est requis.");
  }

  const inputData = await loadRemoteInput(inputValue, request);
  const variants = body.variants ?? source.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error("variants doit contenir au moins une variante.");
  }

  return {
    ...source,
    input: toRemoteInputReference(inputValue, origin),
    inputDataBase64: inputData.dataBase64,
    inputFormat: inputData.format,
    outputDir: "/tmp/styleforge-render",
    prefix: normalizePrefix(body.prefix ?? source.prefix),
    variants: variants.map((variant) => normalizeRemoteVariant(variant, origin)),
  };
}

async function readJSONConfig(configPath: string) {
  const resolvedPath = resolveWorkspacePath(configPath, "configPath");
  return JSON.parse(await readFile(resolvedPath, "utf8")) as RenderConfigInput;
}

function normalizeVariant(variant: RenderVariantInput) {
  if (!isObject(variant)) {
    throw new Error("Chaque variante doit etre un objet.");
  }

  return {
    ...variant,
    overlays: Array.isArray(variant.overlays)
      ? variant.overlays.map((overlay) => {
          if (!isObject(overlay)) {
            throw new Error("Chaque overlay doit etre un objet.");
          }

          return {
            ...overlay,
            path: typeof overlay.path === "string"
              ? resolveWorkspacePath(overlay.path, "overlay.path")
              : overlay.path,
          };
        })
      : variant.overlays,
  };
}

function toRemoteInputReference(value: string, origin: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return new URL(cleanPathInput(value), origin).toString();
}

function normalizeRemoteVariant(variant: RenderVariantInput, origin: string) {
  if (!isObject(variant)) {
    throw new Error("Chaque variante doit etre un objet.");
  }

  return {
    ...variant,
    overlays: Array.isArray(variant.overlays)
      ? variant.overlays.map((overlay) => {
          if (!isObject(overlay)) {
            throw new Error("Chaque overlay doit etre un objet.");
          }

          return {
            ...overlay,
            path: typeof overlay.path === "string"
              ? toRemoteAssetUrl(overlay.path, origin, "overlay.path")
              : overlay.path,
          };
        })
      : variant.overlays,
  };
}

function toRemoteAssetUrl(value: string, origin: string, label: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const localPath = resolveWorkspacePath(value, label);
  const relativePublicPath = path.relative(PUBLIC_DIR, localPath);
  if (relativePublicPath.startsWith("..") || path.isAbsolute(relativePublicPath)) {
    throw new Error(`${label} doit etre dans public/ ou etre une URL http(s) pour le renderer distant.`);
  }

  return `${origin}/${relativePublicPath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

async function loadRemoteInput(value: string, request: Request) {
  if (!/^https?:\/\//i.test(value)) {
    const localPath = resolveWorkspacePath(value, "input");
    if (existsSync(localPath)) {
      return {
        dataBase64: (await readFile(localPath)).toString("base64"),
        format: formatFromPath(localPath),
      };
    }
  }

  const url = /^https?:\/\//i.test(value) ? value : new URL(cleanPathInput(value), request.url).toString();
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
  });

  if (!response.ok) {
    throw new Error(`Impossible de recuperer l'image source (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  return {
    dataBase64: Buffer.from(await response.arrayBuffer()).toString("base64"),
    format: contentType.includes("jpeg") ? "jpg" : "png",
  };
}

function formatFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" ? "jpg" : "png";
}

async function writeTempConfig(config: ReturnType<typeof normalizeCustomConfig>) {
  await mkdir(TEMP_CONFIG_DIR, { recursive: true });
  const configPath = path.join(TEMP_CONFIG_DIR, `${config.prefix}.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

function getRendererCommand(configPath: string, body: RenderRequest) {
  const rendererBin = process.env.STYLEFORGE_RENDERER_BIN;
  const args = ["-config", configPath];

  if (rendererBin) {
    return { command: rendererBin, args, cwd: ROOT_DIR };
  }

  if (body.input) {
    args.push("-input", resolveWorkspacePath(body.input, "input"));
  }
  if (body.outputDir) {
    args.push("-out", resolvePublicPath(body.outputDir, "outputDir"));
  }
  if (body.prefix) {
    args.push("-prefix", normalizePrefix(body.prefix));
  }

  return {
    command: process.env.GO_BIN ?? (existsSync(LOCAL_GO_BIN) ? LOCAL_GO_BIN : "go"),
    args: ["run", "./cmd/styleforge-render", ...args],
    cwd: GO_RENDERER_DIR,
  };
}

function attachPublicUrls(result: RenderResult) {
  return {
    ...result,
    files: (result.files ?? []).map((file) => ({
      ...file,
      url: file.path ? pathToPublicUrl(file.path) : file.url,
    })),
  };
}

function pathToPublicUrl(filePath: string) {
  const normalizedPath = path.normalize(filePath);
  const relative = path.relative(PUBLIC_DIR, normalizedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return undefined;
  }

  return `/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
}

async function renderWithRemoteService(body: RenderRequest, request: Request) {
  const rendererUrl = process.env.RENDERER_URL?.replace(/\/$/, "");
  if (!rendererUrl) {
    return null;
  }

  const config = await buildRemoteConfig(body, request);
  const response = await fetch(`${rendererUrl}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Renderer distant indisponible (${response.status}): ${text}`);
  }

  const result = (await response.json()) as RenderResult;
  return uploadRemoteFiles(result, config.prefix);
}

async function uploadRemoteFiles(result: RenderResult, prefix: string) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase n'est pas configure pour uploader les variantes.");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const files = await Promise.all((result.files ?? []).map(async (file, index) => {
    if (!file.dataBase64) {
      return file;
    }

    const format = file.format === "jpg" || file.format === "jpeg" ? "jpg" : "png";
    const contentType = file.contentType ?? (format === "jpg" ? "image/jpeg" : "image/png");
    const storagePath = `variants/${prefix}-${normalizePrefix(file.id || `variant-${index + 1}`)}.${format}`;
    const buffer = Buffer.from(file.dataBase64, "base64");
    const { error } = await supabase.storage.from("images").upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      id: file.id,
      width: file.width,
      height: file.height,
      format,
      contentType,
      path: storagePath,
      url: `/api/images/${storagePath}`,
    };
  }));

  return { files };
}

function parseRendererOutput(stdout: string) {
  try {
    return JSON.parse(stdout) as RenderResult;
  } catch {
    throw new Error("Le renderer Go a retourne une reponse JSON invalide.");
  }
}

function renderErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur inconnue pendant le rendu.";
  const status = /ENOENT|command not found|executable file not found/i.test(message) ? 503 : 502;

  console.error("go renderer error", error);

  return Response.json({ message }, { status });
}

export async function POST(request: Request) {
  let body: RenderRequest;

  try {
    body = (await request.json()) as RenderRequest;
  } catch {
    return Response.json({ message: "JSON invalide." }, { status: 400 });
  }

  try {
    const remoteResult = await renderWithRemoteService(body, request);
    if (remoteResult) {
      return Response.json(remoteResult);
    }

    const hasInlineConfig = Boolean(body.config || body.variants);
    const configPath = hasInlineConfig
      ? await writeTempConfig(normalizeCustomConfig(body))
      : resolveWorkspacePath(body.configPath ?? DEFAULT_CONFIG_PATH, "configPath");

    const command = getRendererCommand(configPath, body);
    const { stdout } = await execFileAsync(command.command, command.args, {
      cwd: command.cwd,
      maxBuffer: 1024 * 1024,
      timeout: RENDER_TIMEOUT_MS,
    });

    return Response.json(attachPublicUrls(parseRendererOutput(stdout)));
  } catch (error) {
    return renderErrorResponse(error);
  }
}
