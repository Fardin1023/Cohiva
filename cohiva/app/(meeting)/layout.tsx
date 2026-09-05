import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import StreamVideoProvider from "@/components/providers/StreamVideoProvider";

const MeetingLayout = async ({
  children,
}: {
  children: ReactNode;
}) => {
  const { isAuthenticated } = await auth();

  /*
   * Never initialize Stream Video for a signed-out visitor.
   */
  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  return (
    <StreamVideoProvider>
      <div className="min-h-screen w-full bg-[#24211F]">
        {children}
      </div>
    </StreamVideoProvider>
  );
};

export default MeetingLayout;
