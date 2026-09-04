import type {
  Call,
} from "@stream-io/video-react-sdk";

/* =========================================================
   TYPES
========================================================= */

export type IndividualParticipantPermissions = {
  audio?: boolean;
  video?: boolean;
  screenShare?: boolean;
};

export type IndividualParticipantPermissionMap =
  Record<
    string,
    IndividualParticipantPermissions
  >;

export type IndividualPermissionField =
  | "audio"
  | "video"
  | "screenShare";

/* =========================================================
   KEY STORED IN STREAM CALL CUSTOM DATA
========================================================= */

export const INDIVIDUAL_PERMISSIONS_KEY =
  "cohiva_individual_permissions";

/* =========================================================
   READ ALL INDIVIDUAL PERMISSIONS
========================================================= */

export const getIndividualPermissionMap = (
  custom:
    Record<string, unknown> |
    undefined |
    null
): IndividualParticipantPermissionMap => {
  const stored =
    custom?.[
      INDIVIDUAL_PERMISSIONS_KEY
    ];

  if (
    !stored ||
    typeof stored !==
      "object" ||
    Array.isArray(
      stored
    )
  ) {
    return {};
  }

  return stored as
    IndividualParticipantPermissionMap;
};

/* =========================================================
   CHECK ONE PERMISSION

   Default = TRUE.

   This is important because students normally
   begin with audio/video/share allowed.
========================================================= */

export const isIndividualPermissionAllowed = (
  custom:
    Record<string, unknown> |
    undefined |
    null,

  userId:
    string,

  field:
    IndividualPermissionField
) => {
  const permissions =
    getIndividualPermissionMap(
      custom
    );

  return (
    permissions[
      userId
    ]?.[
      field
    ] !== false
  );
};

/* =========================================================
   SAVE ONE PARTICIPANT'S STATE TO STREAM CUSTOM DATA

   This makes the state survive:
   - closing/reopening the menu
   - switching video/whiteboard
   - React rerenders
   - teacher reopening participant controls
========================================================= */

export const saveIndividualPermission = async (
  call:
    Call,

  custom:
    Record<string, unknown> |
    undefined |
    null,

  userId:
    string,

  field:
    IndividualPermissionField,

  allowed:
    boolean
) => {
  const existingCustom = {
    ...(custom ??
      {}),
  };

  const existingPermissions =
    getIndividualPermissionMap(
      existingCustom
    );

  const existingUser =
    existingPermissions[
      userId
    ] ??
    {};

  await call.update({
    custom: {
      ...existingCustom,

      [INDIVIDUAL_PERMISSIONS_KEY]:
        {
          ...existingPermissions,

          [userId]: {
            ...existingUser,

            [field]:
              allowed,
          },
        },
    },
  });
};