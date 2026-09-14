import Link from "next/link";

export default function TemplateNotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Template not found</h1>
      <p className="mt-2 text-sm text-zinc-600">It may have been deleted, or it belongs to a different account.</p>
      <Link href="/templates" className="mt-6 inline-block text-sm font-medium underline">
        Back to templates
      </Link>
    </main>
  );
}
