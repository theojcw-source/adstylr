const REPLICATE_TRAINING_URL =
  "https://api.replicate.com/v1/models/replicate/fast-flux-trainer/versions/e5a5bc821112c107e6ddb8491c5b898f94d06eaca861d1dbf37b29cd69ba8988/trainings";

type TrainRequest = {
  imageUrl: string;
  triggerWord: string;
  steps: number;
};

type ReplicateTraining = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string;
  logs?: string;
};

function extractLoraUrl(output: unknown): string | undefined {
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (Array.isArray(output)) {
    return output.find((item) => typeof item === "string" && item.startsWith("http"));
  }
  if (output && typeof output === "object") {
    const val = Object.values(output as Record<string, unknown>).find(
      (v) => typeof v === "string" && (v as string).startsWith("http"),
    );
    return val as string | undefined;
  }
  return undefined;
}

export async function POST(request: Request) {
  const key = process.env.REPLICATE_API_KEY;
  const destination = process.env.REPLICATE_DESTINATION;

  if (!key) {
    return Response.json(
      { message: "REPLICATE_API_KEY non configuree cote serveur." },
      { status: 503 },
    );
  }

  if (!destination) {
    return Response.json(
      { message: "REPLICATE_DESTINATION non configure (ex: theojcw-source/styleforge-loras)." },
      { status: 503 },
    );
  }

  const body = (await request.json()) as TrainRequest;

  const response = await fetch(REPLICATE_TRAINING_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      destination,
      input: {
        lora_type: "style",
        input_images: body.imageUrl,
        trigger_word: body.triggerWord,
        training_steps: body.steps,
      },
    }),
  });

  const training = (await response.json()) as ReplicateTraining;

  if (!response.ok) {
    console.error("[replicate/train] erreur", response.status, JSON.stringify(training));
    return Response.json(
      { message: `Replicate ${response.status}: ${JSON.stringify(training)}` },
      { status: 502 },
    );
  }

  return Response.json({ id: training.id });
}

export async function GET(request: Request) {
  const key = process.env.REPLICATE_API_KEY;
  if (!key) {
    return Response.json(
      { message: "REPLICATE_API_KEY non configuree cote serveur." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ message: "id manquant" }, { status: 400 });
  }

  const response = await fetch(`https://api.replicate.com/v1/trainings/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  const training = (await response.json()) as ReplicateTraining;
  const loraUrl = extractLoraUrl(training.output);
  const lastLog = training.logs?.trimEnd().split("\n").at(-1);

  return Response.json({
    status: training.status,
    loraUrl,
    error: training.error,
    log: lastLog,
  });
}
