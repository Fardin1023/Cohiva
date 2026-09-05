import { Show, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

import MobileNav from "./MobileNav";

const Navbar = () => {
  return (
    <nav className="fixed left-0 top-0 z-50 flex h-[84px] w-full items-center justify-between bg-[#B9687C] px-5 sm:px-6">
      {/* Left - Logo + Brand */}
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/images/CohivaLogo.webp"
          alt="Cohiva logo"
          width={44}
          height={44}
          priority
          className="rounded-xl object-cover"
        />

        <h1 className="text-2xl font-bold tracking-tight text-[#FFF7EB]">
          Cohiva
        </h1>
      </Link>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* User profile */}
        <Show when="signed-in">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-10 w-10",
              },
            }}
          />
        </Show>

        {/* MOBILE ONLY */}
        <div className="md:hidden">
          <MobileNav />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;