import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabase } from "../../../lib/supabase";

const LOCAL_WORKFLOW_PATH = path.join(process.cwd(), "fal-comfy", "workflow.json");

export async function GET() {
  const { data, error } = await supabase
    .from("comfy_workflows")
    .select("id, name, description, is_active, created_at")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ message: error.message }, { status: 500 });

  const workflows = (data ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    isActive: w.is_active,
    createdAt: w.created_at,
  }));

  return Response.json(workflows);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { id: string; name: string; description?: string };

  let workflowJson: unknown = null;
  try {
    workflowJson = JSON.parse(await readFile(LOCAL_WORKFLOW_PATH, "utf8"));
  } catch {
    // no local workflow file
  }

  await supabase.from("comfy_workflows").update({ is_active: false }).neq("id", "");

  const { error } = await supabase.from("comfy_workflows").insert({
    id: body.id,
    name: body.name,
    description: body.description ?? "",
    workflow: workflowJson,
    is_active: true,
  });

  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ id: body.id }, { status: 201 });
}
