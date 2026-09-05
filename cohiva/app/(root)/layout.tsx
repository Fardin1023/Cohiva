import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import StreamVideoProvider from "@/components/providers/StreamVideoProvider";

const RootLayout = async ({
  children,
}: {
  children: ReactNode;
}) => {
  const { isAuthenticated } = await auth();

  /*
   * First-time / signed-out visitors are redirected on the
   * server before the dashboard or Stream Video client loads.
   */
  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  return (
    <StreamVideoProvider>
      {children}
    </StreamVideoProvider>
  );
};

export default RootLayout;
