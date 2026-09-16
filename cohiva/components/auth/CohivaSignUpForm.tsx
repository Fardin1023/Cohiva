"use client";

import { Eye, EyeOff } from "lucide-react";
import {
  useRouter,
} from "next/navigation";
import {
  FormEvent,
  useState,
} from "react";

const CohivaSignUpForm = () => {
  const router = useRouter();

  const [firstName, setFirstName] =
    useState("");
  const [lastName, setLastName] =
    useState("");
  const [email, setEmail] =
    useState("");
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

      if (
        password !==
        confirmPassword
      ) {
        setError(
          "Passwords do not match."
        );
        return;
      }

      setSubmitting(true);
      setError("");

      try {
        const response =
          await fetch(
            "/api/auth/register",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                firstName,
                lastName,
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
              "Unable to create your account."
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

  const inputClass =
    "h-12 w-full rounded-xl border border-[#3D3732]/15 bg-white px-4 text-sm text-[#3D3732] outline-none transition focus:border-[#CC3A63] focus:ring-4 focus:ring-[#CC3A63]/10";

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label
            htmlFor="firstName"
            className="text-sm font-semibold text-[#3D3732]"
          >
            First name
          </label>
          <input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            maxLength={80}
            value={firstName}
            onChange={(event) =>
              setFirstName(
                event.target.value
              )
            }
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="lastName"
            className="text-sm font-semibold text-[#3D3732]"
          >
            Last name
          </label>
          <input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            maxLength={80}
            value={lastName}
            onChange={(event) =>
              setLastName(
                event.target.value
              )
            }
            className={inputClass}
          />
        </div>
      </div>

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
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-semibold text-[#3D3732]"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
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
            className={`${inputClass} pr-12`}
            placeholder="At least 8 characters"
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
          htmlFor="confirmPassword"
          className="text-sm font-semibold text-[#3D3732]"
        >
          Confirm password
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
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
            className={`${inputClass} pr-12`}
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
        disabled={submitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-[#CC3A63] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(204,58,99,0.22)] transition hover:bg-[#B83258] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? "Creating account..."
          : "Create account"}
      </button>
    </form>
  );
};

export default CohivaSignUpForm;
