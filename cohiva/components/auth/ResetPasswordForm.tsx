"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import {
  FormEvent,
  useState,
} from "react";

const ResetPasswordForm = ({
  token,
}: {
  token: string;
}) => {
  const [password, setPassword] =
    useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);
  const [error, setError] =
    useState("");
  const [complete, setComplete] =
    useState(false);
  const [submitting, setSubmitting] =
    useState(false);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (submitting || complete) {
      return;
    }

    setError("");

    if (!token) {
      setError(
        "This password reset link is missing its reset token."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(
        "The passwords do not match."
      );
      return;
    }

    setSubmitting(true);

    try {
      const response =
        await fetch(
          "/api/auth/reset-password",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              token,
              password,
            }),
          }
        );

      const data =
        (await response.json()) as {
          error?: string;
        };

      if (!response.ok) {
        setError(
          data.error ||
            "Unable to reset your password."
        );
        return;
      }

      setComplete(true);
      setPassword("");
      setConfirmPassword("");
    } catch {
      setError(
        "Unable to reach Cohiva. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (complete) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-[#A2AB73]/35 bg-[#A2AB73]/10 px-4 py-4 text-sm leading-6 text-[#3D3732]">
          Your password has been changed. For security, any old Cohiva sessions for this account were signed out.
        </div>

        <Link
          href="/sign-in"
          className="flex h-12 w-full items-center justify-center rounded-xl bg-[#CC3A63] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(204,58,99,0.22)] transition hover:bg-[#B83258]"
        >
          Sign in with new password
        </Link>
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      <div className="space-y-2">
        <label
          htmlFor="new-password"
          className="text-sm font-semibold text-[#3D3732]"
        >
          New password
        </label>
        <div className="relative">
          <input
            id="new-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            className="h-12 w-full rounded-xl border border-[#3D3732]/15 bg-white px-4 pr-12 text-sm text-[#3D3732] outline-none transition focus:border-[#CC3A63] focus:ring-4 focus:ring-[#CC3A63]/10"
            placeholder="Create a new password"
          />
          <button
            type="button"
            onClick={() =>
              setShowPassword((value) => !value)
            }
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#756E64] transition hover:text-[#CC3A63] focus:outline-none"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
        <p className="text-xs leading-5 text-[#756E64]">
          Use 8-128 characters with at least one letter and one number.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="confirm-password"
          className="text-sm font-semibold text-[#3D3732]"
        >
          Confirm new password
        </label>
        <div className="relative">
          <input
            id="confirm-password"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(
                event.target.value
              )
            }
            className="h-12 w-full rounded-xl border border-[#3D3732]/15 bg-white px-4 pr-12 text-sm text-[#3D3732] outline-none transition focus:border-[#CC3A63] focus:ring-4 focus:ring-[#CC3A63]/10"
            placeholder="Repeat your new password"
          />
          <button
            type="button"
            onClick={() =>
              setShowConfirmPassword((value) => !value)
            }
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#756E64] transition hover:text-[#CC3A63] focus:outline-none"
            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            aria-pressed={showConfirmPassword}
          >
            {showConfirmPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !token}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[#CC3A63] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(204,58,99,0.22)] transition hover:bg-[#B83258] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? "Saving password..."
          : "Set new password"}
      </button>

      <Link
        href="/sign-in"
        className="flex h-11 w-full items-center justify-center text-sm font-bold text-[#756E64] transition hover:text-[#3D3732]"
      >
        Back to sign in
      </Link>
    </form>
  );
};

export default ResetPasswordForm;
