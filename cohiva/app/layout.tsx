import type { Metadata } from "next";

import {
  Geist_Mono,
  Noto_Sans,
} from "next/font/google";

import { AuthProvider } from "@/components/providers/AuthProvider";
import { currentUser } from "@/lib/auth/server";
import { cn } from "@/lib/utils";

import "./globals.css";

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

export const metadata: Metadata = {
  title: "Cohiva",
  description:
    "Meet, connect, and collaborate with Cohiva.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user =
    await currentUser();

  return (
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
        <AuthProvider
          initialUser={user}
        >
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
