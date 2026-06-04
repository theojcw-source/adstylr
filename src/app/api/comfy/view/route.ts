function getComfyLocalUrl() {
  return process.env.COMFY_LOCAL_URL?.replace(/\/$/, "");
}

export async function GET(request: Request) {
  const localUrl = getComfyLocalUrl();

  if (!localUrl) {
    return Response.json(
      {
        message: "COMFY_LOCAL_URL n'est pas configure.",
      },
      { status: 503 },
    );
  }

  const sourceUrl = new URL(request.url);
  const filename = sourceUrl.searchParams.get("filename");

  if (!filename) {
    return Response.json(
      {
        message: "Parametre filename manquant.",
      },
      { status: 400 },
    );
  }

  const comfyViewUrl = new URL(`${localUrl}/view`);
  comfyViewUrl.searchParams.set("filename", filename);
  comfyViewUrl.searchParams.set("subfolder", sourceUrl.searchParams.get("subfolder") ?? "");
  comfyViewUrl.searchParams.set("type", sourceUrl.searchParams.get("type") ?? "output");

  const response = await fetch(comfyViewUrl, { cache: "no-store" });

  if (!response.ok) {
    return Response.json(
      {
        message: `ComfyUI local a repondu ${response.status} pour l'image.`,
      },
      { status: response.status },
    );
  }

  return new Response(await response.arrayBuffer(), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": response.headers.get("Content-Type") ?? "image/png",
    },
  });
}
