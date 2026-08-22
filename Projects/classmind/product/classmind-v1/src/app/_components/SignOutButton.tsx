"use client";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await browserClient().auth.signOut();
        router.push("/signin");
        router.refresh();
      }}
      className="text-zinc-600 hover:underline dark:text-zinc-400"
    >
      Sign out
    </button>
  );
}
