"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/** Visual editor for comment text. Output is re-sanitised on the server before storage. */
export function RichEditor({ initialHtml, onChange }: { initialHtml: string; onChange: (html: string) => void }) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["http", "https", "mailto"] },
      }),
    ],
    content: initialHtml,
    immediatelyRender: false, // avoid SSR hydration mismatch
    editorProps: {
      attributes: { class: "rich min-h-32 px-3 py-2 text-sm focus:outline-none", "aria-label": "Comment text", role: "textbox" },
    },
    // StarterKit keeps an empty trailing paragraph after lists/blockquotes so the cursor can leave them;
    // don't store that editing aid as part of the inspector's comment.
    onUpdate: ({ editor: e }) => onChangeRef.current(e.isEmpty ? "" : e.getHTML().replace(/(?:<p><\/p>)+$/, "")),
  });

  return (
    <div>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      link: e.isActive("link"),
    }),
  });

  function editLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt("Link address (https://… or mailto:…). Leave empty to remove the link.", previous ?? "https://");
    if (input === null) return;
    const url = input.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(url)) {
      window.alert("Links must start with https://, http:// or mailto:");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  const buttons: Array<{ label: string; text: string; on: boolean; run: () => void; className?: string }> = [
    { label: "Bold", text: "B", on: active.bold, run: () => editor.chain().focus().toggleBold().run(), className: "font-bold" },
    { label: "Italic", text: "I", on: active.italic, run: () => editor.chain().focus().toggleItalic().run(), className: "italic" },
    { label: "Underline", text: "U", on: active.underline, run: () => editor.chain().focus().toggleUnderline().run(), className: "underline" },
    { label: "Bulleted list", text: "• List", on: active.bulletList, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", text: "1. List", on: active.orderedList, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Link", text: "Link", on: active.link, run: editLink },
  ];

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 border-b border-zinc-200 px-2 py-1">
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          aria-label={b.label}
          aria-pressed={b.on}
          title={b.label}
          onMouseDown={(e) => e.preventDefault()} // keep the editor selection
          onClick={b.run}
          className={`h-7 min-w-7 rounded px-2 text-xs ${b.on ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"} ${b.className ?? ""}`}
        >
          {b.text}
        </button>
      ))}
    </div>
  );
}
