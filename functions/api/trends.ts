type TrendNewsItem = { title: string; source: string; url: string };
type TrendItem = { title: string; traffic: string; publishedAt: string; link: string; relatedNews: TrendNewsItem[] };

const ALLOWED_REGIONS = new Set(["IN", "US", "GB", "CA", "AU", "DE", "FR", "JP", "BR", "SG"]);

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#([0-9]{1,7});/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function readTag(block: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp("<" + escaped + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + escaped + "\\s*>", "i"));
  return match ? decodeXml(match[1]) : "";
}

function safeHttpsUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function parseGoogleTrendsRss(xml: string): TrendItem[] {
  const matches = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  const seen = new Set<string>();
  return matches.flatMap((block) => {
    const title = readTag(block, "title");
    if (!title || title.length > 180 || seen.has(title.toLowerCase())) return [];
    seen.add(title.toLowerCase());
    const rawLink = readTag(block, "link");
    const link = safeHttpsUrl(rawLink) || "https://trends.google.com/trending";
    const relatedNews = (block.match(/<ht:news_item\b[^>]*>[\s\S]*?<\/ht:news_item>/gi) ?? [])
      .slice(0, 3)
      .flatMap((news) => {
        const newsTitle = readTag(news, "ht:news_item_title");
        const source = readTag(news, "ht:news_item_source");
        const url = safeHttpsUrl(readTag(news, "ht:news_item_url"));
        if (!newsTitle || !url) return [];
        return [{ title: newsTitle.slice(0, 220), source: source.slice(0, 100), url }];
      });
    return [{
      title,
      traffic: readTag(block, "ht:approx_traffic").slice(0, 40) || "Trending",
      publishedAt: readTag(block, "pubDate").slice(0, 80),
      link,
      relatedNews,
    }];
  }).slice(0, 10);
}

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const region = (url.searchParams.get("region") || "IN").toUpperCase();
  if (!ALLOWED_REGIONS.has(region)) {
    return Response.json({ error: "Choose a supported trends region." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const endpoint = "https://trends.google.com/trending/rss?geo=" + encodeURIComponent(region);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml;q=0.9" },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return Response.json(
        { error: upstream.status === 429 ? "Google Trends is temporarily rate-limiting requests. Please retry shortly." : "Google Trends could not provide the current feed (HTTP " + upstream.status + ")." },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
    const xml = await upstream.text();
    if (xml.length > 250_000 || !/<rss\b|<feed\b/i.test(xml)) {
      return Response.json({ error: "Google Trends returned an unexpected feed response." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const trends = parseGoogleTrendsRss(xml);
    if (!trends.length) {
      return Response.json({ error: "No trending topics were available for this region right now." }, { status: 503, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
    }
    return Response.json(
      { region, source: "Google Trends", fetchedAt: new Date().toISOString(), trends },
      { headers: { "Cache-Control": "public, max-age=900, s-maxage=900", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error && error.name === "AbortError" ? "Google Trends took too long to respond. Please retry." : "Could not reach Google Trends. Check your connection and try again." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
