"use client";

import {
  COHIVA_MAX_DURATION_MINUTES,
  COHIVA_MAX_PARTICIPANTS,
  COHIVA_MIN_DURATION_MINUTES,
  COHIVA_MIN_PARTICIPANTS,
  clampMeetingDurationMinutes,
  clampMeetingParticipants,
} from "@/lib/cohivaMeetingConfig";

type MeetingLimitFieldsProps = {
  durationMinutes: number;
  maxParticipants: number;
  onDurationChange: (value: number) => void;
  onParticipantsChange: (value: number) => void;
  disabled?: boolean;
  compact?: boolean;
};

const MeetingLimitFields = ({
  durationMinutes,
  maxParticipants,
  onDurationChange,
  onParticipantsChange,
  disabled = false,
  compact = false,
}: MeetingLimitFieldsProps) => {
  const cardClass = compact
    ? "rounded-[18px] border border-[#403A35]/10 bg-white p-3"
    : "rounded-[22px] border border-[#403A35]/10 bg-white p-4";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#CC3A63]">
              Meeting time
            </p>

            <p className="mt-1 text-sm font-black text-[#3D3732]">
              Duration limit
            </p>

            <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
              The meeting ends automatically when this time runs out.
            </p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#CC3A63]/10 text-lg">
            ⏱
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || durationMinutes <= COHIVA_MIN_DURATION_MINUTES}
            onClick={() =>
              onDurationChange(
                clampMeetingDurationMinutes(durationMinutes - 1)
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black text-[#3D3732] disabled:opacity-35"
            aria-label="Decrease meeting duration"
          >
            −
          </button>

          <div className="min-w-0 flex-1">
            <input
              type="number"
              min={COHIVA_MIN_DURATION_MINUTES}
              max={COHIVA_MAX_DURATION_MINUTES}
              value={durationMinutes}
              disabled={disabled}
              onChange={(event) =>
                onDurationChange(
                  clampMeetingDurationMinutes(event.target.value)
                )
              }
              className="h-10 w-full rounded-xl border border-[#403A35]/10 bg-[#FFF7EB] px-3 text-center text-sm font-black text-[#3D3732] outline-none focus:border-[#CC3A63]"
              aria-label="Meeting duration in minutes"
            />
          </div>

          <button
            type="button"
            disabled={disabled || durationMinutes >= COHIVA_MAX_DURATION_MINUTES}
            onClick={() =>
              onDurationChange(
                clampMeetingDurationMinutes(durationMinutes + 1)
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black text-[#3D3732] disabled:opacity-35"
            aria-label="Increase meeting duration"
          >
            +
          </button>
        </div>

        <p className="mt-2 text-center text-[9px] font-bold text-[#756E64]">
          {durationMinutes} min • maximum {COHIVA_MAX_DURATION_MINUTES} min
        </p>

        <div className="mt-3 flex gap-1.5">
          {[15, 30, 45].map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => onDurationChange(value)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[9px] font-black transition ${
                durationMinutes === value
                  ? "bg-[#CC3A63] text-white"
                  : "bg-[#CC3A63]/8 text-[#CC3A63]"
              }`}
            >
              {value}m
            </button>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#A2AB73]">
              Room capacity
            </p>

            <p className="mt-1 text-sm font-black text-[#3D3732]">
              Participant limit
            </p>

            <p className="mt-1 text-[10px] leading-4 text-[#756E64]">
              Total people allowed in the room, including the host.
            </p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#A2AB73]/15 text-lg">
            👥
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || maxParticipants <= COHIVA_MIN_PARTICIPANTS}
            onClick={() =>
              onParticipantsChange(
                clampMeetingParticipants(maxParticipants - 1)
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black text-[#3D3732] disabled:opacity-35"
            aria-label="Decrease participant limit"
          >
            −
          </button>

          <div className="min-w-0 flex-1">
            <input
              type="number"
              min={COHIVA_MIN_PARTICIPANTS}
              max={COHIVA_MAX_PARTICIPANTS}
              value={maxParticipants}
              disabled={disabled}
              onChange={(event) =>
                onParticipantsChange(
                  clampMeetingParticipants(event.target.value)
                )
              }
              className="h-10 w-full rounded-xl border border-[#403A35]/10 bg-[#FFF7EB] px-3 text-center text-sm font-black text-[#3D3732] outline-none focus:border-[#A2AB73]"
              aria-label="Maximum participants"
            />
          </div>

          <button
            type="button"
            disabled={disabled || maxParticipants >= COHIVA_MAX_PARTICIPANTS}
            onClick={() =>
              onParticipantsChange(
                clampMeetingParticipants(maxParticipants + 1)
              )
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F9F0E0] text-lg font-black text-[#3D3732] disabled:opacity-35"
            aria-label="Increase participant limit"
          >
            +
          </button>
        </div>

        <p className="mt-2 text-center text-[9px] font-bold text-[#756E64]">
          {maxParticipants} people • maximum {COHIVA_MAX_PARTICIPANTS}
        </p>

        <div className="mt-3 flex gap-1.5">
          {[5, 10, 20].map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              onClick={() => onParticipantsChange(value)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[9px] font-black transition ${
                maxParticipants === value
                  ? "bg-[#A2AB73] text-white"
                  : "bg-[#A2AB73]/12 text-[#737C4C]"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MeetingLimitFields;
