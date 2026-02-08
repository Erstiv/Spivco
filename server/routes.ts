import type { Express } from "express";
import { createServer, type Server } from "http";
import * as cheerio from "cheerio";

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options;
  return fetch(url, {
    ...fetchOptions,
    signal: AbortSignal.timeout(timeout),
    redirect: "follow",
  });
}

function markdownToHtml(md: string): string {
  let html = md;
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  const lines = html.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    if (trimmed.startsWith("<h") || trimmed.startsWith("<hr") || trimmed.startsWith("<li") || trimmed.startsWith("<blockquote") || trimmed.startsWith("<img")) {
      result.push(trimmed);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }
  return result.join("\n");
}

const GOOGLEBOT_UA = "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const CHROMIUM_PATH = "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";

function stripPaywall($: cheerio.CheerioAPI) {
  const paywallSelectors = [
    "[class*='paywall']", "[id*='paywall']",
    "[class*='subscribe']", "[id*='subscribe']",
    "[class*='subscription']", "[id*='subscription']",
    "[class*='metered-paywall']", "[class*='metered-wall']", "[class*='meter-overlay']",
    "[id*='metered-paywall']", "[id*='metered-wall']",
    "[class*='piano']", "[id*='piano']",
    "[class*='paywall-gate']", "[class*='pay-gate']", "[class*='content-gate']",
    "[class*='reggate']", "[id*='reggate']",
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
    "[class*='revcontent'], [class*='revcon']",
    "[class*='sbn-'], [data-widget-host='revcontent']",
    "[class*='taboola'], [id*='taboola']",
    "[class*='outbrain'], [id*='outbrain']",
    "[class*='related-articles'], [class*='recommended']",
    "[class*='trinity-tts']",
    ".share-facebook, .share-twitter, .share-reddit, .share-print",
    ".sharedaddy, .sd-sharing-enabled",
    "[class*='article-share'], [class*='article-bottom-share']",
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

async function extractContent($: cheerio.CheerioAPI, url: string) {
  $("script, noscript, svg, [role='banner'], [role='navigation'], [role='complementary']").remove();
  $("[id*='wm-ipp'], #wm-ipp-base, #wm-ipp-print, .wb-autocomplete-suggestions").remove();
  $("[data-testid='inline-message'], [class*='ad-wrapper'], [class*='AdWrapper']").remove();
  $("[class*='RelatedContent'], [data-testid='related-content']").remove();

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
  articleBody.find("[data-testid='vertical-collection'], .siteCollection, [class*='OUTBRAIN'], [id*='OUTBRAIN']").remove();
  articleBody.find("ol:has(li a[data-testid='item-link'])").remove();
  articleBody.find("video, [class*='video-player'], [class*='video-object']").remove();
  articleBody.find("[class*='ad '], [class*='ad-'], [id*='banner'], [data-ad-label]").remove();
  articleBody.find("[class*='skip-ad'], [class*='advert'], [class*='dfp']").remove();
  articleBody.find("[class*='see-more'], [class*='SeeMore'], [class*='RelatedContent']").remove();
  articleBody.find("[aria-label='advertisement'], [aria-label='Advertisement']").remove();

  articleBody.find("p, a, span, div").each((_i, el) => {
    const ownText = $(el).clone().children().remove().end().text().trim();
    if (
      ownText === "Advertisement" ||
      ownText === "SKIP ADVERTISEMENT" ||
      ownText === "Supported by" ||
      ownText === "Related Content"
    ) {
      $(el).remove();
    }
    if (ownText.startsWith("See more on:")) {
      $(el).remove();
    }
  });

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
    const response = await fetchWithTimeout(url, {
      timeout: 15000,
      headers: {
        "User-Agent": CHROME_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
      },
    });

    if (response.ok) {
      return { html: await response.text(), statusCode: 200 };
    }

    if (response.status === 403 || response.status === 429 || response.status === 503) {
      const botResponse = await fetchWithTimeout(url, {
        timeout: 15000,
        headers: {
          "User-Agent": GOOGLEBOT_UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Referer": "https://www.google.com/",
        },
      });

      if (botResponse.ok) {
        return { html: await botResponse.text(), statusCode: 200 };
      }

      console.log(`Googlebot also blocked (${botResponse.status}). Trying social media bot UA...`);
      const socialBotUAs = [
        "facebookexternalhit/1.1",
        "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      ];

      for (const ua of socialBotUAs) {
        try {
          const socialResponse = await fetchWithTimeout(url, {
            timeout: 15000,
            headers: {
              "User-Agent": ua,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          });

          if (socialResponse.ok) {
            const html = await socialResponse.text();
            if (html.length > 1000) {
              console.log(`Social bot UA (${ua.split("/")[0]}) got through! (${html.length} bytes)`);
              return { html, statusCode: 200 };
            }
          }
        } catch {}
      }

      const fallbackBody = await botResponse.text().catch(() => "");
      return { html: fallbackBody, statusCode: botResponse.status };
    }

    const body = await response.text().catch(() => "");
    return { html: body, statusCode: response.status };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.message?.includes("timeout")) {
      throw new Error("Connection timed out.");
    }
    throw err;
  }
}

async function getViaMercenary(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetchWithTimeout(jinaUrl, {
      timeout: 25000,
      headers: {
        "User-Agent": CHROME_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      console.log(`Mercenary returned HTTP ${response.status}`);
      return null;
    }

    const text = await response.text();

    if (
      text.includes("To verify you are a human") ||
      text.includes("Enable JavaScript and cookies") ||
      text.includes("Just a moment") ||
      text.includes("Checking if the site connection is secure")
    ) {
      console.log("Mercenary was blocked by target.");
      return null;
    }

    if (text.trim().length < 100) {
      console.log("Mercenary returned too little content.");
      return null;
    }

    let title = "Untitled Document";
    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    let markdownBody = text;
    const contentStart = text.indexOf("Markdown Content:");
    if (contentStart !== -1) {
      markdownBody = text.substring(contentStart + "Markdown Content:".length).trim();
    }

    const htmlContent = markdownToHtml(markdownBody);

    return { title, content: htmlContent };
  } catch (err: any) {
    console.error("Mercenary error:", err.message);
    return null;
  }
}

async function scrapeWithBrowser(url: string): Promise<{ html: string } | null> {
  let browser;
  try {
    let chromium;
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      console.log("Playwright not available, skipping headless browser strategy.");
      return null;
    }

    browser = await chromium.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-gpu", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.google.com/",
      },
    });

    const page = await context.newPage();

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

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
        await page.waitForURL("**/*", { timeout: 15000, waitUntil: "domcontentloaded" });
      } catch {
        await page.waitForTimeout(8000);
      }
    }

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const selectors = [
        "[class*='paywall']", "[id*='paywall']",
        "[class*='subscribe']", "[class*='gate']",
        "[class*='modal']", "[class*='overlay']",
        "[class*='popup']", "[class*='cookie']",
        "[class*='consent']", "[class*='regwall']",
        "[class*='ad-']", "[class*='ads-']",
        "[class*='revcontent']", "[class*='revcon']",
        "[class*='sbn-']", "[data-widget-host='revcontent']",
        "[class*='taboola']", "[id*='taboola']",
        "[class*='outbrain']", "[id*='outbrain']",
        "[class*='trinity-tts']",
        "[class*='article-share']", "[class*='article-bottom-share']",
        ".sharedaddy", ".sd-sharing-enabled",
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
    const apiResponse = await fetchWithTimeout(apiUrl, { timeout: 10000 });

    if (!apiResponse.ok) return null;

    const data = await apiResponse.json() as any;
    const snapshot = data?.archived_snapshots?.closest;

    if (!snapshot?.url) return null;

    const snapshotUrl: string = snapshot.url;
    const archiveResponse = await fetchWithTimeout(snapshotUrl, { timeout: 15000 });

    if (archiveResponse.ok) {
      const html = await archiveResponse.text();
      return { html, archiveUrl: snapshotUrl };
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
      let frontDoorFailed = false;
      try {
        const { html, statusCode } = await scrapeLive(url);

        if (statusCode === 200) {
          const $ = cheerio.load(html);
          const result = await extractContent($, url);

          const plainText = result.content.replace(/<[^>]*>/g, "").trim();
          const textLen = plainText.length;

          const jsPlaceholders = [
            "getting your trinity audio player ready",
            "loading...",
            "please enable javascript",
            "this content requires javascript",
            "subscriber exclusive",
            "subscribe to continue reading",
            "you must be a subscriber",
          ];
          const lowerText = plainText.toLowerCase();
          const hasPlaceholder = jsPlaceholders.some(p => lowerText.includes(p));

          const paragraphs = result.content.match(/<p[\s>]/gi) || [];
          const hasMeaningfulStructure = paragraphs.length >= 3;

          if (textLen > 500 && hasMeaningfulStructure && !hasPlaceholder) {
            return res.json({ ...result, source: url, method: "live" });
          }
          console.log(`Live content insufficient (${textLen} chars, ${paragraphs.length} paragraphs, placeholder: ${hasPlaceholder}). Escalating...`);
        } else {
          console.log(`Front door returned HTTP ${statusCode}. Escalating...`);
        }
        frontDoorFailed = true;
      } catch (err: any) {
        console.log(`Front door failed: ${err.message}. Escalating...`);
        frontDoorFailed = true;
      }

      // STRATEGY 2: The Mercenary (Jina.ai reader)
      if (frontDoorFailed) {
        console.log(`Sending the Mercenary to ${url}...`);
        const mercResult = await getViaMercenary(url);

        if (mercResult && mercResult.content.replace(/<[^>]*>/g, "").trim().length > 100) {
          return res.json({
            ...mercResult,
            source: url,
            method: "mercenary",
          });
        }
        console.log("Mercenary came back empty. Trying headless browser...");
      }

      // STRATEGY 3: The Heavy Hitter (Headless Browser)
      console.log(`Launching headless browser for ${url}...`);
      const browserResult = await scrapeWithBrowser(url);

      if (browserResult) {
        const $b = cheerio.load(browserResult.html);
        const headlessResult = await extractContent($b, url);
        const headlessTextLen = headlessResult.content.replace(/<[^>]*>/g, "").trim().length;

        if (headlessTextLen > 100) {
          return res.json({
            ...headlessResult,
            source: url,
            method: "headless",
          });
        }
      }

      // STRATEGY 4: The Archive (Wayback Machine — last resort)
      console.log(`All active methods failed. Checking the Archive for ${url}...`);
      const archive = await getFromArchive(url);

      if (archive) {
        const $a = cheerio.load(archive.html);
        const archiveResult = await extractContent($a, url);
        const archiveTextLen = archiveResult.content.replace(/<[^>]*>/g, "").trim().length;

        if (archiveTextLen > 100) {
          return res.json({
            ...archiveResult,
            source: archive.archiveUrl,
            method: "archive",
          });
        }
      }

      return res.status(502).json({
        error: "Target is locked down tight. All four strategies failed.",
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
