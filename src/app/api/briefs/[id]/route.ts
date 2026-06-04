import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type BriefStatus = "new" | "in_progress" | "done" | "archived";

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return Response.json({ message: "ID manquant." }, { status: 400 });

  let body: { status?: BriefStatus };
  try {
    body = (await request.json()) as { status?: BriefStatus };
  } catch {
    return Response.json({ message: "Corps de requête invalide." }, { status: 400 });
  }

  const validStatuses: BriefStatus[] = ["new", "in_progress", "done", "archived"];
  if (body.status && !validStatuses.includes(body.status)) {
    return Response.json({ message: "Statut invalide." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("creative_briefs")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return Response.json({ message: "ID manquant." }, { status: 400 });

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("creative_briefs").delete().eq("id", id);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
