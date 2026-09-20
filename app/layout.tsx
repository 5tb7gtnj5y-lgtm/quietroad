import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuietRoad — Find quieter times to travel",
  description: "Compare historical UK road traffic by hour, plan a journey and find Greggs near the route.",
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
