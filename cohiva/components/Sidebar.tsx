"use client";

import { sidebarLinks } from "@/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Sidebar = () => {
  const pathname = usePathname();

  return (
    <section className="sticky left-0 top-0 hidden h-screen w-[264px] shrink-0 flex-col bg-[#403A35] p-6 pt-28 text-[#FFF7EB] md:flex">
      <div className="flex flex-1 flex-col gap-5">
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
    </section>
  );
};

export default Sidebar;