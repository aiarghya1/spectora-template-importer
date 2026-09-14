import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Template Importer" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Template Importer</h1>
        <p className="mt-1 text-sm text-zinc-600">Bring your Spectora templates across intact.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          That confirmation link is invalid or expired. Try signing in, or sign up again.
        </p>
      )}
      <LoginForm next={next} />
    </main>
  );
}
