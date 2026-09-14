import { CommentCard } from "@/components/comment-card";
import { AddCommentForm, AddItemForm, DeleteNodeButton, MoveButtons, NodeName } from "@/components/node-controls";
import type { ItemView, SectionSummary } from "@/lib/templates/types";

export function SectionPanel({ section, items }: { section: SectionSummary; items: ItemView[] }) {
  const commentCount = items.reduce((n, i) => n + i.comments.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 border-b border-zinc-200 pb-3">
        <div className="min-w-0 flex-1">
          <NodeName key={`${section.id}:${section.version}`} kind="section" id={section.id} version={section.version} name={section.name} className="text-xl font-semibold" />
          <p className="text-sm text-zinc-500">
            {items.length} items · {commentCount} comments
          </p>
        </div>
        <DeleteNodeButton
          kind="section"
          id={section.id}
          label={section.name}
          description={`"${section.name}" with its ${items.length} item(s) and ${commentCount} comment(s) will be removed from this template. Copies are not affected.`}
        />
      </div>

      <div className="mt-4 space-y-4">
        {items.map((item, index) => (
          <ItemBlock key={`${item.id}:${item.version}`} item={item} isFirst={index === 0} isLast={index === items.length - 1} />
        ))}
        {items.length === 0 && <p className="text-sm text-zinc-500">No items in this section yet.</p>}
        <AddItemForm sectionId={section.id} />
      </div>
    </div>
  );
}

function ItemBlock({ item, isFirst, isLast }: { item: ItemView; isFirst: boolean; isLast: boolean }) {
  return (
    <section id={`item-${item.id}`} aria-label={item.name} className="scroll-mt-20 rounded-xl border border-zinc-200 bg-zinc-100/50 p-4">
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <NodeName kind="item" id={item.id} version={item.version} name={item.name} className="font-semibold text-zinc-900" />
          <p className="text-xs text-zinc-500">
            {item.comments.length} comments{item.sourceRow !== null && ` · first seen on row ${item.sourceRow}`}
          </p>
        </div>
        <MoveButtons kind="item" id={item.id} label={item.name} isFirst={isFirst} isLast={isLast} />
        <DeleteNodeButton
          kind="item"
          id={item.id}
          label={item.name}
          description={`"${item.name}" and its ${item.comments.length} comment(s) will be removed from this template. Copies are not affected.`}
        />
      </header>
      <div className="mt-3 space-y-2">
        {item.comments.map((comment, index) => (
          <CommentCard
            key={`${comment.id}:${comment.version}`}
            comment={comment}
            isFirst={index === 0}
            isLast={index === item.comments.length - 1}
          />
        ))}
        {item.comments.length === 0 && <p className="text-sm text-zinc-500">No comments in this item.</p>}
      </div>
      <div className="mt-3">
        <AddCommentForm itemId={item.id} />
      </div>
    </section>
  );
}
