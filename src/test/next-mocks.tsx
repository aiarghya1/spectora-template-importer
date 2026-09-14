/**
 * Shared doubles for Next.js modules in component/page tests. Use inside vi.mock factories:
 *   vi.mock("next/link", async () => (await import("@/test/next-mocks")).linkModule);
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

export const linkModule = {
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
};

export class NavigationSignal extends Error {}

export const redirectTo = (url: string): never => {
  throw new NavigationSignal(`REDIRECT:${url}`);
};

export const notFoundSignal = (): never => {
  throw new NavigationSignal("NOT_FOUND");
};

/** Every server action the UI imports, as spies. */
export function actionSpies<T extends (...args: never[]) => unknown>(fn: () => T) {
  return {
    renameTemplate: fn(),
    renameNode: fn(),
    updateComment: fn(),
    addSection: fn(),
    addItem: fn(),
    addComment: fn(),
    deleteNode: fn(),
    moveNode: fn(),
    duplicateTemplate: fn(),
    deleteTemplate: fn(),
  };
}
