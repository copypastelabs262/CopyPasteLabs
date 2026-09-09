// `next` destinations arrive from query strings, so they are attacker-
// controlled. A bare startsWith("/") test is not enough: a leading "//" and a
// leading slash-backslash both begin with a slash and both leave the site,
// which is a textbook open redirect on exactly this kind of endpoint.
//
// NOR IS REJECTING THOSE TWO PREFIXES ENOUGH (fixed 2026-09-07, security
// audit). The previous version tested the raw string and let everything else
// through -- but the string is not what the browser resolves. WHATWG URL
// parsing DELETES tab, LF and CR from a URL before resolving it, so
//
//     /auth/callback?next=%2F%09%2Fevil.com
//
// arrived here as slash-TAB-slash-evil.com: it started with a single slash,
// matched neither forbidden prefix, and was returned unchanged. Then
// `new URL(next, origin)` deleted the tab, the two slashes became adjacent, and
// the destination resolved to https://evil.com/ -- after the check had already
// passed. Reproduced, not inferred. The same holds for LF and CR.
//
// The fix is to stop pattern-matching the dangerous shapes and instead accept
// only the safe one. A destination is a path on THIS site: exactly one leading
// "/", no character a URL parser will remove or reinterpret, no scheme
// separator -- and, as a final independent check, it must still resolve to the
// origin we resolved it against. Anything else becomes the default rather than
// being repaired: silently "cleaning" a hostile value is how the next variant
// gets through.
//
// One definition, used by the OAuth callback and the role chooser -- two
// validators for the same question would drift.

const DEFAULT_NEXT = "/courses";

// Written as character-code tests rather than a regex on purpose: the bytes
// this has to reject are exactly the bytes that are easiest to mangle when a
// literal is copied between files, and a validator whose own escape sequence is
// wrong fails open. Codes, not escapes, cannot be transcribed incorrectly.
const SPACE = 0x20;
const DEL = 0x7f;
const BACKSLASH = 0x5c;

function hasUnsafeCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    // Every control character, plus space. Tab (9), LF (10) and CR (13) are the
    // three a URL parser silently deletes; the rest have no business in a path
    // and refusing them costs nothing.
    if (code <= SPACE || code === DEL) return true;
    // Backslash. Windows-style URL parsing folds it to "/", so a leading
    // slash-backslash is protocol-relative in a browser even though the string
    // contains only one slash.
    if (code === BACKSLASH) return true;
  }
  return false;
}

// A throwaway origin. Chosen in the reserved .invalid TLD so that a bug here
// can never resolve to something real.
const PROBE_ORIGIN = "https://classmind.invalid";

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  // Exactly one leading slash.
  if (!raw.startsWith("/") || raw.startsWith("//")) return DEFAULT_NEXT;
  if (hasUnsafeCharacter(raw)) return DEFAULT_NEXT;
  // A scheme separator cannot appear in a same-site path in this product, and
  // ":" is how "/x:y" style confusions start. No legitimate destination here
  // contains one.
  if (raw.includes(":")) return DEFAULT_NEXT;

  // The independent check. If the URL parser disagrees with everything above
  // about where this points, the parser is what the browser will use, so the
  // parser wins and we refuse.
  try {
    if (new URL(raw, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
  return raw;
}
