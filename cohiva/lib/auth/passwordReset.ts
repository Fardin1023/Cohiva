import {
  createHash,
  randomBytes,
} from "node:crypto";

export const PASSWORD_RESET_TTL_MINUTES = 30;

export const normalizeAuthEmail = (
  value: unknown
) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .slice(0, 320);
};

export const emailLooksValid = (
  email: string
) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );

export const passwordLooksValid = (
  password: string
) =>
  password.length >= 8 &&
  password.length <= 128 &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password);

export const createPasswordResetToken = () =>
  randomBytes(32).toString("base64url");

export const hashPasswordResetToken = (
  token: string
) =>
  createHash("sha256")
    .update(token)
    .digest("hex");

export const getPasswordResetExpiry = () =>
  new Date(
    Date.now() +
      PASSWORD_RESET_TTL_MINUTES *
        60 *
        1000
  );
