type NasaData = {
  nasa_id?: string;
  title?: string;
  description?: string;
  media_type?: string;
  date_created?: string;
  center?: string;
  keywords?: string[];
  duration?: number;
  copyright?: string;
  rights?: string;
  license?: string;
  licence?: string;
  [key: string]: unknown;
};
type NasaSearchItem = { data?: NasaData[]; links?: Array<{ href?: string; rel?: string; render?: string }> };
type NasaSearchResponse = { collection?: { items?: NasaSearchItem[]; metadata?: { total_hits?: number } } };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400", "X-Content-Type-Options": "nosniff" } });
}

function safeNasaText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function hasThirdPartyRightsWarning(data: NasaData): boolean {
  for (const key of ["copyright", "rights", "license", "licence"]) {
    const value = safeNasaText(data[key], 500);
    if (value && !/(public domain|\bnasa\b|u\.?s\.? government|united states government)/i.test(value)) return true;
  }
  const description = safeNasaText(data.description, 4_000);
  return /(?:copyrighted material|copyright holder|all rights reserved|courtesy of [A-Z][A-Za-z ]{2,}|\u00a9\s*(?!NASA))/i.test(description);
}

function containsIdentifiablePeopleRisk(data: NasaData): boolean {
  const text = [data.title, data.description, ...(Array.isArray(data.keywords) ? data.keywords : [])].join(" ").toLowerCase();
  return /\b(astronaut|crew member|interview|portrait|personnel|named individual|celebrity|actor|actress)\b/.test(text);
}

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > 160) return json({ error: "Enter a scene search phrase between 2 and 160 characters." }, 400);
  const endpoint = new URL("https://images-api.nasa.gov/search");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("media_type", "video");
  endpoint.searchParams.set("page_size", "12");
  try {
    const upstream = await fetch(endpoint.toString(), { headers: { Accept: "application/json" } });
    if (!upstream.ok) return json({ error: "NASA video search is temporarily unavailable (HTTP " + upstream.status + ")." }, 502);
    const payload = await upstream.json() as NasaSearchResponse;
    const items = Array.isArray(payload.collection?.items) ? payload.collection.items : [];
    const seen = new Set<string>();
    const results = items.flatMap((item) => {
      const data = item.data?.[0];
      const nasaId = safeNasaText(data?.nasa_id, 128);
      if (!data || data.media_type !== "video" || !/^[A-Za-z0-9_.-]{1,128}$/.test(nasaId) || seen.has(nasaId)) return [];
      if (hasThirdPartyRightsWarning(data) || containsIdentifiablePeopleRisk(data)) return [];
      seen.add(nasaId);
      const preview = item.links?.find((link) => link.rel === "preview" && typeof link.href === "string")?.href ?? "";
      const previewUrl = (() => {
        try { const parsed = new URL(preview); return parsed.protocol === "https:" && parsed.hostname === "images-assets.nasa.gov" ? parsed.toString() : ""; }
        catch { return ""; }
      })();
      return [{
        nasaId,
        title: safeNasaText(data.title, 180) || "NASA video footage",
        description: safeNasaText(data.description, 900),
        keywords: Array.isArray(data.keywords) ? data.keywords.filter((word): word is string => typeof word === "string").slice(0, 24) : [],
        dateCreated: safeNasaText(data.date_created, 40),
        center: safeNasaText(data.center, 80) || "NASA",
        duration: Number.isFinite(Number(data.duration)) ? Math.max(0, Number(data.duration)) : 0,
        thumbnailUrl: previewUrl,
        pageUrl: "https://images.nasa.gov/details/" + encodeURIComponent(nasaId),
        streamUrl: "/api/stock/nasa-videos/" + encodeURIComponent(nasaId),
        source: "NASA",
        rightsBasis: "NASA media guidelines · educational/informational use; third-party flagged and identifiable-person results excluded",
      }];
    }).slice(0, 8);
    return json({ results, totalHits: Number(payload.collection?.metadata?.total_hits) || results.length, source: "NASA Image and Video Library", requiresApiKey: false });
  } catch {
    return json({ error: "Could not reach NASA Image and Video Library. Check your connection and try again." }, 502);
  }
}
