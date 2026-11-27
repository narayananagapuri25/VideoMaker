type AssetManifest = { collection?: { items?: Array<{ href?: string }> } };

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function isAllowedAssetUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "images-assets.nasa.gov" || !/\.mp4(?:$|\?)/i.test(url.pathname + url.search)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, params }: { request: Request; params: { id: string } }): Promise<Response> {
  const nasaId = params.id ?? "";
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(nasaId)) return error("Invalid NASA media ID.", 400);
  try {
    const manifestResponse = await fetch("https://images-api.nasa.gov/asset/" + encodeURIComponent(nasaId), { headers: { Accept: "application/json" } });
    if (!manifestResponse.ok) return error("NASA could not find this video asset.", manifestResponse.status === 404 ? 404 : 502);
    const manifest = await manifestResponse.json() as AssetManifest;
    const files = (manifest.collection?.items ?? []).flatMap((item) => {
      const href = typeof item.href === "string" ? item.href : "";
      const parsed = isAllowedAssetUrl(href);
      return parsed ? [parsed] : [];
    });
    if (!files.length) return error("NASA did not provide an MP4 rendition for this asset.", 404);
    const rank = (url: URL) => url.pathname.includes("~medium") ? 4 : url.pathname.includes("~large") ? 3 : url.pathname.includes("~small") ? 2 : url.pathname.includes("~orig") ? 1 : 0;
    files.sort((a, b) => rank(b) - rank(a));
    const range = request.headers.get("Range");
    const media = await fetch(files[0].toString(), { headers: range ? { Range: range } : undefined });
    if (!media.ok && media.status !== 206) return error("NASA video streaming failed (HTTP " + media.status + ").", 502);
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["Content-Length", "Content-Range", "Last-Modified", "ETag"]) {
      const value = media.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(media.body, { status: media.status, headers });
  } catch {
    return error("Could not retrieve this NASA video asset.", 502);
  }
}
