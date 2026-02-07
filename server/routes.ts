import type { Express } from "express";
import { createServer, type Server } from "http";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const GOOGLEBOT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Referer": "https://www.google.com/",
};

const GOOGLE_CACHE_PREFIX = "https://webcache.googleusercontent.com/search?q=cache:";

function getBrowserHeaders(url: string) {
  const parsed = new URL(url);
  return {
    ...BROWSER_HEADERS,
    "Referer": `https://www.google.com/search?q=site:${parsed.hostname}`,
  };
}

async function attemptFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(url, {
    headers,
    signal: controller.signal,
    redirect: "follow",
  });
  clearTimeout(timeout);
  return response;
}

function stripPaywall($: cheerio.CheerioAPI) {
  const paywallSelectors = [
    "[class*='paywall']", "[id*='paywall']",
    "[class*='subscribe']", "[id*='subscribe']",
    "[class*='subscription']", "[id*='subscription']",
    "[class*='metered']", "[id*='metered']",
    "[class*='piano']", "[id*='piano']",
    "[class*='gate']", "[id*='gate']",
    "[class*='regwall']", "[id*='regwall']",
    "[class*='login-wall']", "[id*='login-wall']",
    "[class*='premium-content']",
    "[class*='truncated']",
    "[class*='fade-out']", "[class*='fadeout']",
    "[class*='gradient-overlay']",
    "[class*='article-limit']",
    "[class*='nag']", "[id*='nag']",
    "[class*='prompt']", "[id*='prompt']",
    "[class*='modal']", "[id*='modal']",
    "[class*='overlay']", "[id*='overlay']",
    "[class*='popup']", "[id*='popup']",
    "[class*='cookie']", "[id*='cookie']",
    "[class*='consent']", "[id*='consent']",
    "[class*='newsletter']", "[id*='newsletter']",
    "[class*='signup']", "[id*='signup']",
    "[class*='ad-'], [class*='ads-'], [class*='advert']",
    "[id*='ad-'], [id*='ads-']",
  ];

  $(paywallSelectors.join(", ")).remove();

  $("*").each((_i, el) => {
    const style = $(el).attr("style") || "";
    if (
      style.includes("overflow: hidden") ||
      style.includes("overflow:hidden") ||
      style.includes("max-height") ||
      style.includes("-webkit-line-clamp")
    ) {
      $(el).attr("style", "");
    }
  });

  $("*").each((_i, el) => {
    const cls = $(el).attr("class") || "";
    if (
      /\btruncate\b/.test(cls) ||
      /\bline-clamp/.test(cls) ||
      /\boverflow-hidden\b/.test(cls)
    ) {
      $(el).removeClass("truncate line-clamp-1 line-clamp-2 line-clamp-3 line-clamp-4 line-clamp-5 overflow-hidden");
    }
  });
}

function extractContent($: cheerio.CheerioAPI, url: string) {
  $("script, noscript, svg, [role='banner'], [role='navigation'], [role='complementary']").remove();

  stripPaywall($);

  let articleBody = $("article").first();
  if (!articleBody.length) articleBody = $("main").first();
  if (!articleBody.length) articleBody = $("[class*='article-body']").first();
  if (!articleBody.length) articleBody = $("[class*='article-content']").first();
  if (!articleBody.length) articleBody = $("[class*='story-body']").first();
  if (!articleBody.length) articleBody = $("[class*='entry-content']").first();
  if (!articleBody.length) articleBody = $("[itemprop='articleBody']").first();
  if (!articleBody.length) articleBody = $("[class*='content']").first();
  if (!articleBody.length) articleBody = $("[class*='post']").first();
  if (!articleBody.length) articleBody = $("body");

  articleBody.find("style, nav, footer, iframe, header, aside").remove();

  stripPaywall(cheerio.load(articleBody.html() || ""));

  articleBody.find("img").each((_i, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "";
    if (src && !src.startsWith("http") && !src.startsWith("data:")) {
      try {
        $(el).attr("src", new URL(src, url).href);
      } catch {}
    } else if (src) {
      $(el).attr("src", src);
    }
  });

  articleBody.find("a").each((_i, el) => {
    const href = $(el).attr("href");
    if (href && !href.startsWith("http") && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("javascript:")) {
      try {
        $(el).attr("href", new URL(href, url).href);
      } catch {}
    }
    $(el).attr("target", "_blank");
    $(el).attr("rel", "noopener noreferrer");
  });

  const title = $("meta[property='og:title']").attr("content")?.trim() ||
                $("title").text().trim() ||
                $("h1").first().text().trim() ||
                articleBody.find("h1, h2").first().text().trim() ||
                "Untitled Document";

  return {
    title,
    source: url,
    content: articleBody.html() || "",
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/fetch", async (req, res) => {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "A valid URL is required." });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format." });
    }

    try {
      // Strategy: try Googlebot first (gets full content from paywall sites),
      // then browser headers as fallback
      let response = await attemptFetch(url, GOOGLEBOT_HEADERS);

      if (response.status === 403 || response.status === 429) {
        response = await attemptFetch(url, getBrowserHeaders(url));
      }

      if (!response.ok) {
        return res.status(502).json({ error: `Target returned HTTP ${response.status}. The site may be blocking automated access.` });
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        return res.status(400).json({ error: "Target did not return HTML content." });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const result = extractContent($, url);

      return res.json(result);

    } catch (err: any) {
      if (err.name === "AbortError") {
        return res.status(504).json({ error: "Connection timed out after 15 seconds." });
      }
      return res.status(500).json({ error: err.message || "Failed to fetch target." });
    }
  });

  return httpServer;
}
