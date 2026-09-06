// `next` destinations arrive from query strings, so they are attacker-
// controlled. A bare startsWith("/") test is not enough: "//evil.com" and
// "/\evil.com" both begin with a slash and both leave the site, which is a
// textbook open redirect on exactly this kind of endpoint. Accept a single
// leading slash and nothing else.
//
// One definition, used by the OAuth callback and the role chooser -- two
// validators for the same question would drift.
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return "/courses";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/courses";
  return raw;
}
