// Import-safe from a client component: no server-only, no Node built-ins,
// nothing but shapes. A transcript is rendered in the browser and mapped
// against in the browser, so its vocabulary has to live on both sides.

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  // Where this segment's text sits inside NormalizedTranscript.text, as a
  // half-open range: text.slice(charStart, charEnd) === segment.text,
  // exactly. The [mm:ss] marker preceding the segment is deliberately
  // outside the range -- the marker is presentation, and an evidence span
  // that included it would quote something the lecturer never said.
  //
  // This exists because extraction runs over the joined prose, so an
  // extracted item comes back with character offsets and nothing else.
  // These are what turn those offsets back into a timestamp.
  charStart: number;
  charEnd: number;
  text: string;
}

export interface NormalizedTranscript {
  // Continuous prose with inline [mm:ss] markers -- the default read.
  // Never served as pre-cut per-segment rows: pre-segmented rows make a
  // reader anchor on ASR boundaries rather than on meaning.
  text: string;
  segments: TranscriptSegment[];
}
