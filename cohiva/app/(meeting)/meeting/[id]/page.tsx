import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import MeetingRoom from "@/components/meeting/MeetingRoom";

type MeetingPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    create?: string;
  }>;
};

const MeetingPage = async ({
  params,
  searchParams,
}: MeetingPageProps) => {
  const { userId } =
    await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { id } =
    await params;

  const { create } =
    await searchParams;

  return (
    <MeetingRoom
      callId={id}
      shouldCreate={
        create === "1"
      }
    />
  );
};

export default MeetingPage;