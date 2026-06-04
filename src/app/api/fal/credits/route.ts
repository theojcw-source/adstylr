type FalBillingResponse = {
  username?: string;
  credits?: {
    current_balance?: number;
    currency?: string;
  };
};

export async function GET() {
  const key = process.env.FAL_KEY;

  if (!key) {
    return Response.json(
      {
        message: "FAL_KEY n'est pas configuree cote serveur.",
        status: "unconfigured",
      },
      { status: 503 },
    );
  }

  const response = await fetch("https://api.fal.ai/v1/account/billing?expand=credits", {
    cache: "no-store",
    headers: {
      Authorization: `Key ${key}`,
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      return Response.json({
        message: "La cle fal.ai doit avoir le scope Admin pour lire les credits.",
        status: "error",
      });
    }

    return Response.json(
      {
        message: "Impossible de recuperer les credits fal.ai.",
        status: "error",
      },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as FalBillingResponse;
  const balance = payload.credits?.current_balance;

  if (typeof balance !== "number") {
    return Response.json(
      {
        message: "La reponse fal.ai ne contient pas le solde de credits.",
        status: "error",
      },
      { status: 502 },
    );
  }

  return Response.json({
    balance,
    currency: payload.credits?.currency ?? "USD",
    status: "ready",
    username: payload.username,
  });
}
