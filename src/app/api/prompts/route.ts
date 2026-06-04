import { supabase } from "../../../lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("prompt_templates")
    .select("id, label, category, prompt")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { id: string; label: string; category: string; prompt: string };

  const { error } = await supabase.from("prompt_templates").insert({
    id: body.id,
    label: body.label,
    category: body.category,
    prompt: body.prompt,
  });

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ id: body.id }, { status: 201 });
}
