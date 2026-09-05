import "@stream-io/video-react-sdk/dist/css/styles.css";

import type { ReactNode } from "react";

type MeetingLayoutProps = {
  children: ReactNode;
};

const MeetingLayout = ({
  children,
}: MeetingLayoutProps) => {
  return (
    <div className="min-h-screen w-full bg-[#24211F]">
      {children}
    </div>
  );
};

export default MeetingLayout;