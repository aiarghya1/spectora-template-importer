import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ColumnTable } from "@/components/import/column-table";
import { IssueList } from "@/components/import/issue-list";
import { Reconciliation } from "@/components/import/reconciliation";
import { Banner, formatDateTime, formatNumber } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/import/labels";
import type { IssueCategory } from "@/lib/import/types";
import { getImportReport, getTemplate } from "@/lib/templates/queries";

export const metadata = { title: "Import report · Template Importer" };

export default async function ImportReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [template, report] = await Promise.all([getTemplate(id), getImportReport(id)]);
  if (!template) notFound();

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href={`/templates/${template.id}`} className="text-sm text-zinc-600 hover:underline">
          ← Back to {template.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Import report</h1>

        {!report ? (
          <div className="mt-6">
            <Banner tone="info" title="No import report for this template">
              It wasn&apos;t created by an import, or its import record has been deleted.
            </Banner>
          </div>
        ) : (
          <div className="mt-6 space-y-10">
            {template.copiedFrom !== null || report.originalTemplate ? (
              <Banner tone="info" title="This template is a copy">
                This report is from the original import
                {report.originalTemplate ? (
                  <>
                    {" "}into{" "}
                    <Link href={`/templates/${report.originalTemplate.id}`} className="underline">
                      {report.originalTemplate.name}
                    </Link>
                  </>
                ) : (
                  " (that template has since been deleted)"
                )}
                . &ldquo;Open in editor&rdquo; links point to the matching comments in this copy.
              </Banner>
            ) : null}

            <dl className="grid gap-x-8 gap-y-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-2">
              <Meta label="File">{report.filename}</Meta>
              <Meta label="Imported">{formatDateTime(report.createdAt)}</Meta>
              <Meta label="Sheet">{report.summary.sheetName ?? "—"}</Meta>
              <Meta label="Rows in file">{formatNumber(report.sourceRows)}</Meta>
              <Meta label="File fingerprint (SHA-256)">
                <span className="break-all font-mono text-xs">{report.sha256}</span>
              </Meta>
            </dl>

            {report.summary.stats && (
              <section aria-labelledby="reconcile-heading">
                <h2 id="reconcile-heading" className="text-lg font-semibold">Did everything come across?</h2>
                <div className="mt-3">
                  <Reconciliation stats={report.summary.stats} />
                </div>
              </section>
            )}

            <section aria-labelledby="issues-heading">
              <h2 id="issues-heading" className="text-lg font-semibold">Issues</h2>
              <dl className="mt-2 grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
                {(Object.keys(CATEGORY_LABEL) as IssueCategory[]).map((key) => (
                  <div key={key}>
                    <dt className="inline font-medium text-zinc-800">{CATEGORY_LABEL[key].label}:</dt>{" "}
                    <dd className="inline">{CATEGORY_LABEL[key].description}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4">
                <IssueList issues={report.issues} templateId={template.id} />
              </div>
            </section>

            {report.summary.columns && (
              <section aria-labelledby="columns-heading">
                <h2 id="columns-heading" className="text-lg font-semibold">How columns were read</h2>
                <div className="mt-3">
                  <ColumnTable columns={report.summary.columns} />
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-900">{children}</dd>
    </div>
  );
}
