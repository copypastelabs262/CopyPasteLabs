import { redirect } from "next/navigation";

// Ask is now the class's landing (the base route), so this old tab URL just
// forwards there — old links and bookmarks keep working, there is one canonical
// place for a class's Ask, and the tab bar points at the base.
export default async function LegacyClassAskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/courses/${id}`);
}
