import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type BriefRow = {
  id: string;
  title: string;
  description?: string | null;
  client_name?: string | null;
  brand_id?: string | null;
  assets?: unknown;
  metadata?: unknown;
  status: "new" | "in_progress" | "done" | "archived";
  created_at: string;
  updated_at: string;
};

type IncomingBrief = {
  title: string;
  description?: string;
  client_name?: string;
  brand_id?: string;
  assets?: unknown;
  metadata?: unknown;
};

async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );
}

function isValidApiKey(request: Request) {
  const apiKey = process.env.BRIEFS_API_KEY?.trim();
  if (!apiKey) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const xApiKey = request.headers.get("x-api-key") ?? "";
  return authHeader === `Bearer ${apiKey}` || xApiKey === apiKey;
}

function normalizeRow(row: BriefRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    clientName: row.client_name ?? undefined,
    brandId: row.brand_id ?? undefined,
    assets: row.assets ?? undefined,
    metadata: row.metadata ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const brandId = searchParams.get("brand_id");

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("creative_briefs")
    .select("id, title, description, client_name, brand_id, assets, metadata, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (brandId) query = query.eq("brand_id", brandId);

  const { data, error } = await query;
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json((data as BriefRow[]).map(normalizeRow));
}

export async function POST(request: Request) {
  if (!isValidApiKey(request)) {
    return Response.json({ message: "Non autorisé." }, { status: 401 });
  }

  let body: IncomingBrief;
  try {
    body = (await request.json()) as IncomingBrief;
  } catch {
    return Response.json({ message: "Corps de requête invalide." }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return Response.json({ message: "Le champ 'title' est requis." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("creative_briefs")
    .insert({
      title: body.title.trim(),
      description: body.description ?? null,
      client_name: body.client_name ?? null,
      brand_id: body.brand_id ?? null,
      assets: body.assets ?? null,
      metadata: body.metadata ?? null,
      status: "new",
    })
    .select("id, title, description, client_name, brand_id, assets, metadata, status, created_at, updated_at")
    .single();

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json(normalizeRow(data as BriefRow), { status: 201 });
}
