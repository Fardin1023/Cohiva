import Image from "next/image";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import Link from "next/link";

const MobileNav = () => {
  return (
    <section className="w-full max-w-[264px]">
      <Sheet>
        <SheetTrigger
          className="flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 hover:scale-105"
          aria-label="Open navigation menu"
        >
          <Image
            src="/icons/hamburger.png"
            alt="Menu"
            width={35}
            height={35}
            priority
            className="object-contain"
          />
        </SheetTrigger>

        <SheetContent className="bg-[#403A35] text-[#FFF7EB]">
          <Link
        href="/"
        className="flex items-center gap-3"
      >
        <Image
          src="/images/CohivaLogo.png"
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
        </SheetContent>
      </Sheet>
    </section>
  );
};

export default MobileNav;