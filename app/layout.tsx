import type { Metadata } from "next";
import { MarketplaceProvider } from "@/components/marketplace-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:5173"),
  title: { default: "Model Car Center — Every Seller. One Search.", template: "%s | Model Car Center" },
  description: "Find model cars from independent sellers in one place.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "Model Car Center — Every Seller. One Search.",
    description: "Find model cars from independent sellers in one place.",
    siteName: "Model Car Center",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Model Car Center — Every seller. One search." }],
  },
  twitter: { card: "summary_large_image", title: "Model Car Center", description: "Every seller. One search.", images: ["/og.png"] },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="antialiased"><MarketplaceProvider>{children}</MarketplaceProvider></body></html>;
}
