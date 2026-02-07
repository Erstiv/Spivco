import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileText, Loader2, ShieldAlert, VenetianMask, Terminal, X } from "lucide-react";

// Mock "Intercepted" Data since we can't actually proxy without a backend
const INTERCEPTED_DOCUMENTS = [
  {
    title: "The Architecture of Shadows",
    source: "https://underground-arch.net/manifesto",
    content: `
      <p>In the digital age, invisibility is the only true luxury. While the masses trade privacy for convenience, a new architecture is being built in the negative spaces of the internet.</p>
      
      <h3>The Protocol</h3>
      <p>We observed the traffic patterns for three weeks. The signals are clear: centralization is decaying. The "Cloud" is not a nebula, but a fortress. And every fortress has a back door.</p>
      
      <blockquote>"If you can't be seen, you can't be stopped." - Unknown</blockquote>
      
      <p>Our extraction methods have improved. The new Spiv toolkit allows for seamless traversal across the barriers. We move like water through the cracks of their firewalls. The data we retrieve is not just information; it is leverage.</p>
      
      <p>End of transmission.</p>
    `
  },
  {
    title: "Project: SILENT ECHO",
    source: "https://classified-research.org/report-99",
    content: `
      <p><strong>CONFIDENTIAL // LEVEL 4 CLEARANCE</strong></p>
      <p>Subject observed attempting to bypass the perimeter algorithms at 0400 hours. Counter-measures were deployed effectively, but traces remain.</p>
      
      <h3>Anomaly Detection</h3>
      <p>The anomaly presents as a standard search bot, but the headers are forged with exceptional quality. It identifies as "Googlebot/2.1" but the handshake timing is off by 12 milliseconds. A deliberate error? Or a signature?</p>
      
      <p>We recommend immediate patch cycles for all external-facing nodes. The Spiv agents are getting bolder.</p>
    `
  }
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "fetching" | "cleaning" | "success" | "error">("idle");
  const [data, setData] = useState<typeof INTERCEPTED_DOCUMENTS[0] | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `> ${msg}`]);
  };

  const handleFetch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    // Reset
    setStatus("fetching");
    setData(null);
    setLogs([]);
    
    // Simulate the "Spiv" process
    addLog(`Initiating connection to target...`);
    addLog(`Spoofing User-Agent: Googlebot/2.1`);
    
    setTimeout(() => {
      addLog(`Handshake successful. 200 OK.`);
      setStatus("cleaning");
      addLog(`Injecting beautifulsoup parser...`);
      
      setTimeout(() => {
        addLog(`Stripping ads and trackers...`);
        addLog(`Decomposing <script> tags...`);
        addLog(`Extracting payload...`);
        
        setTimeout(() => {
          // Pick a random mock doc to display
          const randomDoc = INTERCEPTED_DOCUMENTS[Math.floor(Math.random() * INTERCEPTED_DOCUMENTS.length)];
          setData({ ...randomDoc, source: url }); // use user's URL for immersion
          setStatus("success");
          addLog(`Extraction complete.`);
        }, 1200);
      }, 1000);
    }, 1500);
  };

  const handleReset = () => {
    setStatus("idle");
    setData(null);
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
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter uppercase">Project Spiv</h1>
          <p className="text-muted-foreground italic max-w-md mx-auto">
            "We tell the website we are Google. They roll out the red carpet."
          </p>
        </header>

        {/* Search Input - Hidden when reading content to focus attention */}
        {status !== "success" && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-2 border-2 border-foreground shadow-[8px_8px_0px_0px_var(--color-foreground)] transition-transform focus-within:translate-x-[2px] focus-within:translate-y-[2px] focus-within:shadow-[4px_4px_0px_0px_var(--color-foreground)]"
          >
            <form onSubmit={handleFetch} className="flex flex-col md:flex-row gap-2">
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
                />
              </div>
              <button
                type="submit"
                disabled={status === "fetching" || status === "cleaning"}
                className="bg-foreground text-background px-8 py-3 font-bold uppercase hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[140px]"
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
          {(status === "fetching" || status === "cleaning") && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="font-mono text-xs md:text-sm text-green-700 bg-black/5 p-4 border border-foreground/20 rounded-sm overflow-hidden"
            >
              {logs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))}
              <div className="animate-pulse">_</div>
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
                >
                  <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>

                {/* Meta Stamp */}
                <div className="absolute top-4 right-4 md:top-8 md:right-8 rotate-12 opacity-80 pointer-events-none">
                  <div className="border-4 border-accent text-accent px-4 py-1 font-display font-bold text-xl uppercase tracking-widest rounded-sm">
                    Cleaned
                  </div>
                </div>

                <div className="border-b border-foreground/20 pb-6 mb-8 mt-8">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    <FileText size={14} />
                    <span>Intercepted Content</span>
                  </div>
                  <h2 className="font-display text-3xl md:text-4xl mb-4 leading-tight">{data.title}</h2>
                  <div className="text-xs font-mono text-muted-foreground break-all">
                    Source: <span className="text-accent">{data.source}</span>
                  </div>
                </div>

                <div 
                  className="prose prose-neutral max-w-none prose-p:font-mono prose-headings:font-display prose-headings:uppercase prose-blockquote:border-l-4 prose-blockquote:border-accent prose-blockquote:bg-accent/5 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:not-italic"
                  dangerouslySetInnerHTML={{ __html: data.content }}
                />

                <div className="mt-12 pt-6 border-t border-dotted border-foreground/40 text-center">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Project Spiv // End of File
                  </p>
                </div>
              </article>
              
              <div className="mt-8 flex justify-center">
                <button 
                  onClick={handleReset}
                  className="text-sm font-bold uppercase tracking-widest border-b-2 border-transparent hover:border-foreground transition-all"
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
            >
              <ShieldAlert className="mx-auto mb-2" />
              <p>The job went south. Target rejected the connection.</p>
              <button 
                onClick={handleReset}
                className="mt-4 text-sm underline font-bold"
              >
                Try Another Frequency
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
      
      {/* Background Noise/Effect */}
      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-20" 
           style={{ backgroundImage: "radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.1) 100%)" }} 
      />
    </div>
  );
}
