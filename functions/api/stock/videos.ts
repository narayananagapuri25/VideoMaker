interface Env { PIXABAY_API_KEY?: string }
interface Context { request: Request; env: Env }

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const apiKey = env.PIXABAY_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Stock video search is not configured yet. Add the encrypted PIXABAY_API_KEY secret to your Cloudflare Pages project and redeploy." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const requestUrl = new URL(request.url);
  const query = (requestUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 100) {
    return Response.json({ error: "Enter a search phrase between 2 and 100 characters." }, { status: 400 });
  }

  const pixabayUrl = new URL("https://pixabay.com/api/videos/");
  pixabayUrl.searchParams.set("key", apiKey);
  pixabayUrl.searchParams.set("q", query);
  pixabayUrl.searchParams.set("per_page", "18");
  pixabayUrl.searchParams.set("page", "1");
  pixabayUrl.searchParams.set("order", "popular");
  pixabayUrl.searchParams.set("safesearch", "true");

  try {
    const upstream = await fetch(pixabayUrl.toString(), { headers: { Accept: "application/json" } });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 240);
      const status = upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 502;
      return Response.json(
        { error: upstream.status === 429 ? "Pixabay search rate limit reached. Wait a moment and try again." : "Pixabay could not complete the search. Check the API key and try again.", detail },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const payload = await upstream.json() as {
      totalHits?: number;
      hits?: Array<{
        id: number;
        pageURL: string;
        duration: number;
        user: string;
        videos?: { small?: { thumbnail?: string; width?: number; height?: number }; medium?: { thumbnail?: string; width?: number; height?: number } };
      }>;
    };

    const results = (payload.hits ?? []).flatMap((hit) => {
      if (!Number.isInteger(hit.id) || !hit.videos?.small?.thumbnail) return [];
      return [{
        id: hit.id,
        pageUrl: hit.pageURL,
        duration: Math.max(0, Number(hit.duration) || 0),
        author: String(hit.user ?? "Pixabay contributor").slice(0, 80),
        thumbnailUrl: hit.videos.medium?.thumbnail || hit.videos.small.thumbnail,
        width: hit.videos.medium?.width || hit.videos.small.width || 0,
        height: hit.videos.medium?.height || hit.videos.small.height || 0,
      }];
    });

    return Response.json(
      { totalHits: Number(payload.totalHits) || results.length, results },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
    );
  } catch {
    return Response.json({ error: "Could not reach Pixabay. Check your connection and try again." }, { status: 502 });
  }
}
