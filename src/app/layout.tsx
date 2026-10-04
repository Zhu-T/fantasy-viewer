import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaSetup } from "@/components/PwaSetup";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/* Clocks, kickoff times, lineup slots and team codes. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fantasy Viewer",
  description: "Live results for every ESPN fantasy football league you're in.",
  applicationName: "Fantasy Viewer",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Fantasy",
    statusBarStyle: "black",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#121212",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium shadow-card focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to Content
        </a>
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
