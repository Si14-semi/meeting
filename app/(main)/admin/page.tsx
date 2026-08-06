import { requirePageUser } from "@/lib/page-auth";
import { AdminView } from "@/components/admin/admin-view";

export default async function AdminPage() {
  await requirePageUser({ adminOnly: true });
  return <AdminView />;
}
