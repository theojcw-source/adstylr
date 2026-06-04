import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

function parseThumbnailWidth(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("w");
  if (!value) return null;

  const width = Number(value);
  if (!Number.isFinite(width)) return null;

  return Math.min(Math.max(Math.round(width), 64), 1200);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse(null, { status: 401 });
  }

  const { path } = await params;
  const storagePath = path.join("/");
  const thumbnailWidth = parseThumbnailWidth(request);

  const { data, error } = await supabase.storage.from("images").download(storagePath);

  if (error || !data) {
    return new NextResponse(null, { status: 404 });
  }

  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "application/octet-stream";

  if (thumbnailWidth) {
    const sourceBuffer = Buffer.from(await data.arrayBuffer());
    const thumbnail = await sharp(sourceBuffer)
      .rotate()
      .resize({ width: thumbnailWidth, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();

    return new NextResponse(new Uint8Array(thumbnail), {
      headers: {
        "Cache-Control": "private, max-age=86400",
        "Content-Type": "image/webp",
      },
    });
  }

  return new NextResponse(data, {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Type": contentType,
    },
  });
}
