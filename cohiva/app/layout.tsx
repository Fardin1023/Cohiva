import type { Metadata } from "next";

import {
  Geist_Mono,
  Noto_Sans,
} from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";

import { cn } from "@/lib/utils";

import StreamVideoProvider from "@/components/providers/StreamVideoProvider";

import "./globals.css";

/* =========================================================
   FONTS

   Only the two families Cohiva actually uses are loaded.
   Removing unused font families reduces font requests and
   CSS/font payload on every route.
========================================================= */

const notoSans =
  Noto_Sans({
    subsets: ["latin"],
    variable: "--font-sans",
    display: "swap",
  });

const geistMono =
  Geist_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
    display: "swap",
  });

/* =========================================================
   METADATA
========================================================= */

export const metadata: Metadata = {
  title: "Cohiva",
  description:
    "Meet, connect, and collaborate with Cohiva.",
};

/* =========================================================
   ROOT LAYOUT
========================================================= */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={cn(
          "h-full antialiased",
          notoSans.variable,
          geistMono.variable,
          "font-sans"
        )}
      >
        <body
          suppressHydrationWarning
          className="flex min-h-full flex-col"
        >
          <StreamVideoProvider>
            {children}
          </StreamVideoProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
