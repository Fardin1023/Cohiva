import type { ReactNode } from "react";
import AuthLayoutShell from "@/components/auth/AuthLayoutShell";

const AuthLayout = ({ children }: { children: ReactNode }) => {
  return <AuthLayoutShell>{children}</AuthLayoutShell>;
};

export default AuthLayout;