import { redirect } from "next/navigation";
import { latestTemplateId } from "@/lib/templates/queries";

/** Open straight into the most recently edited template (the seeded import on a fresh account). */
export default async function Home() {
  const id = await latestTemplateId();
  redirect(id ? `/templates/${id}` : "/templates");
}
