import type { Metadata, Viewport } from "next";
import { MarketplaceProvider } from "@/components/marketplace-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:5173"),
  applicationName: "Model Car Center",
  title: { default: "Model Car Center — Every Seller. One Search.", template: "%s | Model Car Center" },
  description: "Find model cars from independent sellers in one place.",
  manifest: "/manifest.webmanifest",
  category: "shopping",
  creator: "Model Car Center",
  publisher: "Model Car Center",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "Model Car Center — Every Seller. One Search.",
    description: "Find model cars from independent sellers in one place.",
    siteName: "Model Car Center",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Model Car Center — Every seller. One search." }],
  },
  twitter: { card: "summary_large_image", title: "Model Car Center", description: "Every seller. One search.", images: ["/og.png"] },
  icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/icon-32.png?v=2", sizes: "32x32", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.svg?v=2", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Model Car Center",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#0b0b0c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="antialiased"><MarketplaceProvider>{children}</MarketplaceProvider></body></html>;
}
