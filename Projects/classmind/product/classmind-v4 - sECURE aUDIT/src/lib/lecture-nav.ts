// PREVIOUS / NEXT lecture, as a pure function of the list the shell already
// holds. Kept out of the component so it can be tested offline, exhaustively,
// without a browser or a database.
//
// The course payload lists lectures NEWEST-FIRST; a course is TAUGHT
// oldest-first, so chronological order is the reverse and "next" is the lecture
// recorded AFTER the current one. The caller passes whatever list it can show
// the viewer (a student's is already filtered to what they may open), so
// stepping through the result never lands on a lecture they cannot see. When
// the current lecture is not in the list, or sits at an end, the corresponding
// side is null and the UI renders nothing there.

export function lectureNeighbours<T extends { id: string }>(
  lecturesNewestFirst: readonly T[],
  currentId: string,
): { prev: T | null; next: T | null } {
  const chrono = [...lecturesNewestFirst].reverse();
  const idx = chrono.findIndex((l) => l.id === currentId);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? chrono[idx - 1] : null,
    next: idx < chrono.length - 1 ? chrono[idx + 1] : null,
  };
}
