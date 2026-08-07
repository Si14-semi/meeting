import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "meeting_session";

// 로그인 없이 접근 가능한 경로
const PUBLIC_PATHS = ["/login", "/register"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/cron/cleanup", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      valid = true;
    } catch {
      valid = false;
    }
  }

  const isPublicPage = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (pathname.startsWith("/api")) {
    if (!valid) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    return NextResponse.next();
  }

  if (!valid && !isPublicPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (valid && isPublicPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // 정적 파일과 Next 내부 경로 제외
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)).*)"],
};
