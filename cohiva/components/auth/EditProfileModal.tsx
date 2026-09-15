"use client";

import {
  Camera,
  Check,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  COHIVA_AVATAR_ICONS,
  type CohivaAvatarIcon,
} from "@/components/auth/UserAvatar";
import UserAvatar from "@/components/auth/UserAvatar";
import { useUser } from "@/components/providers/AuthProvider";

const MAX_SOURCE_IMAGE_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 256;

const iconLabels: Record<
  CohivaAvatarIcon,
  string
> = {
  user: "Classic",
  student: "Student",
  book: "Book",
  idea: "Idea",
  sparkles: "Sparkles",
  leaf: "Leaf",
  rocket: "Rocket",
  smile: "Smile",
};

type EditProfileModalProps = {
  open: boolean;
  onClose: () => void;
};

const fileToAvatarDataUrl = (
  file: File
): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }

    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      reject(
        new Error(
          "Profile photos must be 5 MB or smaller."
        )
      );
      return;
    }

    const reader = new FileReader();

    reader.onerror = () =>
      reject(
        new Error("Unable to read that image.")
      );

    reader.onload = () => {
      const image = new Image();

      image.onerror = () =>
        reject(
          new Error("Unable to process that image.")
        );

      image.onload = () => {
        const sourceSize = Math.min(
          image.naturalWidth,
          image.naturalHeight
        );

        const sourceX = Math.max(
          0,
          (image.naturalWidth - sourceSize) / 2
        );

        const sourceY = Math.max(
          0,
          (image.naturalHeight - sourceSize) / 2
        );

        const canvas =
          document.createElement("canvas");

        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;

        const context =
          canvas.getContext("2d");

        if (!context) {
          reject(
            new Error(
              "Unable to prepare your profile photo."
            )
          );
          return;
        }

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE
        );

        resolve(
          canvas.toDataURL("image/jpeg", 0.82)
        );
      };

      image.src = String(reader.result);
    };

    reader.readAsDataURL(file);
  });

