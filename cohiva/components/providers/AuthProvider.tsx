"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

export const AuthProvider = ({
  children,
  initialUser,
}: AuthProviderProps) => {
  const [user, setUser] =
    useState<CohivaUser | null>(
      initialUser
    );

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
