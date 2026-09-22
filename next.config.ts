import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Same constraint as switch-finance: Parse is browser-only (see lib/parse/client.ts),
  // so no page has anything to render on a server. Exporting to plain files lets
  // Firebase Hosting's CDN serve the whole app instead of paying for a container that
  // would only ever hand back the same HTML.
  //
  // The cost is that dynamic route segments are unavailable (they need
  // generateStaticParams, and the ids only exist in Parse) — so anything addressed by id
  // is a query parameter, and every list filter lives in the query string too.
  output: "export",
  // `npm run dev:local` (local switch-server-v2, see switch-server-v2/docs/04-local-dev.md)
  // compiles into its own folder, so code built against production is never served in
  // local mode, or the reverse.
  ...(process.env.SWITCH_LOCAL === "1" ? { distDir: ".next/local" } : {}),
};

export default nextConfig;
