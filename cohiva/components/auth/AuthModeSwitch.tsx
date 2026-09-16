"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const AuthModeSwitch = () => {
  const pathname = usePathname();
  const isSignInFlow =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith(
      "/forgot-password"
    ) ||
    pathname.startsWith(
      "/reset-password"
    );

  return (
    <nav
      aria-label="Authentication"
      className="relative mb-7 grid h-13 grid-cols-2 rounded-full bg-[#F1E6D4] p-1 sm:mb-8 sm:h-14"
    >
      <span
        aria-hidden="true"
        className={`absolute left-1 top-1 h-11 w-[calc(50%-0.25rem)] rounded-full bg-[#CC3A63] shadow-[0_8px_20px_rgba(204,58,99,0.24)] transition-transform duration-200 motion-reduce:transition-none sm:h-12 ${
          isSignInFlow
            ? "translate-x-0"
            : "translate-x-full"
        }`}
      />

      <Link
        href="/sign-in"
        prefetch={false}
        aria-current={
          isSignInFlow
            ? "page"
            : undefined
        }
        className={`relative z-10 flex items-center justify-center rounded-full text-sm font-semibold transition-colors duration-150 ${
          isSignInFlow
            ? "text-white"
            : "text-[#756E64] hover:text-[#3D3732]"
        }`}
      >
        Sign In
      </Link>

      <Link
        href="/sign-up"
        prefetch={false}
        aria-current={
          !isSignInFlow
            ? "page"
            : undefined
        }
        className={`relative z-10 flex items-center justify-center rounded-full text-sm font-semibold transition-colors duration-150 ${
          !isSignInFlow
            ? "text-white"
            : "text-[#756E64] hover:text-[#3D3732]"
        }`}
      >
        Sign Up
      </Link>
    </nav>
  );
};

export default AuthModeSwitch;
