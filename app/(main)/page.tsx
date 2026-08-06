import { requirePageUser } from "@/lib/page-auth";
import { ReservationBoard } from "@/components/board/board";

export default async function HomePage() {
  const user = await requirePageUser();
  return <ReservationBoard me={{ id: user.id, name: user.name, role: user.role }} />;
}
