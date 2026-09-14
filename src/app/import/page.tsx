import { AppHeader } from "@/components/app-header";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import a template · Template Importer" };

export default function ImportPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Import a Spectora template</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          You&apos;ll see exactly what will be created — and anything that can&apos;t come across — before anything is saved.
        </p>
        <details className="mt-4 max-w-2xl rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">How to get the file from Spectora</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-700">
            <li>In Spectora, open Templates and choose your template.</li>
            <li>Click <strong>Export to spreadsheet</strong>.</li>
            <li>
              Choose <strong>Export HTML Text</strong> (not plain text — that one strips your links and formatting).
            </li>
            <li>Download the file and upload it below (.xlsx, .xls or .csv, up to 4 MB).</li>
          </ol>
        </details>
        <div className="mt-6">
          <ImportWizard />
        </div>
      </main>
    </>
  );
}
