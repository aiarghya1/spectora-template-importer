import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { DeleteTemplateButton, DuplicateTemplateButton } from "@/components/template-buttons";
import { Badge, formatDateTime, formatNumber } from "@/components/ui";
import { listTemplates } from "@/lib/templates/queries";

export const metadata = { title: "Templates · Template Importer" };

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <Link href="/import" className="inline-flex h-9 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700">
            Import from Spectora
          </Link>
        </div>

        {templates.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
            <p className="font-medium">No templates yet</p>
            <p className="mt-1 text-sm text-zinc-600">Import your Spectora template to get started. Nothing is saved until you confirm.</p>
            <Link href="/import" className="mt-4 inline-block text-sm font-medium underline">
              Import a template
            </Link>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/templates/${template.id}`} className="truncate font-medium text-zinc-900 hover:underline">
                      {template.name}
                    </Link>
                    {template.copiedFromId && <Badge>Copy</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatNumber(template.sectionCount)} sections · {formatNumber(template.commentCount)} comments · Updated{" "}
                    {formatDateTime(template.updatedAt)}
                  </p>
                </div>
                <DuplicateTemplateButton id={template.id} name={template.name} size="sm" />
                <DeleteTemplateButton id={template.id} name={template.name} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
