import type { ReactNode } from "react";
import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RootLayout = async ({
  children,
}: {
  children: ReactNode;
}) => {
  const { isAuthenticated } =
    await auth();

  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  return children;
};

export default RootLayout;
