"use client";

import { useRef, useState, useTransition } from "react";
import {
  addComment,
  addItem,
  addSection,
  deleteNode,
  moveNode,
  renameNode,
  type ActionResult,
} from "@/app/templates/actions";
import { Dialog } from "./dialog";
import { EditableText } from "./editable-text";
import { Button } from "./ui";

type Kind = "section" | "item" | "comment";

/** Rename a section or item, carrying the row version for conflict detection. */
export function NodeName({
  kind,
  id,
  version,
  name,
  className,
}: {
  kind: "section" | "item";
  id: string;
  version: number;
  name: string;
  className?: string;
}) {
  const versionRef = useRef(version);
  return (
    <EditableText
      value={name}
      label={kind === "section" ? "Section name" : "Item name"}
      maxLength={500}
      className={className}
      save={async (next) => {
        const result = await renameNode({ kind, id, version: versionRef.current, name: next });
        if (result.ok) versionRef.current = result.version;
        return result;
      }}
    />
  );
}

export function MoveButtons({
  kind,
  id,
  label,
  isFirst,
  isLast,
}: {
  kind: Kind;
  id: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const move = (direction: -1 | 1) =>
    startTransition(async () => {
      const result = await moveNode({ kind, id, direction });
      setError(result.ok ? null : result.message);
    });

  return (
    <span className="inline-flex items-center">
      <Button variant="ghost" size="sm" aria-label={`Move ${label} up`} title="Move up" disabled={isFirst || pending} onClick={() => move(-1)}>
        ↑
      </Button>
      <Button variant="ghost" size="sm" aria-label={`Move ${label} down`} title="Move down" disabled={isLast || pending} onClick={() => move(1)}>
        ↓
      </Button>
      {error && (
        <span role="alert" className="ml-1 text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}

export function DeleteNodeButton({
  kind,
  id,
  label,
  description,
}: {
  kind: Kind;
  id: string;
  label: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button variant="ghost" size="sm" aria-label={`Delete ${label}`} onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete this ${kind}?`}>
        <p className="text-sm text-zinc-600">{description}</p>
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
                const result = await deleteNode({ kind, id });
                if (result.ok) setOpen(false);
                else setError(result.message);
              })
            }
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function InlineAddForm({
  buttonLabel,
  placeholder,
  onAdd,
}: {
  buttonLabel: string;
  placeholder: string;
  onAdd: (name: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + {buttonLabel}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await onAdd(value);
          if (result.ok) {
            setValue("");
            setError(null);
            setOpen(false);
          } else {
            setError(result.message);
          }
        });
      }}
    >
      <input
        autoFocus
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        maxLength={500}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="h-8 min-w-0 flex-1 rounded-md border border-zinc-300 px-2 text-sm"
      />
      <Button type="submit" size="sm" variant="primary" disabled={pending || !value.trim()}>
        {pending ? "Adding…" : "Add"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

export function AddSectionForm({ templateId }: { templateId: string }) {
  return <InlineAddForm buttonLabel="Add section" placeholder="Section name" onAdd={(name) => addSection({ templateId, name })} />;
}

export function AddItemForm({ sectionId }: { sectionId: string }) {
  return <InlineAddForm buttonLabel="Add item" placeholder="Item name" onAdd={(name) => addItem({ sectionId, name })} />;
}

export function AddCommentForm({ itemId }: { itemId: string }) {
  return <InlineAddForm buttonLabel="Add comment" placeholder="Comment name" onAdd={(title) => addComment({ itemId, title })} />;
}
