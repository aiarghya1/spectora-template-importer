"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function TemplateError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this template</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Something went wrong talking to the database. No changes were made to your template.
      </p>
      {error.digest && <p className="mt-1 text-xs text-zinc-400">Reference: {error.digest}</p>}
      <div className="mt-6 flex items-center justify-center gap-3">
        <Button variant="primary" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/templates" className="text-sm underline">
          All templates
        </Link>
      </div>
    </main>
  );
}
