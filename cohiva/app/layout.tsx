import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Noto_Sans,
  Playfair_Display,
} from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";

import { cn } from "@/lib/utils";
import StreamVideoProvider from "@/components/providers/StreamVideoProvider";

import "@stream-io/video-react-sdk/dist/css/styles.css";
import "./globals.css";

/* =====================================================
   FONTS
===================================================== */

const playfairDisplayHeading = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-heading",
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/* =====================================================
   METADATA
===================================================== */

export const metadata: Metadata = {
  title: "Cohiva",
  description: "Meet, connect, and collaborate with Cohiva.",
};

/* =====================================================
   ROOT LAYOUT
===================================================== */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={cn(
          "h-full antialiased",
          geistSans.variable,
          geistMono.variable,
          notoSans.variable,
          playfairDisplayHeading.variable,
          "font-sans"
        )}
      >
        <body className="min-h-full flex flex-col">
          <StreamVideoProvider>
            {children}
          </StreamVideoProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}