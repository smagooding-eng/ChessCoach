import { useEffect } from "react";
import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

// Any address that isn't a real page lands here. The site serves the app for
// every address, so without this Google treats junk addresses (bots probing
// for things like /cleaner.php) as real pages of the site. "noindex" tells
// search engines this isn't a page to list.
export default function NotFound() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = "Page not found · ChessScout.net";
    return () => { meta.remove(); document.title = prevTitle; };
  }, []);

  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl p-6 text-center" style={{ background: "#0F1718", border: "1px solid rgba(255,255,255,.08)" }}>
        <AlertCircle className="mx-auto h-9 w-9" style={{ color: "#81B64C" }} />
        <h1 className="mt-3 text-2xl font-black" style={{ color: "#F5F7F6" }}>Page not found</h1>
        <p className="mt-2 text-sm" style={{ color: "#87918E" }}>This page doesn&apos;t exist or has moved.</p>
        <Link href="/" className="mt-5 inline-flex rounded-xl px-5 py-2.5 text-sm font-extrabold" style={{ background: "#81B64C", color: "#05100A" }}>
          Go to ChessScout
        </Link>
      </div>
    </div>
  );
}
