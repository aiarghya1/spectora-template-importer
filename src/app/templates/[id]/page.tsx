import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Banner } from "@/components/ui";
import { getSectionContent, getTemplate } from "@/lib/templates/queries";
import { SectionPanel } from "./section-panel";
import { SectionSidebar } from "./section-sidebar";
import { TemplateHeader } from "./template-header";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; imported?: string; copied?: string }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const template = await getTemplate(id);
  return { title: template ? `${template.name} · Template Importer` : "Template not found" };
}

export default async function TemplatePage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const template = await getTemplate(id);
  if (!template) notFound();

  // Only the open section's items and comments are loaded, so large templates stay fast.
  const active = template.sections.find((s) => s.id === query.section) ?? template.sections[0] ?? null;
  const items = active ? ((await getSectionContent(template.id, active.id)) ?? []) : [];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="space-y-3">
          {query.imported && (
            <Banner tone="success" title="Template imported">
              Review what came across in the{" "}
              <Link href={`/templates/${template.id}/report`} className="font-medium underline">
                import report
              </Link>
              .
            </Banner>
          )}
          {query.copied && (
            <Banner tone="info" title="This is an independent copy">
              Edits here never change the original template, and edits to the original never change this copy.
            </Banner>
          )}
        </div>

        <div className="mt-4">
          <TemplateHeader key={`${template.id}:${template.version}`} template={template} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <SectionSidebar templateId={template.id} sections={template.sections} activeId={active?.id ?? null} />
          <div className="min-w-0">
            {active ? (
              <SectionPanel key={active.id} section={active} items={items} />
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center text-sm text-zinc-600">
                This template has no sections. Add one from the sidebar.
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
