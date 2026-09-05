import Image from "next/image";
import type { ReactNode } from "react";
import AuthModeSwitch from "./AuthModeSwitch";

const AuthLayoutShell = ({ children }: { children: ReactNode }) => {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden bg-[#F9F0E0] px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
      {/* Decorative background is hidden on the smallest screens to reduce paint cost. */}
      <div className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block" aria-hidden="true">
        <div className="absolute -left-16 top-12 h-48 w-48 rounded-full bg-[#CC3A63]/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-60 w-60 rounded-full bg-[#A2AB73]/15 blur-3xl" />
      </div>

      <div className="relative grid w-full max-w-6xl overflow-hidden rounded-[24px] border border-[#3D3732]/10 bg-[#FFF7EB] shadow-[0_20px_60px_rgba(61,55,50,0.10)] sm:rounded-[30px] md:grid-cols-[1.02fr_0.98fr] lg:rounded-[32px]">
        {/* Desktop branding panel: server-rendered, so this large section adds no client hydration. */}
        <section className="relative hidden min-h-[620px] flex-col justify-between bg-[#403A35] p-8 text-[#FFF7EB] md:flex lg:min-h-[680px] lg:p-10">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/images/CohivaLogo.webp"
                alt="Cohiva logo"
                width={52}
                height={52}
                sizes="52px"
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

            <div className="mt-10 lg:mt-14">
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-[#A2AB73]">
                Welcome
              </p>

              <h2 className="mt-4 max-w-xl text-3xl font-bold leading-tight lg:text-4xl">
                A faster, calmer way to join your classroom and collaborate.
              </h2>

              <p className="mt-5 max-w-md text-sm leading-6 text-[#F9F0E0]/75 lg:text-base lg:leading-7">
                Sign in once to reach your meetings, personal room, recordings,
                whiteboard, and classroom tools from one place.
              </p>
            </div>

            <div className="mt-8 grid gap-3 lg:mt-10 lg:gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-[#FFF7EB]">Fast entry</p>
                <p className="mt-1 text-sm text-[#F9F0E0]/70">
                  New visitors start here, while signed-in users go straight to Cohiva.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-[#FFF7EB]">One workspace</p>
                <p className="mt-1 text-sm text-[#F9F0E0]/70">
                  Meetings, recordings, attendance, chat, and whiteboard stay together.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-[#FFF7EB] p-5 text-[#3D3732] shadow-sm">
            <p className="text-sm font-medium text-[#756E64]">
              Secure access before the meeting begins.
            </p>
            <p className="mt-2 text-lg font-bold">Welcome to Cohiva</p>
          </div>
        </section>

        {/* Authentication area */}
        <section className="flex min-h-[600px] items-center justify-center px-4 py-6 sm:px-8 sm:py-8 md:min-h-[620px] md:px-9 lg:min-h-[680px] lg:px-11">
          <div className="w-full max-w-[420px]">
            {/* Mobile branding */}
            <div className="mb-6 flex items-center gap-3 md:hidden">
              <Image
                src="/images/CohivaLogo.webp"
                alt="Cohiva logo"
                width={44}
                height={44}
                sizes="44px"
                className="rounded-xl object-cover"
                priority
              />

              <div>
                <h1 className="text-2xl font-bold text-[#3D3732]">Cohiva</h1>
                <p className="text-xs text-[#756E64] sm:text-sm">
                  Meet, connect, and collaborate.
                </p>
              </div>
            </div>

            {/* Only this compact switch hydrates on the client. */}
            <AuthModeSwitch />

            {children}
          </div>
        </section>
      </div>
    </main>
  );
};

export default AuthLayoutShell;
