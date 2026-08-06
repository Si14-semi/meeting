import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { NoticePopup } from "@/components/notice-popup";

export default async function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh pb-16 sm:pb-0">
      <AppHeader userName={user.name} isAdmin={user.role === "ADMIN"} />
      {children}
      <NoticePopup />
    </div>
  );
}
