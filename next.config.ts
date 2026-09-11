import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright must run as a real Node module (it spawns a browser process).
  serverExternalPackages: ["playwright"],
  async headers() {
    return [
      {
        // Browsers must always pick up the newest service worker.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
