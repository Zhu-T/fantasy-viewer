import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright must run as a real Node module (it spawns a browser process).
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
