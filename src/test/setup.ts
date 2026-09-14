import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  // jsdom doesn't implement modal dialogs; give <dialog> the minimal behaviour our Dialog relies on.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };

  // ProseMirror (Tiptap) measures selections when scrolling them into view; jsdom has no layout.
  const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects = emptyRects;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.getClientRects = emptyRects;
  document.elementFromPoint = () => null;
}
