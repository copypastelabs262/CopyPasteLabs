import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function Home() {
  const user = await currentUser();
  if (user) redirect("/courses");

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">ClassMind</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Lectures become verified course knowledge. Faculty confirm every item before a
        student sees it, and every item traces back to the second it was spoken.
      </p>
      <Link
        href="/signin"
        className="mt-8 inline-block rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Sign in
      </Link>
    </div>
  );
}
