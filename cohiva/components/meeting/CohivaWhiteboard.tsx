"use client";

import dynamic from "next/dynamic";

/* =========================================================
   DYNAMIC WHITEBOARD

   Excalidraw must run client-side only.
========================================================= */

const WhiteboardCanvas = dynamic(
  () =>
    import(
      "./WhiteboardCanvas"
    ),
  {
    ssr: false,

    loading: () => (
      <div className="flex h-full min-h-[500px] w-full items-center justify-center bg-white">

        <div className="text-center">

          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#CC3A63]/20 border-t-[#CC3A63]" />

          <p className="mt-4 font-bold text-[#756E64]">
            Opening Cohiva whiteboard...
          </p>

        </div>

      </div>
    ),
  }
);

/* =========================================================
   TYPES
========================================================= */

type CohivaWhiteboardProps = {
  callId: string;

  /*
   * TRUE only when the user has
   * actually opened the Whiteboard tab.
   */
  active: boolean;
};

/* =========================================================
   COMPONENT
========================================================= */

const CohivaWhiteboard = ({
  callId,
  active,
}: CohivaWhiteboardProps) => {
  return (
    <div className="h-full w-full overflow-hidden bg-white">

      <WhiteboardCanvas
        callId={
          callId
        }
        active={
          active
        }
      />

    </div>
  );
};

export default CohivaWhiteboard;