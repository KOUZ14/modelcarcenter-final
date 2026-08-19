import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Car Center — Every Seller. One Search.",
  description: "Find and buy collectible model cars from trusted sellers in one place.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
