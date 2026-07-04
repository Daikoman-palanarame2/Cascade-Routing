import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Free-Verify Cascade · Control Panel",
  description:
    "Premium control panel for the Free-Verify Cascade — an early-exit meta-routing graph that minimizes Fireworks token cost while preserving accuracy on AMD ROCm.",
  keywords: [
    "AMD",
    "ROCm",
    "Fireworks AI",
    "Gemma",
    "XGBoost",
    "vLLM",
    "lablab.ai",
    "meta-routing",
    "cascade",
  ],
  authors: [{ name: "Free-Verify Cascade Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Free-Verify Cascade · Control Panel",
    description: "Token-efficient LLM routing on AMD MI300X — built for the AMD Developer Hackathon Act II.",
    siteName: "Free-Verify Cascade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free-Verify Cascade",
    description: "Token-efficient LLM routing on AMD MI300X.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
