import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";

/** 페이지용 인증 가드. 미로그인 → /login, 임시비밀번호 상태 → /change-password */
export async function requirePageUser(opts?: { allowMustChange?: boolean; adminOnly?: boolean }): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts?.allowMustChange) redirect("/change-password");
  if (opts?.adminOnly && user.role !== "ADMIN") redirect("/");
  return user;
}
