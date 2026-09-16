"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

import type {
  CohivaAuthState,
  CohivaUser,
} from "@/lib/auth/types";

type AuthContextValue =
  CohivaAuthState & {
    setUser: (
      user: CohivaUser | null
    ) => void;
  };

const AuthContext =
  createContext<AuthContextValue | null>(
    null
  );

type AuthProviderProps = {
  children: ReactNode;
  initialUser: CohivaUser | null;
};

const isPublicAuthPath = (
  pathname: string
) =>
  pathname === "/sign-in" ||
  pathname.startsWith("/sign-in/") ||
  pathname === "/sign-up" ||
  pathname.startsWith("/sign-up/") ||
  pathname === "/forgot-password" ||
  pathname.startsWith("/forgot-password/") ||
  pathname === "/reset-password" ||
  pathname.startsWith("/reset-password/");

export const AuthProvider = ({
  children,
  initialUser,
}: AuthProviderProps) => {
  const pathname = usePathname();

  const [user, setUser] =
    useState<CohivaUser | null>(
      initialUser
    );

  const revalidateSession =
    useCallback(async () => {
      try {
        const response =
          await fetch(
            "/api/auth/session",
            {
              method: "GET",
              cache: "no-store",
              credentials:
                "same-origin",
              headers: {
                Accept:
                  "application/json",
                "Cache-Control":
                  "no-cache",
              },
            }
          );

        /*
         * Do not sign the user out merely because a temporary
         * network/server error prevented session validation.
         */
        if (!response.ok) {
          return;
        }

        const result =
          (await response.json()) as {
            user?:
              | CohivaUser
              | null;
          };

        const freshUser =
          result.user ?? null;

        setUser(freshUser);

        /*
         * A protected page can be restored directly from the
         * browser back-forward cache without asking Next.js to
         * render it again. If the server session has been removed,
         * immediately replace that stale protected history entry.
         */
        if (
          !freshUser &&
          !isPublicAuthPath(pathname)
        ) {
          window.location.replace(
            "/sign-in"
          );
        }
      } catch {
        // Keep the current UI during transient connectivity failures.
      }
    }, [pathname]);

  useEffect(() => {
    /*
     * Run once after hydration. This catches a page restored before
     * the pageshow listener was attached, and keeps client auth state
     * synchronized with the HttpOnly server session.
     */
    void revalidateSession();

    const handlePageShow = () => {
      void revalidateSession();
    };

    const handleVisibilityChange =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          void revalidateSession();
        }
      };

    window.addEventListener(
      "pageshow",
      handlePageShow
    );
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      window.removeEventListener(
        "pageshow",
        handlePageShow
      );
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [revalidateSession]);

  const value =
    useMemo<AuthContextValue>(
      () => ({
        user,
        isLoaded: true,
        isSignedIn:
          Boolean(user),
        setUser,
      }),
      [user]
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useUser = () => {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useUser must be used inside AuthProvider."
    );
  }

  return context;
};
