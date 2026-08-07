import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "meeting_session";
const SESSION_DAYS = 365; // 로그인 유지 1년 (사용자 확정 사항)

const ALLOWED_EMAIL_DOMAIN = "dwanatech.com";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  uid: string;
  role: "USER" | "ADMIN";
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.uid !== "string") return null;
    return { uid: payload.uid, role: payload.role === "ADMIN" ? "ADMIN" : "USER" };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // 사내서버는 HTTP 운영이라 secure 쿠키면 브라우저가 저장을 거부함 → COOKIE_SECURE=false 로 해제
    // (Vercel은 이 변수를 설정하지 않으므로 기존과 동일하게 secure 유지)
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** 쿠키만 검증 (DB 조회 없음) — middleware 등 가벼운 체크용 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  mustChangePassword: boolean;
};

/** 세션 + DB 사용자 확인. 탈퇴/삭제된 계정이면 null (role은 DB 기준 — 쿠키 위조 방지) */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
  });
  return user;
}

export function isAllowedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith("@" + ALLOWED_EMAIL_DOMAIN) && normalized.length > ALLOWED_EMAIL_DOMAIN.length + 1;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const EMAIL_DOMAIN = ALLOWED_EMAIL_DOMAIN;
