"use client";

import { useState, useTransition } from "react";
import { deleteTemplate, duplicateTemplate } from "@/app/templates/actions";
import { Dialog } from "./dialog";
import { Button } from "./ui";

export function DuplicateTemplateButton({ id, name, size = "md" }: { id: string; name: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(`${name} (copy)`.slice(0, 200));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        Duplicate
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Duplicate template">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await duplicateTemplate({ id, name: draft });
              if (result && !result.ok) setError(result.message); // success redirects to the copy
            });
          }}
        >
          <p className="text-sm text-zinc-600">
            Creates a full, independent copy. Changes to the copy never affect &ldquo;{name}&rdquo;, and vice versa.
          </p>
          <label className="mt-4 block text-sm font-medium">
            Name of the copy
            <input
              autoFocus
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending || !draft.trim()}>
              {pending ? "Copying…" : "Create copy"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function DeleteTemplateButton({ id, name, size = "md" }: { id: string; name: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size={size} variant="danger" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete template?">
        <p className="text-sm text-zinc-600">
          &ldquo;{name}&rdquo; and all of its sections, items and comments will be permanently deleted. Copies of it are not affected.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteTemplate({ id });
                if (result && !result.ok) setError(result.message);
              })
            }
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