const EditProfileModal = ({
  open,
  onClose,
}: EditProfileModalProps) => {
  const { user, setUser } = useUser();

  const [firstName, setFirstName] =
    useState("");
  const [lastName, setLastName] =
    useState("");
  const [imageUrl, setImageUrl] =
    useState("");
  const [avatarIcon, setAvatarIcon] =
    useState<CohivaAvatarIcon | "">("");
  const [saving, setSaving] =
    useState(false);
  const [error, setError] =
    useState("");
  const [success, setSuccess] =
    useState(false);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !user) return;

    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setImageUrl(user.imageUrl ?? "");
    setAvatarIcon(
      COHIVA_AVATAR_ICONS.includes(
        user.avatarIcon as CohivaAvatarIcon
      )
        ? (user.avatarIcon as CohivaAvatarIcon)
        : ""
    );
    setError("");
    setSuccess(false);
  }, [open, user]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        onKeyDown
      );
      document.body.style.overflow = "";
    };
  }, [open, onClose, saving]);

  if (!user) return null;

  const previewUser = {
    ...user,
    firstName: firstName || null,
    lastName: lastName || null,
    fullName:
      [firstName, lastName]
        .filter(Boolean)
        .join(" ") || null,
    imageUrl,
    avatarIcon,
  };

  const onPhotoSelected = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setError("");
    setSuccess(false);

    try {
      const dataUrl =
        await fileToAvatarDataUrl(file);

      setImageUrl(dataUrl);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to use that image."
      );
    } finally {
      event.target.value = "";
    }
  };

  const chooseIcon = (
    icon: CohivaAvatarIcon
  ) => {
    setAvatarIcon(icon);
    setImageUrl("");
    setError("");
    setSuccess(false);
  };

  const removePhoto = () => {
    setImageUrl("");
    if (!avatarIcon) {
      setAvatarIcon("user");
    }
    setSuccess(false);
  };

  const save = async () => {
    if (saving) return;

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    if (!cleanFirstName) {
      setError("First name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const response = await fetch(
        "/api/auth/profile",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName: cleanFirstName,
            lastName: cleanLastName,
            avatarIcon,
            imageUrl,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to update your profile."
        );
      }

      setUser(data.user);
      setSuccess(true);

      window.setTimeout(() => {
        onClose();
      }, 450);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update your profile."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center p-4 transition-all duration-200 ${
        open
          ? "pointer-events-auto bg-[#2D2925]/45 opacity-100 backdrop-blur-[2px]"
          : "pointer-events-none bg-transparent opacity-0"
      }`}
      aria-hidden={!open}
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !saving
        ) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
        className={`max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-[28px] border border-[#3D3732]/10 bg-[#FFF7EB] shadow-[0_28px_80px_rgba(44,38,34,0.28)] transition-all duration-200 ease-out ${
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-3 scale-[0.97] opacity-0"
        }`}
      >
        <div className="flex items-start justify-between border-b border-[#3D3732]/10 px-6 py-5">
          <div>
            <h2
              id="edit-profile-title"
              className="text-xl font-black text-[#3D3732]"
            >
              Edit profile
            </h2>
            <p className="mt-1 text-sm text-[#756E64]">
              Update how you appear in Cohiva.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close edit profile"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#756E64] transition-colors hover:bg-[#F1E6D4] hover:text-[#3D3732] disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div className="flex flex-col items-center">
            <UserAvatar
              user={previewUser}
              className="h-24 w-24 shadow-sm"
              iconClassName="h-10 w-10"
            />

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="inline-flex items-center gap-2 rounded-xl bg-[#CC3A63] px-4 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#B52E56] hover:shadow-md"
              >
                <Camera className="h-4 w-4" />
                Upload photo
              </button>

              {imageUrl ? (
                <button
                  type="button"
                  onClick={removePhoto}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#3D3732]/10 px-4 py-2 text-sm font-bold text-[#756E64] transition-colors hover:bg-[#F1E6D4] hover:text-[#3D3732]"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove photo
                </button>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onPhotoSelected}
            />

            <p className="mt-2 text-center text-xs leading-5 text-[#8B8378]">
              PNG, JPG or WebP. Cohiva crops it to a square and stores the resized profile image with your account.
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-bold text-[#3D3732]">
              Or choose a Cohiva icon
            </p>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {COHIVA_AVATAR_ICONS.map((icon) => {
                const selected =
                  !imageUrl && avatarIcon === icon;

                const iconUser = {
                  ...previewUser,
                  imageUrl: "",
                  avatarIcon: icon,
                };

                return (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => chooseIcon(icon)}
                    aria-label={`Use ${iconLabels[icon]} avatar`}
                    title={iconLabels[icon]}
                    className={`relative flex aspect-square items-center justify-center rounded-2xl border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm ${
                      selected
                        ? "border-[#CC3A63] bg-[#CC3A63]/5 ring-2 ring-[#CC3A63]/15"
                        : "border-[#3D3732]/10 bg-white/35 hover:border-[#B9687C]/40"
                    }`}
                  >
                    <UserAvatar
                      user={iconUser}
                      className="h-10 w-10"
                      iconClassName="h-5 w-5"
                    />

                    {selected ? (
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#CC3A63] text-white shadow-sm">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-[#3D3732]">
                First name
              </span>
              <input
                value={firstName}
                onChange={(event) =>
                  setFirstName(event.target.value)
                }
                maxLength={80}
                autoComplete="given-name"
                className="mt-2 h-11 w-full rounded-xl border border-[#3D3732]/15 bg-white/55 px-3 text-sm text-[#3D3732] outline-none transition focus:border-[#B9687C] focus:ring-2 focus:ring-[#B9687C]/15"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-[#3D3732]">
                Last name
              </span>
              <input
                value={lastName}
                onChange={(event) =>
                  setLastName(event.target.value)
                }
                maxLength={80}
                autoComplete="family-name"
                className="mt-2 h-11 w-full rounded-xl border border-[#3D3732]/15 bg-white/55 px-3 text-sm text-[#3D3732] outline-none transition focus:border-[#B9687C] focus:ring-2 focus:ring-[#B9687C]/15"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-[#3D3732]">
              Email
            </span>
            <input
              value={user.email}
              readOnly
              className="mt-2 h-11 w-full cursor-not-allowed rounded-xl border border-[#3D3732]/10 bg-[#EFE7DB] px-3 text-sm text-[#756E64] outline-none"
            />
            <span className="mt-1.5 block text-xs text-[#8B8378]">
              Email changes are disabled for now.
            </span>
          </label>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
              Profile updated.
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#3D3732]/10 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#756E64] transition-colors hover:bg-[#F1E6D4] hover:text-[#3D3732] disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex min-w-[132px] items-center justify-center gap-2 rounded-xl bg-[#CC3A63] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[#B52E56] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </section>
    </div>
  );
};

export default EditProfileModal;
