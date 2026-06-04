import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { COMFY_FAL_MODEL, type GenerationModel } from "../../fal-models";

type GenerationRow = {
  id: string;
  url: string;
  clean_url?: string;
  branded_url?: string;
  brand_id?: string;
  branding_config?: unknown;
  thumbnail_url?: string;
  prompt?: string;
  model?: string;
  loras?: unknown[];
  source?: string;
};

type StorageFile = {
  created_at?: string | null;
  id?: string | null;
  name: string;
  updated_at?: string | null;
};

const IMAGES_PROXY = "/api/images";
const GENERATION_SELECT =
  "id, url, clean_url, branded_url, brand_id, branding_config, thumbnail_url, prompt, model, loras, source, created_at, hidden_at";
const LEGACY_GENERATION_SELECT =
  "id, url, clean_url, branded_url, brand_id, branding_config, prompt, model, loras, source, created_at, hidden_at";
const MINIMAL_GENERATION_SELECT =
  "id, url, clean_url, branded_url, brand_id, prompt, model, loras, source, created_at";

async function createSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
}

function isImageFile(file: StorageFile) {
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

function sortNewestFirst(a: StorageFile, b: StorageFile) {
  const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
  const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
  return bTime - aTime;
}

function hasMissingColumn(error: { message?: string } | null) {
  return /column .* does not exist|schema cache/i.test(error?.message ?? "");
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

async function getHiddenGenerationKeys(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("generations")
    .select("id, url, clean_url, branded_url, thumbnail_url")
    .not("hidden_at", "is", null);

  if (error) return new Set<string>();

  return new Set(
    (data ?? []).flatMap((row) => [row.id, row.url, row.clean_url, row.branded_url, row.thumbnail_url].filter(Boolean) as string[]),
  );
}

async function listStorageGenerations(supabase: SupabaseClient) {
  const [brandedResult, cleanResult, hiddenKeys] = await Promise.all([
    supabase.storage.from("images").list("branded", {
      limit: 50,
      sortBy: { column: "updated_at", order: "desc" },
    }),
    supabase.storage.from("images").list("clean", {
      limit: 100,
      sortBy: { column: "updated_at", order: "desc" },
    }),
    getHiddenGenerationKeys(supabase),
  ]);

  if (brandedResult.error && cleanResult.error) {
    throw brandedResult.error;
  }

  const cleanFiles = new Set((cleanResult.data ?? []).filter(isImageFile).map((file) => file.name));
  const brandedFiles = (brandedResult.data ?? []).filter(isImageFile).sort(sortNewestFirst);
  const sourceFiles = brandedFiles.length > 0
    ? brandedFiles
    : (cleanResult.data ?? []).filter(isImageFile).sort(sortNewestFirst);
  const sourceFolder = brandedFiles.length > 0 ? "branded" : "clean";

  return sourceFiles.flatMap((file) => {
    const hasCleanVersion = sourceFolder === "clean" || cleanFiles.has(file.name);
    const createdAt = file.updated_at ?? file.created_at ?? new Date().toISOString();
    const url = `${IMAGES_PROXY}/${sourceFolder}/${encodeURIComponent(file.name)}`;
    const cleanUrl = hasCleanVersion ? `${IMAGES_PROXY}/clean/${encodeURIComponent(file.name)}` : undefined;
    const brandedUrl = sourceFolder === "branded" ? url : undefined;
    const id = file.id ?? `${sourceFolder}-${file.name}`;

    if ([id, url, cleanUrl, brandedUrl].some((key) => key && hiddenKeys.has(key))) {
      return [];
    }

    return [{
      brand_id: undefined,
      branded_url: brandedUrl,
      clean_url: cleanUrl,
      created_at: createdAt,
      id,
      loras: [],
      model: COMFY_FAL_MODEL satisfies GenerationModel,
      prompt: "",
      source: "storage",
      url,
    }];
  }).slice(0, 50);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const school = searchParams.get("school");
  const view = searchParams.get("view");

  const supabase = await createSupabaseClient();

  function buildQuery(select: string) {
    let base = supabase.from("generations").select(select).order("created_at", { ascending: false }).limit(50);
    if (view === "archive") {
      base = base.not("hidden_at", "is", null);
    } else if (view !== "all") {
      base = base.is("hidden_at", null);
    }
    return school && view !== "archive" ? base.eq("brand_id", school) : base;
  }

  const initialResult = await buildQuery(GENERATION_SELECT);
  let data = initialResult.data;
  let error = initialResult.error;

  if (hasMissingColumn(error)) {
    const legacyResult = await buildQuery(LEGACY_GENERATION_SELECT);
    data = legacyResult.data as typeof data;
    error = legacyResult.error;
  }

  if (hasMissingColumn(error)) {
    const minimalResult = await buildQuery(MINIMAL_GENERATION_SELECT);
    data = minimalResult.data as typeof data;
    error = minimalResult.error;
  }

  if (!error && data && data.length > 0) {
    return Response.json(data);
  }

  // Skip storage fallback for archive/all views; storage files have no hidden_at state.
  if (view === "archive" || view === "all") {
    return Response.json([]);
  }

  try {
    const storageGenerations = await listStorageGenerations(supabase);
    return Response.json(storageGenerations);
  } catch (storageError) {
    const message = storageError instanceof Error
      ? storageError.message
      : error?.message ?? "Impossible de charger les generations.";
    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseClient();
  const body = (await request.json()) as GenerationRow | GenerationRow[];
  const items = Array.isArray(body) ? body : [body];

  let { error } = await supabase.from("generations").insert(
    items.map((item) => ({
      id: item.id,
      url: item.url,
      clean_url: item.clean_url,
      branded_url: item.branded_url,
      brand_id: item.brand_id,
      branding_config: item.branding_config,
      prompt: item.prompt,
      thumbnail_url: item.thumbnail_url,
      model: item.model,
      loras: item.loras ?? [],
      source: item.source ?? "dashboard",
    })),
  );

  if (hasMissingColumn(error)) {
    const legacyResult = await supabase.from("generations").insert(
      items.map((item) => ({
        id: item.id,
        url: item.url,
        clean_url: item.clean_url,
        branded_url: item.branded_url,
        brand_id: item.brand_id,
        branding_config: item.branding_config,
        prompt: item.prompt,
        model: item.model,
        loras: item.loras ?? [],
        source: item.source ?? "dashboard",
      })),
    );
    error = legacyResult.error;
  }

  if (hasMissingColumn(error)) {
    const minimalResult = await supabase.from("generations").insert(
      items.map((item) => ({
        id: item.id,
        url: item.url,
        clean_url: item.clean_url,
        branded_url: item.branded_url,
        brand_id: item.brand_id,
        prompt: item.prompt,
        model: item.model,
        loras: item.loras ?? [],
        source: item.source ?? "dashboard",
      })),
    );
    error = minimalResult.error;
  }

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const body = (await request.json()) as Partial<GenerationRow> & { hidden_at?: string | null };

  if (!id) return Response.json({ message: "ID manquant." }, { status: 400 });

  const patch = withoutUndefined({
    brand_id: body.brand_id,
    branded_url: body.branded_url,
    branding_config: body.branding_config,
    clean_url: body.clean_url,
    hidden_at: body.hidden_at,
    thumbnail_url: body.thumbnail_url,
    url: body.url,
  });

  let { error } = await supabase
    .from("generations")
    .update(patch)
    .eq("id", id);

  if (hasMissingColumn(error)) {
    const legacyPatch = withoutUndefined({
      brand_id: body.brand_id,
      branded_url: body.branded_url,
      branding_config: body.branding_config,
      clean_url: body.clean_url,
      url: body.url,
    });
    const legacyResult = await supabase.from("generations").update(legacyPatch).eq("id", id);
    error = legacyResult.error;
  }

  if (hasMissingColumn(error)) {
    const minimalPatch = withoutUndefined({
      brand_id: body.brand_id,
      branded_url: body.branded_url,
      clean_url: body.clean_url,
      url: body.url,
    });
    const minimalResult = await supabase.from("generations").update(minimalPatch).eq("id", id);
    error = minimalResult.error;
  }

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const url = searchParams.get("url") ?? undefined;
  const cleanUrl = searchParams.get("clean_url") ?? undefined;
  const brandedUrl = searchParams.get("branded_url") ?? undefined;
  if (!id) {
    const { error } = await supabase.from("generations").delete().neq("id", "");
    if (error) return Response.json({ message: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  const hiddenAt = new Date().toISOString();
  const updateResult = await supabase
    .from("generations")
    .update({ hidden_at: hiddenAt })
    .eq("id", id)
    .select("id");
  const data = updateResult.data;
  let error = updateResult.error;

  if (!error && (data?.length ?? 0) === 0 && url) {
    const insertResult = await supabase.from("generations").insert({
      id,
      url,
      clean_url: cleanUrl,
      branded_url: brandedUrl,
      hidden_at: hiddenAt,
      loras: [],
      model: COMFY_FAL_MODEL,
      prompt: "",
      source: "dashboard_hidden",
    });
    error = insertResult.error;
  }

  if (hasMissingColumn(error)) {
    const legacyResult = await supabase.from("generations").delete().eq("id", id);
    error = legacyResult.error;
  }
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
