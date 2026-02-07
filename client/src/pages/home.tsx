import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, Loader2, ShieldAlert, VenetianMask, X, Archive, Wifi, Monitor } from "lucide-react";

interface FetchedDoc {
  title: string;
  source: string;
  content: string;
  method: "live" | "archive" | "headless";
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "fetching" | "cleaning" | "success" | "error">("idle");
  const [data, setData] = useState<FetchedDoc | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `> ${msg}`]);
  };

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setStatus("fetching");
    setData(null);
    setErrorMsg("");
    setLogs([]);

    addLog("Initiating connection to target...");
    addLog("Spoofing TLS fingerprint: Chrome/131");
    addLog("Setting Referer: google.com");

    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const body = await res.json().catch(() => ({ error: "Unknown error" }));

      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      if (body.method === "headless") {
        addLog("Front door locked. Archive empty.");
        addLog("Deploying the heavy hitter...");
        addLog("Launching headless Chromium browser...");
        addLog("Rendering JavaScript. Waiting for page load...");
        addLog("Stripping paywalls from live DOM...");
        addLog("Content rendered and captured.");
      } else if (body.method === "archive") {
        addLog("Front door locked. Trying the back door...");
        addLog("Querying Wayback Machine archive...");
        addLog("Snapshot found. Retrieving cached version...");
      } else {
        addLog("Handshake successful. 200 OK.");
      }

      setStatus("cleaning");
      addLog("Parsing HTML with cheerio...");

      await new Promise(r => setTimeout(r, 500));

      addLog("Stripping scripts, ads, and trackers...");
      addLog("Removing paywall overlays...");
      addLog("Resolving relative URLs...");

      await new Promise(r => setTimeout(r, 300));

      addLog("Extraction complete.");
      setData(body as FetchedDoc);
      setStatus("success");
    } catch (err: any) {
      setErrorMsg(err.message || "Connection failed.");
      setStatus("error");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setData(null);
    setErrorMsg("");
    setLogs([]);
    setUrl("");
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center font-mono selection:bg-accent selection:text-white">

      <div className="max-w-3xl w-full space-y-8">

        {/* Header */}
        <header className="text-center space-y-4 border-b-2 border-foreground pb-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-foreground text-background rounded-full">
              <VenetianMask size={48} strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter uppercase" data-testid="text-title">Project Spiv</h1>
          <p className="text-muted-foreground italic max-w-md mx-auto">
            "We tell the website we are Google. They roll out the red carpet."
          </p>
        </header>

        {/* Search Input */}
        {status !== "success" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-2 border-2 border-foreground shadow-[8px_8px_0px_0px_var(--color-foreground)] transition-transform focus-within:translate-x-[2px] focus-within:translate-y-[2px] focus-within:shadow-[4px_4px_0px_0px_var(--color-foreground)]"
          >
            <form onSubmit={handleFetch} className="flex flex-col md:flex-row gap-2" data-testid="form-fetch">
              <div className="flex-grow relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Search size={20} />
                </div>
                <input
                  type="url"
                  placeholder="Paste target URL to infiltrate..."
                  className="w-full pl-10 pr-4 py-3 bg-transparent outline-none font-bold placeholder:font-normal placeholder:text-muted-foreground/70"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  data-testid="input-url"
                />
              </div>
              <button
                type="submit"
                disabled={status === "fetching" || status === "cleaning"}
                className="bg-foreground text-background px-8 py-3 font-bold uppercase hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[140px]"
                data-testid="button-extract"
              >
                {status === "fetching" || status === "cleaning" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  "Extract"
                )}
              </button>
            </form>
          </motion.div>
        )}

        {/* Logs Console */}
        <AnimatePresence>
          {logs.length > 0 && status !== "success" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="font-mono text-xs md:text-sm text-green-700 bg-black/5 p-4 border border-foreground/20 rounded-sm overflow-hidden"
              data-testid="text-logs"
            >
              {logs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))}
              {(status === "fetching" || status === "cleaning") && (
                <div className="animate-pulse">_</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result Area */}
        <AnimatePresence mode="wait">
          {status === "success" && data && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative"
              data-testid="card-result"
            >
              {/* Paper Stack Effect */}
              <div className="absolute inset-0 bg-white border border-foreground translate-x-2 translate-y-2 z-0" />

              {/* Main Content Card */}
              <article className="relative z-10 bg-[#fffdf5] border border-foreground p-8 md:p-12 shadow-sm">

                {/* Close Button */}
                <button
                  onClick={handleReset}
                  className="absolute top-4 left-4 p-2 hover:bg-black/5 rounded-full transition-colors group"
                  title="Close File"
                  data-testid="button-close"
                >
                  <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>

                {/* Status Stamp */}
                <div className="absolute top-4 right-4 md:top-8 md:right-8 rotate-12 opacity-80 pointer-events-none">
                  {data.method === "headless" ? (
                    <div className="border-4 border-violet-600 text-violet-600 px-4 py-1 font-display font-bold text-lg uppercase tracking-widest rounded-sm">
                      Rendered
                    </div>
                  ) : data.method === "archive" ? (
                    <div className="border-4 border-amber-600 text-amber-600 px-4 py-1 font-display font-bold text-lg uppercase tracking-widest rounded-sm">
                      Archive
                    </div>
                  ) : (
                    <div className="border-4 border-accent text-accent px-4 py-1 font-display font-bold text-xl uppercase tracking-widest rounded-sm">
                      Cleaned
                    </div>
                  )}
                </div>

                {/* Method Badge */}
                <div className="mt-8 mb-4">
                  {data.method === "headless" ? (
                    <div className="inline-flex items-center gap-2 bg-violet-900/10 text-violet-800 px-3 py-1.5 text-xs font-bold uppercase tracking-wider" data-testid="badge-method">
                      <Monitor size={14} />
                      Headless browser deployed. JavaScript rendered.
                    </div>
                  ) : data.method === "archive" ? (
                    <div className="inline-flex items-center gap-2 bg-amber-900/10 text-amber-800 px-3 py-1.5 text-xs font-bold uppercase tracking-wider" data-testid="badge-method">
                      <Archive size={14} />
                      Front door locked. Retrieved from Archive.
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 bg-green-900/10 text-green-800 px-3 py-1.5 text-xs font-bold uppercase tracking-wider" data-testid="badge-method">
                      <Wifi size={14} />
                      Live version secured.
                    </div>
                  )}
                </div>

                <div className="border-b border-foreground/20 pb-6 mb-8">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    <FileText size={14} />
                    <span>Intercepted Content</span>
                  </div>
                  <h2 className="font-display text-3xl md:text-4xl mb-4 leading-tight" data-testid="text-article-title">{data.title}</h2>
                  <div className="text-xs font-mono text-muted-foreground break-all">
                    Source: <span className="text-accent" data-testid="text-source">{data.source}</span>
                  </div>
                </div>

                <div
                  className="prose prose-neutral max-w-none prose-p:font-mono prose-headings:font-display prose-headings:uppercase prose-blockquote:border-l-4 prose-blockquote:border-accent prose-blockquote:bg-accent/5 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:not-italic prose-img:max-w-full prose-img:rounded-sm prose-a:text-accent prose-a:no-underline hover:prose-a:underline"
                  dangerouslySetInnerHTML={{ __html: data.content }}
                  data-testid="text-content"
                />

                <div className="mt-12 pt-6 border-t border-dotted border-foreground/40 text-center">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Project Spiv v2.0 // End of File
                  </p>
                </div>
              </article>

              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleReset}
                  className="text-sm font-bold uppercase tracking-widest border-b-2 border-transparent hover:border-foreground transition-all"
                  data-testid="button-reset"
                >
                  Intercept Another Target
                </button>
              </div>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-red-50 border border-red-900/20 p-6 text-center text-red-900"
              data-testid="text-error"
            >
              <ShieldAlert className="mx-auto mb-2" />
              <p className="font-bold mb-1">The Job Went South</p>
              <p className="text-sm">{errorMsg}</p>
              <button
                onClick={handleReset}
                className="mt-4 text-sm underline font-bold"
                data-testid="button-retry"
              >
                Try Another Frequency
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Background Vignette */}
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-20"
           style={{ backgroundImage: "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.1) 100%)" }}
      />
    </div>
  );
}
