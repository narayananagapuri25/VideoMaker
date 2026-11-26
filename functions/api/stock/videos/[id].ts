interface Env { PIXABAY_API_KEY?: string }
interface Context { request: Request; env: Env; params: { id: string } }

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  const apiKey = env.PIXABAY_API_KEY;
  if (!apiKey) return new Response("Stock video service is not configured.", { status: 503 });

  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return new Response("Invalid Pixabay video ID.", { status: 400 });

  const requestedQuality = new URL(request.url).searchParams.get("quality");
  const quality = requestedQuality === "small" ? "small" : "medium";
  const lookup = new URL("https://pixabay.com/api/videos/");
  lookup.searchParams.set("key", apiKey);
  lookup.searchParams.set("id", String(id));

  try {
    const metadataResponse = await fetch(lookup.toString(), { headers: { Accept: "application/json" } });
    if (!metadataResponse.ok) return new Response("Pixabay video lookup failed.", { status: 502 });
    const payload = await metadataResponse.json() as {
      hits?: Array<{ videos?: Record<string, { url?: string; width?: number; height?: number }> }>;
    };
    const videoUrl = payload.hits?.[0]?.videos?.[quality]?.url || payload.hits?.[0]?.videos?.small?.url;
    if (!videoUrl) return new Response("This Pixabay video has no playable MP4 rendition.", { status: 404 });

    const parsedUrl = new URL(videoUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "cdn.pixabay.com") {
      return new Response("Pixabay returned an unexpected media host.", { status: 502 });
    }

    const range = request.headers.get("Range");
    const mediaResponse = await fetch(parsedUrl.toString(), {
      headers: range ? { Range: range } : undefined,
    });
    if (!mediaResponse.ok && mediaResponse.status !== 206) {
      return new Response("Could not stream the selected Pixabay video.", { status: 502 });
    }

    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["Content-Length", "Content-Range"]) {
      const value = mediaResponse.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(mediaResponse.body, { status: mediaResponse.status, headers });
  } catch {
    return new Response("Could not reach Pixabay video storage.", { status: 502 });
  }
}
