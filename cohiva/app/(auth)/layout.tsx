import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AuthLayoutShell from "@/components/auth/AuthLayoutShell";

const AuthLayout = async ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = await auth();

  /*
   * Signed-in users should never spend time rendering
   * the authentication bundle again.
   */
  if (isAuthenticated) {
    redirect("/");
  }

  return <AuthLayoutShell>{children}</AuthLayoutShell>;
};

export default AuthLayout;
