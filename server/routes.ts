import type { Express } from "express";
import { createServer, type Server } from "http";
import * as cheerio from "cheerio";
import { gotScraping } from "got-scraping";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

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
  $("[id*='wm-ipp'], #wm-ipp-base, #wm-ipp-print, .wb-autocomplete-suggestions").remove();

  stripPaywall($);

  const selectors = [
    "article",
    "main",
    "[class*='article-body']",
    "[class*='article-content']",
    "[class*='story-body']",
    "[class*='entry-content']",
    "[itemprop='articleBody']",
    "[class*='content']",
    "[class*='post']",
  ];

  let articleBody: cheerio.Cheerio<any> | null = null;

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 100) {
      articleBody = el;
      break;
    }
  }

  if (!articleBody) {
    let bestDiv: cheerio.Cheerio<any> | null = null;
    let bestLen = 0;
    $("div").each((_i, el) => {
      const textLen = $(el).text().trim().length;
      if (textLen > bestLen) {
        bestLen = textLen;
        bestDiv = $(el);
      }
    });
    articleBody = bestDiv && bestLen > 100 ? bestDiv : $("body");
  }

  articleBody.find("style, nav, footer, iframe, header, aside, form, button").remove();

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
    content: articleBody.html() || "",
  };
}

async function scrapeLive(url: string): Promise<{ html: string; statusCode: number }> {
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

    if (response.statusCode === 403 || response.statusCode === 429 || response.statusCode === 503) {
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
      throw new Error("Connection timed out.");
    }
    throw err;
  }
}

const CHROMIUM_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";

async function scrapeWithBrowser(url: string): Promise<{ html: string } | null> {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--mute-audio",
        "--hide-scrollbars",
      ],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.google.com/",
    });

    await page.setViewport({ width: 1920, height: 1080 });

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    const needsWait = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      const body = document.body?.innerText?.toLowerCase() || "";
      return (
        title.includes("just a moment") ||
        title.includes("checking your browser") ||
        title.includes("attention required") ||
        body.includes("checking if the site connection is secure") ||
        body.includes("enable javascript and cookies")
      );
    });

    if (needsWait) {
      console.log("Cloudflare challenge detected. Waiting for resolution...");
      try {
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 });
      } catch {
        await new Promise(r => setTimeout(r, 8000));
      }
    }

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise(r => setTimeout(r, 1500));

    await page.evaluate(() => {
      const selectors = [
        "[class*='paywall']", "[id*='paywall']",
        "[class*='subscribe']", "[class*='gate']",
        "[class*='modal']", "[class*='overlay']",
        "[class*='popup']", "[class*='cookie']",
        "[class*='consent']", "[class*='regwall']",
        "[class*='ad-']", "[class*='ads-']",
      ];
      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });

      document.querySelectorAll("*").forEach((el) => {
        const style = (el as HTMLElement).style;
        if (style) {
          style.overflow = "";
          style.maxHeight = "";
        }
      });
    });

    const finalTitle = await page.title();
    if (
      finalTitle.toLowerCase().includes("just a moment") ||
      finalTitle.toLowerCase().includes("attention required") ||
      finalTitle.toLowerCase().includes("access denied")
    ) {
      console.log("Cloudflare challenge could not be bypassed.");
      return null;
    }

    const html = await page.content();
    return { html };
  } catch (err: any) {
    console.error("Headless browser error:", err.message);
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

async function getFromArchive(url: string): Promise<{ html: string; archiveUrl: string } | null> {
  try {
    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const apiResponse = await gotScraping({
      url: apiUrl,
      timeout: { request: 10000 },
      throwHttpErrors: false,
      responseType: "json",
    });

    const data = apiResponse.body as any;
    const snapshot = data?.archived_snapshots?.closest;

    if (!snapshot?.url) return null;

    const snapshotUrl: string = snapshot.url;
    const archiveResponse = await gotScraping({
      url: snapshotUrl,
      timeout: { request: 15000 },
      followRedirect: true,
      throwHttpErrors: false,
    });

    if (archiveResponse.statusCode === 200) {
      return { html: archiveResponse.body, archiveUrl: snapshotUrl };
    }

    return null;
  } catch {
    return null;
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
      // STRATEGY 1: The Front Door (browser impersonation + Googlebot fallback)
      const { html, statusCode } = await scrapeLive(url);

      if (statusCode === 200) {
        const $ = cheerio.load(html);
        const result = extractContent($, url);

        const textLen = result.content.replace(/<[^>]*>/g, "").trim().length;
        if (textLen > 200) {
          return res.json({ ...result, source: url, method: "live" });
        }
        console.log(`Live content too thin (${textLen} chars). Likely JS-rendered. Escalating...`);
      }

      // STRATEGY 2: The Back Door (Wayback Machine Archive)
      console.log(`Trying Archive for ${url}...`);
      const archive = await getFromArchive(url);

      if (archive) {
        const $a = cheerio.load(archive.html);
        const archiveResult = extractContent($a, url);
        const archiveTextLen = archiveResult.content.replace(/<[^>]*>/g, "").trim().length;

        if (archiveTextLen > 200) {
          return res.json({
            ...archiveResult,
            source: archive.archiveUrl,
            method: "archive",
          });
        }
        console.log(`Archive content too thin (${archiveTextLen} chars). Escalating to headless...`);
      }

      // STRATEGY 3: The Heavy Hitter (Headless Browser)
      console.log(`Launching headless browser for ${url}...`);
      const browserResult = await scrapeWithBrowser(url);

      if (browserResult) {
        const $b = cheerio.load(browserResult.html);
        const headlessResult = extractContent($b, url);
        const headlessTextLen = headlessResult.content.replace(/<[^>]*>/g, "").trim().length;

        if (headlessTextLen > 50) {
          return res.json({
            ...headlessResult,
            source: url,
            method: "headless",
          });
        }
      }

      return res.status(502).json({
        error: "Target is locked down tight. All three strategies failed.",
      });

    } catch (err: any) {
      if (err.message?.includes("timed out")) {
        return res.status(504).json({ error: "Connection timed out." });
      }
      return res.status(500).json({ error: err.message || "Failed to fetch target." });
    }
  });

  return httpServer;
}
