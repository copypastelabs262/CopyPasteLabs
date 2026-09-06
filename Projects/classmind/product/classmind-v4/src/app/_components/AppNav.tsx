"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";
import { MenuIcon, HomeIcon, SearchIcon, BookIcon, UserIcon, LogoutIcon, CloseIcon } from "./ui/icons";
import { useSignOut } from "./SignOutButton";

// THE ONE NAVIGATION. Phase 2's structural move: a single, persistent, top-left
// control that opens the whole product's map. It replaces the old thin top-bar
// link AND the desktop-only class rail, so there is one way to move around at
// every size, not three that disagree.
//
// It is navigation, not a dashboard: a few clear destinations and sign out.
// Everything richer (a course's tabs, a conversation's history) lives on the
// surface it belongs to, reached THROUGH here.

interface NavItem {
  href: string;
  label: string;
  icon: (p: { size?: number; className?: string }) => React.ReactElement;
  // Matches the item as active when the path is exactly this, or (for section
  // roots) starts with it. Home is exact so a course page doesn't light it.
  exact?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/courses", label: "Home", icon: HomeIcon, exact: true },
  { href: "/ask", label: "Ask ClassMind", icon: SearchIcon },
  { href: "/classes", label: "My Classes", icon: BookIcon },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export default function AppNav({
  fullName,
  role,
}: {
  fullName: string | null;
  role: "faculty" | "student" | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const signOut = useSignOut();

  // A course detail lives under /courses/<id>, which should light "My Classes",
  // not "Home". So Home is the only exact match; /classes owns the course tree.
  const isActive = (item: NavItem) => {
    if (item.exact) return pathname === item.href;
    if (item.href === "/classes") return pathname === "/classes" || pathname.startsWith("/courses/");
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  // Escape closes and returns focus; a focus trap keeps Tab inside the open
  // drawer; the body doesn't scroll behind it. All three only exist while open.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const roleLabel = role === "faculty" ? "Faculty" : role === "student" ? "Student" : "New account";
  const firstName = (fullName?.trim() || "there").split(" ")[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
      >
        <MenuIcon size={20} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          {/* Backdrop: a click dismisses; it dims the page so the drawer reads
              as a layer, not part of the content. */}
          <div
            className="absolute inset-0 bg-[rgba(6,9,16,0.6)] motion-fade"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-line bg-surface-raised shadow-lift motion-drawer-in"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <span className="text-[15px] font-semibold tracking-tight text-ink">ClassMind</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-2">
              <ul className="space-y-1">
                {ITEMS.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] transition-colors",
                          active
                            ? "bg-accent-soft font-medium text-accent"
                            : "text-ink-soft hover:bg-surface-sunken hover:text-ink",
                        )}
                      >
                        <Icon size={18} className="shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-line p-3">
              <div className="px-2 pb-2">
                <p className="truncate text-sm font-medium text-ink">{firstName}</p>
                <p className="text-xs text-ink-faint">{roleLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                <LogoutIcon size={18} className="shrink-0" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
