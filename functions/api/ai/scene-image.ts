import { checkSameOrigin, jsonNoStore, parseJsonBody, providerError, type PagesContext } from "./_shared";

const MODEL = "@cf/black-forest-labs/flux-1-schnell";

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  if (request.headers.get("X-SochoZara-AI-Provider") !== "cloudflare") {
    return jsonNoStore({ error: "Scene artwork is only available while Cloudflare Workers AI is the selected provider.", code: "SCENE_IMAGE_PROVIDER_MISMATCH" }, 403);
  }
  if (request.headers.get("X-SochoZara-Cloudflare-Free-Use") !== "true") {
    return jsonNoStore({ error: "Confirm Cloudflare Workers Free use before generating scene artwork.", code: "CLOUDFLARE_FREE_PLAN_CONFIRMATION_REQUIRED" }, 403);
  }
  if (!env.AI) {
    return jsonNoStore({ error: "Cloudflare Workers AI is not attached to this Pages project. Add the AI binding named AI in Cloudflare Pages settings and deploy again.", code: "CLOUDFLARE_AI_BINDING_MISSING" }, 503);
  }

  const body = await parseJsonBody(request, 5_000);
  if (body instanceof Response) return body;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 2_048) {
    return jsonNoStore({ error: "Enter a scene-art prompt between 1 and 2,048 characters." }, 400);
  }

  try {
    const result = await env.AI.run(MODEL, {
      prompt,
      steps: 8,
      seed: Math.floor(Math.random() * 2_000_000_000),
    });
    const image = result && typeof result === "object" && "image" in result
      ? (result as { image?: unknown }).image
      : undefined;
    if (typeof image !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      throw new Error("Cloudflare FLUX returned an invalid image payload.");
    }
    return jsonNoStore({
      imageDataUrl: "data:image/jpeg;charset=utf-8;base64," + image,
      provider: "cloudflare-workers-ai",
      model: MODEL,
    });
  } catch (error) {
    return providerError(error);
  }
}
