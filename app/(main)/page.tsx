import { requirePageUser } from "@/lib/page-auth";
import { ReservationBoard } from "@/components/board/board";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; focus?: string }>;
}) {
  const user = await requirePageUser();
  const sp = await searchParams;
  return (
    <ReservationBoard
      me={{ id: user.id, name: user.name, role: user.role }}
      initialDate={sp.date}
      focusId={sp.focus}
    />
  );
}
