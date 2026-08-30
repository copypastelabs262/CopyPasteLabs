"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";
import { Button, cx } from "./ui";
import { ChevronDownIcon } from "./ui/icons";

// Signing out, in the two shapes the app needs it.
//
// `SignOutButton` is the bare action, kept as the default export because other
// screens import it directly. `UserMenu` is what the header uses: the same
// action, plus the three facts someone checks when they are not sure which
// account they are in -- who, which address, and what they are allowed to do.

// `router.refresh()` after the push is the load-bearing half. The push moves
// the browser, but every server component on the next screen was rendered with
// the old session cookie already read; without the refresh the app can land on
// /signin still showing the previous user's name in the header.
function useSignOut() {
  const router = useRouter();
  return useCallback(async () => {
    await browserClient().auth.signOut();
    router.push("/signin");
    router.refresh();
  }, [router]);
}

export default function SignOutButton() {
  const signOut = useSignOut();
  return (
    <Button tone="ghost" size="sm" onClick={signOut}>
      Sign out
    </Button>
  );
}

export function UserMenu({
  email,
  fullName,
  role,
}: {
  email: string | null;
  fullName: string | null;
  role: "faculty" | "student";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const signOut = useSignOut();

  // A profile row can exist without a name, and a bearer-token session can
  // exist without an address, so neither field is safe to render on its own.
  const displayName = fullName?.trim() || email || "Account";
  const firstName = displayName.split(" ")[0];
  const initial = displayName.charAt(0).toUpperCase();
  const roleLabel = role === "faculty" ? "Faculty" : "Student";

  // Both listeners live behind `open` so a closed menu costs nothing, and both
  // are torn down together -- a stray pointerdown handler left on the document
  // closes menus that have not been opened yet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Escape must hand focus back, or a keyboard user is dropped at the top
      // of the document and has to tab the whole header again.
      triggerRef.current?.focus();
    };
    // pointerdown rather than click: a click fires where the pointer is
    // released, so pressing inside the panel and releasing outside it would
    // dismiss the menu mid-interaction.
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-full px-1 text-sm text-ink-soft transition-colors hover:text-ink sm:pr-2.5"
      >
        {/* The name is the visible label on wide screens and gone on narrow
            ones, so the accessible name cannot depend on it. */}
        <span className="sr-only">Account menu</span>
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent"
        >
          {initial}
        </span>
        <span className="hidden max-w-36 truncate sm:inline">{firstName}</span>
        <ChevronDownIcon
          size={14}
          className={cx("hidden shrink-0 transition-transform sm:block", open && "rotate-180")}
        />
      </button>

      {open ? (
        // Right-aligned and fixed-width: anchored to the left it would run off
        // the edge of a phone, and letting it size to its content means the
        // panel changes width with the length of someone's email address.
        <div
          role="menu"
          aria-label="Account"
          className="motion-rise absolute top-full right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lift"
        >
          <div className="px-3.5 py-3">
            <p className="truncate text-sm font-medium text-ink">{displayName}</p>
            {/* Only when it is not already the line above it. */}
            {email && email !== displayName ? (
              <p className="mt-0.5 truncate text-xs text-ink-faint">{email}</p>
            ) : null}
            <p className="mt-1.5 text-xs text-ink-faint">{roleLabel}</p>
          </div>
          <div className="border-t border-line">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className="flex w-full items-center px-3.5 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface-sunken"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
