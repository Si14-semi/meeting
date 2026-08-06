import { requirePageUser } from "@/lib/page-auth";
import { MyReservations } from "@/components/my-reservations";

export default async function MyPage() {
  const user = await requirePageUser();
  return <MyReservations me={{ id: user.id, name: user.name, role: user.role }} />;
}
