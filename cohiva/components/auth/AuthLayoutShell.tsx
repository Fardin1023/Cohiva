"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const AuthLayoutShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const isSignIn = pathname.includes("/sign-in");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F9F0E0] px-4 py-8 sm:px-6 lg:px-8">
      {/* Background glow shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-12 h-52 w-52 rounded-full bg-[#CC3A63]/12 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[#A2AB73]/18 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 rounded-full bg-white/30 blur-2xl" />
      </div>

      <div className="relative grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-[#3D3732]/10 bg-[#FFF7EB]/95 shadow-[0_24px_80px_rgba(61,55,50,0.12)] backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
        {/* Left side branding panel */}
        <section className="relative hidden min-h-[700px] flex-col justify-between bg-[#403A35] p-10 text-[#FFF7EB] md:flex">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/images/CohivaLogo.png"
                alt="Cohiva logo"
                width={52}
                height={52}
                className="rounded-2xl object-cover"
                priority
              />
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Cohiva</h1>
                <p className="text-sm text-[#F9F0E0]/75">
                  Meet, connect, and collaborate.
                </p>
              </div>
            </div>

            <div className="mt-14">
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-[#A2AB73]">
                Welcome
              </p>

              <h2 className="mt-4 text-4xl font-bold leading-tight">
                Join your meetings with a warm and modern experience.
              </h2>

              <p className="mt-5 max-w-md text-base leading-7 text-[#F9F0E0]/75">
                Cohiva helps you schedule calls, manage recordings, enter your
                personal room, and stay connected with your team beautifully.
              </p>
            </div>

            <div className="mt-12 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-[#FFF7EB]">
                  Easy access
                </p>
                <p className="mt-1 text-sm text-[#F9F0E0]/70">
                  Sign in quickly and continue where you left off.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-[#FFF7EB]">
                  Organized meetings
                </p>
                <p className="mt-1 text-sm text-[#F9F0E0]/70">
                  Upcoming, previous, recordings, and personal room all in one
                  place.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-[#FFF7EB]">
                  Calm, focused interface
                </p>
                <p className="mt-1 text-sm text-[#F9F0E0]/70">
                  A soothing palette designed to feel elegant and comfortable.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-[#FFF7EB] p-5 text-[#3D3732] shadow-sm">
            <p className="text-sm font-medium text-[#756E64]">
              “Great meetings start with a simple entrance.”
            </p>
            <p className="mt-3 text-lg font-bold">Cohiva Authentication</p>
          </div>
        </section>

        {/* Right side auth area */}
        <section className="flex items-center justify-center px-5 py-8 sm:px-8 md:px-10">
          <div className="w-full max-w-[420px]">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 md:hidden">
              <Image
                src="/images/CohivaLogo.png"
                alt="Cohiva logo"
                width={46}
                height={46}
                className="rounded-2xl object-cover"
                priority
              />
              <div>
                <h1 className="text-2xl font-bold text-[#3D3732]">Cohiva</h1>
                <p className="text-sm text-[#756E64]">
                  Meet, connect, and collaborate.
                </p>
              </div>
            </div>

            {/* Sliding Sign In / Sign Up switch */}
            <div className="relative mb-8 grid h-14 grid-cols-2 rounded-full bg-[#F1E6D4] p-1">
              <span
                className={`absolute left-1 top-1 h-12 w-[calc(50%-0.25rem)] rounded-full bg-[#CC3A63] shadow-[0_10px_24px_rgba(204,58,99,0.28)] transition-transform duration-300 ${
                  isSignIn ? "translate-x-0" : "translate-x-full"
                }`}
              />

              <Link
                href="/sign-in"
                className={`relative z-10 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  isSignIn ? "text-white" : "text-[#756E64]"
                }`}
              >
                Sign In
              </Link>

              <Link
                href="/sign-up"
                className={`relative z-10 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  !isSignIn ? "text-white" : "text-[#756E64]"
                }`}
              >
                Sign Up
              </Link>
            </div>

            {children}
          </div>
        </section>
      </div>
    </main>
  );
};

export default AuthLayoutShell;