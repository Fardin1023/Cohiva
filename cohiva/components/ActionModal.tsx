"use client";

import {
  type ReactNode,
  useEffect,
} from "react";

type ActionModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

const ActionModal = ({
  open,
  onClose,
  title,
  subtitle,
  children,
}: ActionModalProps) => {
  /* =====================================================
     ESCAPE KEY + BODY SCROLL
  ===================================================== */

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener(
      "keydown",
      handleEscape
    );

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="cohiva-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[#302B27]/55 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cohiva-modal-title"
        className="cohiva-modal relative w-full max-w-lg overflow-hidden rounded-[30px] border border-white/60 bg-[#FFF7EB] shadow-[0_30px_90px_rgba(48,43,39,0.30)]"
      >
        {/* DECORATION */}

        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#CC3A63]/10 blur-2xl" />

        <div className="pointer-events-none absolute -bottom-20 -left-20 h-44 w-44 rounded-full bg-[#A2AB73]/15 blur-2xl" />

        {/* HEADER */}

        <div className="relative border-b border-[#403A35]/10 px-6 pb-5 pt-6 sm:px-7">
          <div className="flex items-start justify-between gap-4">

            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#A2AB73]">
                Cohiva
              </p>

              <h2
                id="cohiva-modal-title"
                className="mt-2 text-2xl font-black tracking-tight text-[#3D3732]"
              >
                {title}
              </h2>

              {subtitle && (
                <p className="mt-2 max-w-md text-sm leading-6 text-[#756E64]">
                  {subtitle}
                </p>
              )}
            </div>

            {/* CLOSE */}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#403A35]/5 text-xl font-medium text-[#756E64] transition-all hover:rotate-90 hover:bg-[#CC3A63] hover:text-white"
            >
              ×
            </button>
          </div>
        </div>

        {/* CONTENT */}

        <div className="relative max-h-[70vh] overflow-y-auto px-6 py-6 sm:px-7">
          {children}
        </div>
      </div>
    </div>
  );
};

export default ActionModal;