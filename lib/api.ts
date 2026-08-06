import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** 로그인 필수 API 가드. 실패 시 NextResponse, 성공 시 사용자 반환 */
export async function requireUser(): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "로그인이 필요합니다.");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "로그인이 필요합니다.");
  if (user.role !== "ADMIN") return jsonError(403, "관리자 권한이 필요합니다.");
  return user;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
