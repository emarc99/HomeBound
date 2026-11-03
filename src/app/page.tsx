import { getHeroProject, getProjectView } from "@/lib/queries";
import { toClientView } from "@/lib/client-view";
import ProjectWorkspace from "@/components/ProjectWorkspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  const hero = await getHeroProject();
  const view = hero ? await getProjectView(hero.id) : null;
  if (!view) return <main className="p-8">No project yet.</main>;
  const client = toClientView(view);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <div className="text-sm font-semibold tracking-wide text-laterite">HOMEBOUND</div>
          <h1 className="text-2xl font-semibold">{client.project.name}</h1>
          <p className="text-sm text-muted">
            {client.project.siteCity}, {client.project.siteState} · owner {client.project.ownerName} in {client.project.ownerCity}
          </p>
        </div>
        <p className="max-w-sm text-right text-sm text-muted">Build home from abroad. Pay only for what&apos;s real.</p>
      </header>
      <ProjectWorkspace view={client} />
    </main>
  );
}
