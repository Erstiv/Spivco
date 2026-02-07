import type { Express } from "express";
import { createServer, type Server } from "http";
import * as cheerio from "cheerio";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Referer": "https://www.google.com/",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: HEADERS,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(502).json({ error: `Target returned HTTP ${response.status}` });
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
