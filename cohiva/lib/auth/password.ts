import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

const scryptOptions: ScryptOptions = {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: MAX_MEMORY,
};

const deriveKey = (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions
) =>
  new Promise<Buffer>(
    (resolve, reject) => {
      scrypt(
        password,
        salt,
        keyLength,
        options,
        (
          error,
          derivedKey
        ) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(
            Buffer.from(
              derivedKey
            )
          );
        }
      );
    }
  );

export const hashPassword = async (
  password: string
) => {
  const salt = randomBytes(16);

  const derivedKey =
    await deriveKey(
      password,
      salt,
      KEY_LENGTH,
      scryptOptions
    );

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
};

export const verifyPassword = async (
  password: string,
  storedHash: string
) => {
  const parts =
    storedHash.split("$");

  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt"
  ) {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);

  /*
   * Cohiva currently writes one approved parameter set. Refuse altered
   * parameters rather than allowing a malicious/corrupt database value
   * to force unexpectedly expensive password work.
   */
  if (
    n !== SCRYPT_N ||
    r !== SCRYPT_R ||
    p !== SCRYPT_P
  ) {
    return false;
  }

  try {
    const salt =
      Buffer.from(
        parts[4],
        "base64url"
      );

    const expected =
      Buffer.from(
        parts[5],
        "base64url"
      );

    if (
      salt.length < 16 ||
      expected.length !== KEY_LENGTH
    ) {
      return false;
    }

    const actual =
      await deriveKey(
        password,
        salt,
        expected.length,
        scryptOptions
      );

    return timingSafeEqual(
      actual,
      expected
    );
  } catch {
    return false;
  }
};
