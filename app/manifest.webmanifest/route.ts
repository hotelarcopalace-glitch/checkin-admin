// The guest app manifest ("Checkin — My Messages"). It is served by a route instead of Next's app/manifest.ts
// file convention, because that convention links this manifest on EVERY page and overrides a layout's own
// manifest. BuildKhata (/build) needs its own manifest, or an iPhone home-screen icon opens the Checkin site.
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: "Checkin — My Messages",
    short_name: "Checkin",
    description: "View your hotel messages and alerts by mobile number.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" },
  });
}
