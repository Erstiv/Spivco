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

function getHeaders(url: string) {
  const parsed = new URL(url);
  return {
    ...BROWSER_HEADERS,
    "Referer": `https://www.google.com/search?q=site:${parsed.hostname}`,
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
      async function attemptFetch(headers: Record<string, string>) {
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

      // Strategy: try as a browser first, fallback to Googlebot on 403
      let response = await attemptFetch(getHeaders(url));

      if (response.status === 403) {
        response = await attemptFetch(GOOGLEBOT_HEADERS);
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

      // Remove the "guards" — scripts, styles, ads, nav bars, etc.
      $("script, style, nav, footer, iframe, header, aside, noscript, [role='banner'], [role='navigation'], [role='complementary']").remove();

      // Remove common ad/tracking elements
      $("[class*='ad-'], [class*='ads-'], [class*='advert'], [id*='ad-'], [id*='ads-'], [class*='cookie'], [class*='popup'], [class*='modal'], [class*='overlay']").remove();

      // Extract the main body
      let articleBody = $("article").first();
      if (!articleBody.length) {
        articleBody = $("main").first();
      }
      if (!articleBody.length) {
        articleBody = $("[class*='content']").first();
      }
      if (!articleBody.length) {
        articleBody = $("[class*='post']").first();
      }
      if (!articleBody.length) {
        articleBody = $("body");
      }

      // Convert relative image URLs to absolute
      articleBody.find("img").each((_i, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("http") && !src.startsWith("data:")) {
          try {
            const absolute = new URL(src, url).href;
            $(el).attr("src", absolute);
          } catch {}
        }
      });

      // Convert relative link URLs to absolute
      articleBody.find("a").each((_i, el) => {
        const href = $(el).attr("href");
        if (href && !href.startsWith("http") && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("javascript:")) {
          try {
            const absolute = new URL(href, url).href;
            $(el).attr("href", absolute);
          } catch {}
        }
        $(el).attr("target", "_blank");
        $(el).attr("rel", "noopener noreferrer");
      });

      // Extract title
      const title = $("title").text().trim() ||
                    $("h1").first().text().trim() ||
                    articleBody.find("h1, h2").first().text().trim() ||
                    "Untitled Document";

      const cleanedHtml = articleBody.html() || "";

      return res.json({
        title,
        source: url,
        content: cleanedHtml,
      });

    } catch (err: any) {
      if (err.name === "AbortError") {
        return res.status(504).json({ error: "Connection timed out after 15 seconds." });
      }
      return res.status(500).json({ error: err.message || "Failed to fetch target." });
    }
  });

  return httpServer;
}
