import "server-only";

import nodemailer from "nodemailer";

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST?.trim() || "";
  const port = Number(process.env.SMTP_PORT || "");
  const user = process.env.SMTP_USER?.trim() || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM?.trim() || "";

  if (
    !host ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535 ||
    !from
  ) {
    return null;
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user,
    pass,
    from,
  };
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const passwordResetEmailConfigured = () => Boolean(getSmtpConfig());

export const sendPasswordResetEmail = async ({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) => {
  const config = getSmtpConfig();

  if (!config) return false;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(config.user
      ? {
          auth: {
            user: config.user,
            pass: config.pass,
          },
        }
      : {}),
  });

  const safeResetUrl = escapeHtml(resetUrl);

  await transporter.sendMail({
    from: config.from,
    to,
    subject: "Reset your Cohiva password",
    text: [
      "A password reset was requested for your Cohiva account.",
      "",
      `Open this link to set a new password: ${resetUrl}`,
      "",
      "This link expires in 30 minutes and can only be used once.",
      "If you did not request this reset, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#3D3732">
        <h2>Reset your Cohiva password</h2>
        <p>A password reset was requested for your Cohiva account.</p>
        <p>
          <a href="${safeResetUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#CC3A63;color:white;text-decoration:none;font-weight:700">
            Set a new password
          </a>
        </p>
        <p>This link expires in 30 minutes and can only be used once.</p>
        <p>If you did not request this reset, you can ignore this email.</p>
      </div>
    `,
  });

  return true;
};
