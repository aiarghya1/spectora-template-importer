import Link from "next/link";
import { signOut } from "@/app/login/actions";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/templates" className="font-semibold tracking-tight">
          Template Importer
        </Link>
        <nav aria-label="Main" className="flex gap-4 text-sm text-zinc-600">
          <Link href="/templates" className="hover:text-zinc-900">
            Templates
          </Link>
          <Link href="/import" className="hover:text-zinc-900">
            Import
          </Link>
        </nav>
        <form action={signOut} className="ml-auto">
          <button type="submit" className="text-sm text-zinc-600 hover:text-zinc-900">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
