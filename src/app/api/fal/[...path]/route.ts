import { createRouteHandler } from "@fal-ai/server-proxy/nextjs";
import { DEFAULT_ALLOWED_URL_PATTERNS, type HeaderValue, type ProxyBehavior } from "@fal-ai/server-proxy";
import type { NextRequest } from "next/server";
import {
  FAL_FLUX_2_BASE_MODEL,
  FAL_FLUX_2_LORA_MODEL,
  FAL_FLUX_2_TRAINER_MODEL,
} from "../../../fal-models";

function firstHeader(value: HeaderValue) {
  return Array.isArray(value) ? value[0] : value;
}

function isSameOriginRequest(behavior: ProxyBehavior<unknown>) {
  const host = firstHeader(behavior.getHeader("host"));
  const source = firstHeader(behavior.getHeader("origin")) ?? firstHeader(behavior.getHeader("referer"));

  if (!host || !source) {
    return false;
  }

  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

const falProxy = createRouteHandler({
  allowedEndpoints: [
    FAL_FLUX_2_TRAINER_MODEL,
    FAL_FLUX_2_LORA_MODEL,
    FAL_FLUX_2_BASE_MODEL,
    "storage/upload/**",
  ],
  allowedUrlPatterns: [...DEFAULT_ALLOWED_URL_PATTERNS, "rest.fal.ai/storage/upload/**"],
  allowUnauthorizedRequests: false,
  isAuthenticated: async (behavior) => isSameOriginRequest(behavior),
  resolveFalAuth: async () => {
    const key = process.env.FAL_KEY;
    return key ? `Key ${key}` : undefined;
  },
});

function proxyErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur inconnue";

  console.error("fal proxy error", error);

  return Response.json(
    {
      message:
        "Impossible de joindre fal.ai depuis le proxy local. Verifiez la connexion reseau puis relancez la generation.",
      detail: message,
    },
    { status: 502 },
  );
}

export async function GET(request: NextRequest) {
  try {
    return await falProxy.GET(request);
  } catch (error) {
    return proxyErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return await falProxy.POST(request);
  } catch (error) {
    return proxyErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    return await falProxy.PUT(request);
  } catch (error) {
    return proxyErrorResponse(error);
  }
}
