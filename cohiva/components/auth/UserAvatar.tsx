"use client";

import {
  BookOpen,
  GraduationCap,
  Leaf,
  Lightbulb,
  Rocket,
  Smile,
  Sparkles,
  UserRound,
} from "lucide-react";

import type { CohivaUser } from "@/lib/auth/types";

export const COHIVA_AVATAR_ICONS = [
  "user",
  "student",
  "book",
  "idea",
  "sparkles",
  "leaf",
  "rocket",
  "smile",
] as const;

export type CohivaAvatarIcon =
  (typeof COHIVA_AVATAR_ICONS)[number];

const avatarIconMap = {
  user: UserRound,
  student: GraduationCap,
  book: BookOpen,
  idea: Lightbulb,
  sparkles: Sparkles,
  leaf: Leaf,
  rocket: Rocket,
  smile: Smile,
} as const;

const avatarToneMap = {
  user: "bg-[#CC3A63]/12 text-[#B52E56]",
  student: "bg-[#8766CC]/14 text-[#6B4DB5]",
  book: "bg-[#4F7CAC]/14 text-[#37688F]",
  idea: "bg-[#D99328]/16 text-[#B16F0C]",
  sparkles: "bg-[#B9687C]/14 text-[#A04E64]",
  leaf: "bg-[#4F8C6B]/14 text-[#397451]",
  rocket: "bg-[#D55B4A]/14 text-[#B24435]",
  smile: "bg-[#D18A2E]/14 text-[#A96A16]",
} as const;

type UserAvatarProps = {
  user: Pick<
    CohivaUser,
    | "email"
    | "firstName"
    | "lastName"
    | "fullName"
    | "username"
    | "imageUrl"
    | "avatarIcon"
  >;
  className?: string;
  imageClassName?: string;
  iconClassName?: string;
  showStatus?: boolean;
};

const getInitials = (
  user: UserAvatarProps["user"]
) => {
  const first =
    user.firstName?.trim()?.[0] ?? "";
  const last =
    user.lastName?.trim()?.[0] ?? "";

  if (first || last) {
    return `${first}${last}`.toUpperCase();
  }

  return (
    user.email?.trim()?.[0] || "U"
  ).toUpperCase();
};

const UserAvatar = ({
  user,
  className = "h-11 w-11",
  imageClassName = "h-full w-full object-cover",
  iconClassName = "h-5 w-5",
  showStatus = false,
}: UserAvatarProps) => {
  const name =
    user.fullName ||
    user.username ||
    user.email;

  const avatarIcon =
    COHIVA_AVATAR_ICONS.includes(
      user.avatarIcon as CohivaAvatarIcon
    )
      ? (user.avatarIcon as CohivaAvatarIcon)
      : null;

  const Icon = avatarIcon
    ? avatarIconMap[avatarIcon]
    : null;

  const tone = avatarIcon
    ? avatarToneMap[avatarIcon]
    : "bg-[#FFF7EB] text-[#B9687C]";

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${tone} ${className}`}
      aria-label={`${name} profile picture`}
    >
      {user.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.imageUrl}
          alt={name}
          className={imageClassName}
        />
      ) : Icon ? (
        <Icon
          className={iconClassName}
          aria-hidden="true"
        />
      ) : (
        <span
          className="text-sm font-black"
          aria-hidden="true"
        >
          {getInitials(user)}
        </span>
      )}

      {showStatus ? (
        <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#FFF7EB] bg-emerald-500" />
      ) : null}
    </div>
  );
};

export default UserAvatar;
