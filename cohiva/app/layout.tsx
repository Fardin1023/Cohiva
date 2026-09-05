import type { Metadata } from "next";

import {
  Geist_Mono,
  Noto_Sans,
} from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";

import { cn } from "@/lib/utils";

import "./globals.css";

/* =========================================================
   FONTS
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

   Stream Video is intentionally NOT mounted here anymore.
   Auth pages therefore do not download/initialize the heavy
   meeting provider. Protected route groups mount it only where
   it is actually required.
========================================================= */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
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
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
