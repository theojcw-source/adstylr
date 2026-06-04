import { createFalClient } from "@fal-ai/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabase } from "../../../../lib/supabase";

const KLING_MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";

type SseEvent =
  | { type: "progress"; step: string; percent: number }
  | { type: "done"; videoUrl: string }
  | { type: "error"; message: string };

type KlingResult = { video?: { url?: string } };

function encode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

async function uploadImage(imageUrl: string, client: ReturnType<typeof createFalClient>): Promise<string> {
  let buffer: Buffer;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    const res = await fetch(imageUrl);
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    const relativePath = imageUrl.startsWith("/") ? imageUrl.slice(1) : imageUrl;
    const filePath = path.join(process.cwd(), "public", relativePath);
    buffer = await readFile(filePath);
  }
  const file = new File([new Blob([new Uint8Array(buffer)], { type: "image/png" })], "source.png", { type: "image/png" });
  return client.storage.upload(file);
}

export async function POST(request: Request) {
  const { imageUrl, prompt } = (await request.json()) as { imageUrl: string; prompt?: string };

  if (!imageUrl) {
    return Response.json({ message: "imageUrl requis" }, { status: 400 });
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return Response.json({ message: "FAL_KEY non configuré" }, { status: 503 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SseEvent) => controller.enqueue(encode(event));

      try {
        const client = createFalClient({ credentials: falKey });

        send({ type: "progress", step: "Upload de l'image…", percent: 10 });
        const publicUrl = await uploadImage(imageUrl, client);

        send({ type: "progress", step: "En file d'attente…", percent: 25 });

        const result = await client.subscribe(KLING_MODEL, {
          input: {
            image_url: publicUrl,
            prompt: prompt ?? "Elegant fashion animation, smooth cinematic motion",
            duration: "5",
          },
          onQueueUpdate(update) {
            if (update.status === "IN_QUEUE") {
              send({ type: "progress", step: "En file d'attente…", percent: 30 });
            } else if (update.status === "IN_PROGRESS") {
              const lastLog = update.logs?.at(-1)?.message;
              send({ type: "progress", step: lastLog ?? "Génération en cours…", percent: 65 });
            }
          },
        }) as { data: KlingResult };

        const falVideoUrl = result.data?.video?.url;
        if (!falVideoUrl) {
          send({ type: "error", message: "Pas d'URL vidéo dans la réponse fal.ai" });
        } else {
          send({ type: "progress", step: "Sauvegarde…", percent: 99 });

          let videoUrl = falVideoUrl;
          try {
            const videoRes = await fetch(falVideoUrl);
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
            const videoFile = `styleforge-${Date.now()}.mp4`;
            const { error } = await supabase.storage.from("videos").upload(videoFile, videoBuffer, { contentType: "video/mp4", upsert: true });
            if (!error) {
              videoUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/videos/${videoFile}`;
            }
          } catch {
            // fallback to fal.ai URL
          }

          send({ type: "done", videoUrl });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Erreur inconnue" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
