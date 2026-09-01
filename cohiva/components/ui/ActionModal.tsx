"use client";

import { ReactNode, useEffect } from "react";

interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const ActionModal = ({
  open,
  onClose,
  title,
  subtitle,
  children,
}: ActionModalProps) => {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cohiva-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[#302B27]/45 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="cohiva-modal relative w-full max-w-[470px] overflow-hidden rounded-[28px] border border-white/60 bg-[#FFF7EB] shadow-[0_30px_90px_rgba(61,55,50,0.28)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Decoration */}
        <div className="absolute -right-14 -top-14 h-36 w-36 rounded-full bg-[#CC3A63]/10" />
        <div className="absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-[#A2AB73]/15" />

        {/* Header */}
        <div className="relative z-10 border-b border-[#403A35]/10 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-[#403A35]/5 text-xl text-[#756E64] transition-all hover:rotate-90 hover:bg-[#CC3A63] hover:text-white"
          >
            ×
          </button>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#CC3A63]">
            Cohiva
          </p>

          <h2 className="mt-2 pr-10 text-2xl font-bold text-[#3D3732]">
            {title}
          </h2>

          {subtitle && (
            <p className="mt-1 text-sm text-[#756E64]">
              {subtitle}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="relative z-10 p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default ActionModal;