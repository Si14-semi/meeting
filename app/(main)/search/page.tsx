import { requirePageUser } from "@/lib/page-auth";
import { SearchView } from "@/components/search-view";

export default async function SearchPage() {
  const user = await requirePageUser();
  return <SearchView me={{ id: user.id, name: user.name, role: user.role }} />;
}
