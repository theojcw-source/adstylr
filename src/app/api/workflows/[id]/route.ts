import { supabase } from "../../../../lib/supabase";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error } = await supabase.from("comfy_workflows").delete().eq("id", id);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ id });
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await supabase.from("comfy_workflows").update({ is_active: false }).neq("id", "");
  const { error } = await supabase.from("comfy_workflows").update({ is_active: true }).eq("id", id);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ id });
}
