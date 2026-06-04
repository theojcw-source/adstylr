import { supabase } from "../../../lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const school = searchParams.get("school");

  let query = supabase
    .from("loras")
    .select("id, name, trigger_word, url, school, created_at")
    .order("created_at", { ascending: false });

  if (school) query = query.eq("school", school);

  const { data, error } = await query;

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { id: string; name: string; trigger_word: string; url: string; school: string };

  const { error } = await supabase.from("loras").insert({
    id: body.id,
    name: body.name,
    trigger_word: body.trigger_word,
    url: body.url,
    school: body.school ?? "",
  });

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ id: body.id }, { status: 201 });
}
