"use client";

import {
  CalendarDays,
  History,
  LayoutDashboard,
  LogOut,
  Radio,
  UserRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useUser } from "@/components/providers/AuthProvider";

const menuItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Personal room",
    href: "/personal-room",
    icon: Radio,
  },
  {
    label: "Upcoming meetings",
    href: "/upcoming",
    icon: CalendarDays,
  },
  {
    label: "Previous meetings",
    href: "/previous",
    icon: History,
  },
  {
    label: "Recordings",
    href: "/recordings",
    icon: Video,
  },
] as const;

const UserMenu = () => {
  const { user, setUser } = useUser();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!user) {
    return null;
  }

  const name =
    user.fullName ||
    user.username ||
    user.email;

  const initials = (() => {
    const first = user.firstName?.trim()?.[0] ?? "";
    const last = user.lastName?.trim()?.[0] ?? "";

    if (first || last) {
      return `${first}${last}`.toUpperCase();
    }

    return (user.email?.[0] || "U").toUpperCase();
  })();

  const signOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      setUser(null);
      window.location.assign("/sign-in");
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Open account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border bg-[#FFF7EB] text-sm font-black text-[#B9687C] shadow-sm outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-white/70 ${
          open
            ? "border-white/70 ring-2 ring-white/35"
            : "border-white/30"
        }`}
      >
        {user.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}

        <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#FFF7EB] bg-emerald-500" />
      </button>

      <div
        role="menu"
        aria-hidden={!open}
        className={`absolute right-0 top-[calc(100%+12px)] z-[80] w-[290px] origin-top-right overflow-hidden rounded-2xl border border-[#3D3732]/10 bg-[#FFF7EB] shadow-[0_18px_50px_rgba(61,55,50,0.22)] transition-all duration-200 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div className="border-b border-[#3D3732]/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#CC3A63]/10 font-black text-[#CC3A63]">
              {user.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.imageUrl}
                  alt={name}
                  className="h-full w-full object-cover"
                />
              ) : (
                initials || <UserRound className="h-5 w-5" />
              )}
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#3D3732]">
                {name}
              </p>
              <p className="mt-0.5 truncate text-xs text-[#756E64]">
                {user.email}
              </p>
            </div>
          </div>
        </div>

        <div className="p-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                  active
                    ? "bg-[#CC3A63]/10 text-[#B52E56]"
                    : "text-[#3D3732] hover:bg-[#F1E6D4]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="border-t border-[#3D3732]/10 p-2">
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#B52E56] transition-colors duration-150 hover:bg-[#CC3A63]/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserMenu;
