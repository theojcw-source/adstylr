import { supabase } from "../../../../lib/supabase";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as { label?: string; category?: string; prompt?: string };

  const { error } = await supabase
    .from("prompt_templates")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ id });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { error } = await supabase.from("prompt_templates").delete().eq("id", id);

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ id });
}
