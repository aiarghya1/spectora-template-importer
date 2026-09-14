"use client";

import Link from "next/link";
import { useRef } from "react";
import { renameTemplate } from "@/app/templates/actions";
import { EditableText } from "@/components/editable-text";
import { DeleteTemplateButton, DuplicateTemplateButton } from "@/components/template-buttons";
import { formatDateTime, linkButtonClass } from "@/components/ui";
import type { TemplateDetail } from "@/lib/templates/types";

export function TemplateHeader({ template }: { template: TemplateDetail }) {
  const versionRef = useRef(template.version);

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <EditableText
          value={template.name}
          label="Template name"
          maxLength={200}
          className="text-2xl font-semibold tracking-tight"
          save={async (next) => {
            const result = await renameTemplate({ id: template.id, version: versionRef.current, name: next });
            if (result.ok) versionRef.current = result.version;
            return result;
          }}
        />
        <p className="text-sm text-zinc-500">
          {template.sections.length} sections · Updated {formatDateTime(template.updatedAt)}
          {template.copiedFrom && (
            <>
              {" "}· Copy of{" "}
              <Link href={`/templates/${template.copiedFrom.id}`} className="underline">
                {template.copiedFrom.name}
              </Link>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {template.importId && (
          <Link href={`/templates/${template.id}/report`} className={linkButtonClass}>
            Import report
          </Link>
        )}
        <DuplicateTemplateButton id={template.id} name={template.name} />
        <DeleteTemplateButton id={template.id} name={template.name} />
      </div>
    </div>
  );
}
