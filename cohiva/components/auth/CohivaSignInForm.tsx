"use client";

import Link from "next/link";
import {
  useRouter,
} from "next/navigation";
import {
  FormEvent,
  useState,
} from "react";

const CohivaSignInForm = () => {
  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [error, setError] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const handleSubmit =
    async (
      event: FormEvent<HTMLFormElement>
    ) => {
      event.preventDefault();

      if (submitting) {
        return;
      }

      setSubmitting(true);
      setError("");

      try {
        const response =
          await fetch(
            "/api/auth/login",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                email,
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
              "Unable to sign in."
          );
          return;
        }

        router.replace("/");
        router.refresh();
      } catch {
        setError(
          "Unable to reach Cohiva. Check your connection and try again."
        );
      } finally {
        setSubmitting(false);
      }
    };

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-semibold text-[#3D3732]"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          className="h-12 w-full rounded-xl border border-[#3D3732]/15 bg-white px-4 text-sm text-[#3D3732] outline-none transition focus:border-[#CC3A63] focus:ring-4 focus:ring-[#CC3A63]/10"
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="password"
            className="text-sm font-semibold text-[#3D3732]"
          >
            Password
          </label>

          <Link
            href="/forgot-password"
            className="text-xs font-bold text-[#CC3A63] transition hover:text-[#B83258] hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(event) =>
            setPassword(
              event.target.value
            )
          }
          className="h-12 w-full rounded-xl border border-[#3D3732]/15 bg-white px-4 text-sm text-[#3D3732] outline-none transition focus:border-[#CC3A63] focus:ring-4 focus:ring-[#CC3A63]/10"
          placeholder="Enter your password"
        />
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
        disabled={submitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[#CC3A63] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(204,58,99,0.22)] transition hover:bg-[#B83258] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? "Signing in..."
          : "Sign in"}
      </button>

      <div className="space-y-3 pt-1 text-center">
        <p className="text-sm text-[#3D3732]/65">
          New to Cohiva?
        </p>

        <Link
          href="/sign-up"
          className="flex h-12 w-full items-center justify-center rounded-xl border border-[#CC3A63]/30 bg-white px-4 text-sm font-bold text-[#CC3A63] transition hover:border-[#CC3A63] hover:bg-[#CC3A63]/5"
        >
          Create an account
        </Link>
      </div>
    </form>
  );
};

export default CohivaSignInForm;
