import "server-only";

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "cm_vip_admin";
const SESSION_HOURS = 12;

function configuredPassword() {
  const password = process.env.CM_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("CM_ADMIN_PASSWORD is not configured.");
  }
  return password;
}

function sessionToken() {
  return createHash("sha256")
    .update(`cryptomainly-vip-admin:${configuredPassword()}`)
    .digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordMatches(candidate: string) {
  return safeEqual(candidate, configuredPassword());
}

export async function hasAdminSession() {
  const store = await cookies();
  const supplied = store.get(COOKIE_NAME)?.value ?? "";
  return safeEqual(supplied, sessionToken());
}

export async function createAdminSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin/vip",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin/vip",
    maxAge: 0,
  });
}
