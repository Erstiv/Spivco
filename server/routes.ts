import type { Express } from "express";
import { createServer, type Server } from "http";
import * as cheerio from "cheerio";
import { gotScraping } from "got-scraping";

const GOOGLEBOT_UA = "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

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

async function scrapePage(url: string): Promise<{ html: string; statusCode: number }> {
  // Attempt 1: got-scraping with browser-like TLS fingerprint (bypasses Cloudflare)
  try {
    const response = await gotScraping({
      url,
      headerGeneratorOptions: {
        browsers: [{ name: "chrome", minVersion: 120 }],
        locales: ["en-US"],
        operatingSystems: ["windows"],
      },
      timeout: { request: 15000 },
      followRedirect: true,
      throwHttpErrors: false,
      headers: {
        "Referer": "https://www.google.com/",
      },
    });

    if (response.statusCode === 200) {
      return { html: response.body, statusCode: 200 };
    }

    // If browser impersonation gets blocked, try Googlebot
    if (response.statusCode === 403 || response.statusCode === 429) {
      const botResponse = await gotScraping({
        url,
        timeout: { request: 15000 },
        followRedirect: true,
        throwHttpErrors: false,
        headers: {
          "User-Agent": GOOGLEBOT_UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Referer": "https://www.google.com/",
        },
      });

      return { html: botResponse.body, statusCode: botResponse.statusCode };
    }

    return { html: response.body, statusCode: response.statusCode };
  } catch (err: any) {
    if (err.code === "ETIMEDOUT" || err.message?.includes("timeout")) {
      throw new Error("Connection timed out after 15 seconds.");
    }
    throw err;
  }
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
      const { html, statusCode } = await scrapePage(url);

      if (statusCode !== 200) {
        return res.status(502).json({ error: `Target returned HTTP ${statusCode}. The site may be blocking automated access.` });
      }

      const $ = cheerio.load(html);
      const result = extractContent($, url);

      return res.json(result);

    } catch (err: any) {
      if (err.message?.includes("timed out")) {
        return res.status(504).json({ error: "Connection timed out after 15 seconds." });
      }
      return res.status(500).json({ error: err.message || "Failed to fetch target." });
    }
  });

  return httpServer;
}
