import { getHeroProject, getProjectView } from "@/lib/queries";
import { formatNgn } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Home() {
  const hero = await getHeroProject();
  if (!hero) return <main className="p-8">No project yet.</main>;
  const view = await getProjectView(hero.id);
  if (!view) return null;
  const total = view.boq.reduce((a, r) => a + r.quotedTotalNgn, 0);
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">{view.project.name}</h1>
      <p>
        {view.stages.length} stages, {view.boq.length} line items, quoted {formatNgn(total)}
      </p>
    </main>
  );
}
