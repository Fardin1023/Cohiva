"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import { useStreamVideoClient } from "@stream-io/video-react-sdk";

import { useState } from "react";

type ScheduleMeetingFormProps = {
  onScheduled?: () => void;
};

const ScheduleMeetingForm = ({
  onScheduled,
}: ScheduleMeetingFormProps) => {
  const router = useRouter();

  const { user } = useUser();

  const client = useStreamVideoClient();

  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [date, setDate] =
    useState("");

  const [time, setTime] =
    useState("");

  const [error, setError] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  /* =====================================================
     SCHEDULE MEETING
  ===================================================== */

  const scheduleMeeting = async () => {
    setError("");

    if (!client) {
      setError(
        "Cohiva is still connecting. Please try again."
      );

      return;
    }

    if (!user) {
      setError(
        "You must be signed in to schedule a meeting."
      );

      return;
    }

    if (!title.trim()) {
      setError(
        "Enter a meeting title."
      );

      return;
    }

    if (!date || !time) {
      setError(
        "Choose a meeting date and time."
      );

      return;
    }

    const scheduledAt =
      new Date(
        `${date}T${time}`
      );

    if (
      Number.isNaN(
        scheduledAt.getTime()
      )
    ) {
      setError(
        "The selected date or time is invalid."
      );

      return;
    }

    if (
      scheduledAt.getTime() <=
      Date.now()
    ) {
      setError(
        "Choose a future date and time."
      );

      return;
    }

    try {
      setSubmitting(true);

      const callId =
        crypto.randomUUID();

      /*
       * TEMPORARY:
       * Keep development until we fix
       * the permissions of your
       * default Stream call type.
       */
      const call =
        client.call(
          "development",
          callId
        );

      await call.getOrCreate({
        data: {
          starts_at:
            scheduledAt,

          members: [
            {
              user_id:
                user.id,
            },
          ],

          custom: {
            title:
              title.trim(),

            description:
              description.trim(),

            cohiva_type:
              "scheduled",
          },
        },
      });

      onScheduled?.();

      router.push(
        "/upcoming"
      );
    } catch (err) {
      console.error(
        "Schedule meeting error:",
        err
      );

      setError(
        "Cohiva could not schedule this meeting."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* TITLE */}

      <div>
        <label
          htmlFor="schedule-title"
          className="mb-2 block text-sm font-bold text-[#3D3732]"
        >
          Meeting title
        </label>

        <input
          id="schedule-title"
          type="text"
          value={title}
          onChange={(event) =>
            setTitle(
              event.target.value
            )
          }
          placeholder="Weekly project meeting"
          className="w-full rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition placeholder:text-[#756E64]/50 focus:border-[#B9687C] focus:ring-4 focus:ring-[#B9687C]/10"
        />
      </div>

      {/* DESCRIPTION */}

      <div>
        <label
          htmlFor="schedule-description"
          className="mb-2 block text-sm font-bold text-[#3D3732]"
        >
          Description
        </label>

        <textarea
          id="schedule-description"
          value={description}
          onChange={(event) =>
            setDescription(
              event.target.value
            )
          }
          rows={3}
          placeholder="What is this meeting about?"
          className="w-full resize-none rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition placeholder:text-[#756E64]/50 focus:border-[#B9687C] focus:ring-4 focus:ring-[#B9687C]/10"
        />
      </div>

      {/* DATE + TIME */}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

        <div>
          <label
            htmlFor="schedule-date"
            className="mb-2 block text-sm font-bold text-[#3D3732]"
          >
            Date
          </label>

          <input
            id="schedule-date"
            type="date"
            value={date}
            onChange={(event) =>
              setDate(
                event.target.value
              )
            }
            className="w-full rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition focus:border-[#B9687C] focus:ring-4 focus:ring-[#B9687C]/10"
          />
        </div>

        <div>
          <label
            htmlFor="schedule-time"
            className="mb-2 block text-sm font-bold text-[#3D3732]"
          >
            Time
          </label>

          <input
            id="schedule-time"
            type="time"
            value={time}
            onChange={(event) =>
              setTime(
                event.target.value
              )
            }
            className="w-full rounded-2xl border border-[#403A35]/15 bg-white px-4 py-3.5 text-[#3D3732] outline-none transition focus:border-[#B9687C] focus:ring-4 focus:ring-[#B9687C]/10"
          />
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div className="rounded-2xl bg-[#CC3A63]/10 px-4 py-3 text-sm font-semibold text-[#CC3A63]">
          {error}
        </div>
      )}

      {/* BUTTON */}

      <button
        type="button"
        onClick={
          scheduleMeeting
        }
        disabled={
          submitting
        }
        className="w-full rounded-2xl bg-[#B9687C] px-5 py-4 font-bold text-white shadow-[0_10px_25px_rgba(185,104,124,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#A8566B] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? "Scheduling..."
          : "Schedule Meeting"}
      </button>
    </div>
  );
};

export default ScheduleMeetingForm;