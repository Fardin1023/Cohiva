"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { sidebarLinks } from "@/constants";
import { cn } from "@/lib/utils";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const MobileNav = () => {
  const pathname = usePathname();

  return (
    <section className="w-full max-w-[264px]">
      <Sheet>
        {/* Hamburger button */}
        <SheetTrigger
          className="flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 hover:scale-105"
          aria-label="Open navigation menu"
        >
          <Image
            src="/icons/hamburger.png"
            alt="Menu"
            width={42}
            height={42}
            priority
            className="object-contain"
          />
        </SheetTrigger>

        {/* Mobile sidebar - opens from LEFT */}
        <SheetContent
          side="left"
          className="w-[300px] border-none bg-[#403A35] p-0 text-[#FFF7EB] sm:w-[340px]"
        >
          {/* Logo */}
          <SheetHeader className="px-7 pb-4 pt-7">
            <SheetTitle asChild>
              <Link href="/" className="flex items-center gap-3">
                <Image
                  src="/images/CohivaLogo.png"
                  alt="Cohiva logo"
                  width={42}
                  height={42}
                  priority
                  className="rounded-xl object-cover"
                />

                <span className="text-2xl font-bold tracking-wide text-[#FFF7EB]">
                  COHIVA
                </span>
              </Link>
            </SheetTitle>
          </SheetHeader>

          {/* Navigation links */}
          <div className="mt-8 flex flex-col gap-3 px-5">
            {sidebarLinks.map((link) => {
              const isActive =
                pathname === link.route ||
                (link.route !== "/" && pathname.startsWith(link.route));

              return (
                <Link
                  href={link.route}
                  key={link.label}
                  className={cn(
                    "flex items-center gap-4 rounded-2xl px-4 py-4 transition-all duration-200",
                    isActive
                      ? "bg-[#CC3A63] text-white shadow-sm"
                      : "text-[#FFF7EB] hover:bg-white/10"
                  )}
                >
                  <Image
                    src={link.imgUrl}
                    alt={link.label}
                    width={28}
                    height={28}
                    className="shrink-0 object-contain"
                  />

                  <span className="text-base font-semibold">
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
};

export default MobileNav;