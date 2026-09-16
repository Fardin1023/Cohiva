import type { ReactNode } from "react";
import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MeetingLayout = async ({
  children,
}: {
  children: ReactNode;
}) => {
  const { isAuthenticated } =
    await auth();

  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-dvh w-full bg-[#24211F]">
      {children}
    </div>
  );
};

export default MeetingLayout;
