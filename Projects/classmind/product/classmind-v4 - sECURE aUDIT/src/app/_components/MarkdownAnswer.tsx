"use client";

import type { ReactNode } from "react";

// A deliberately small markdown renderer for MODEL ANSWERS only.
//
// The teaching prompt (answer.ts) allows the model exactly three structures --
// "### " headings, lists, **bold** -- plus `code` spans, because a taught
// answer needs shape a flat paragraph cannot give. `.prose-reading` in
// globals.css has styled p/ul/ol/h3/strong/code since v4 day one; this is the
// first thing that produces those elements.
//
// NOT a general markdown engine, on purpose:
//  - no dangerouslySetInnerHTML anywhere -- every node is built as React
//    elements, so an answer can never inject markup;
//  - no links, no images, no HTML passthrough -- an answer has no business
//    containing them;
//  - unknown syntax degrades to plain text, and a completely plain answer
//    renders exactly as it did before (paragraphs, line breaks preserved).
//
// Inline text segments are handed back to the caller through `renderText`, so
// the existing [n] citation buttons keep working inside any block.

interface Props {
  text: string;
  renderText: (segment: string, key: string) => ReactNode;
}

export default function MarkdownAnswer({ text, renderText }: Props) {
  const blocks = splitBlocks(text);
  return (
    <>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case "heading":
            return <h3 key={key}>{inline(b.lines[0], key, renderText)}</h3>;
          case "ul":
            return (
              <ul key={key}>
                {b.lines.map((line, j) => (
                  <li key={`${key}-${j}`}>{inline(line, `${key}-${j}`, renderText)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key}>
                {b.lines.map((line, j) => (
                  <li key={`${key}-${j}`}>{inline(line, `${key}-${j}`, renderText)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={key}>
                {b.lines.map((line, j) => (
                  <p key={`${key}-${j}`}>{inline(line, `${key}-${j}`, renderText)}</p>
                ))}
              </blockquote>
            );
          default:
            return (
              <p key={key}>
                {b.lines.map((line, j) => (
                  <span key={`${key}-${j}`}>
                    {j > 0 ? <br /> : null}
                    {inline(line, `${key}-${j}`, renderText)}
                  </span>
                ))}
              </p>
            );
        }
      })}
    </>
  );
}

interface Block {
  kind: "heading" | "ul" | "ol" | "quote" | "p";
  lines: string[];
}

const UL = /^\s*[-*]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{2,4}\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

function splitBlocks(text: string): Block[] {
  const out: Block[] = [];
  let current: Block | null = null;
  const flush = () => { if (current && current.lines.length) out.push(current); current = null; };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }

    const h = HEADING.exec(line);
    if (h) { flush(); out.push({ kind: "heading", lines: [h[1]] }); continue; }

    const u = UL.exec(line);
    if (u) {
      if (current?.kind !== "ul") { flush(); current = { kind: "ul", lines: [] }; }
      current.lines.push(u[1]);
      continue;
    }
    const o = OL.exec(line);
    if (o) {
      if (current?.kind !== "ol") { flush(); current = { kind: "ol", lines: [] }; }
      current.lines.push(o[1]);
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      if (current?.kind !== "quote") { flush(); current = { kind: "quote", lines: [] }; }
      current.lines.push(q[1]);
      continue;
    }

    if (current?.kind !== "p") { flush(); current = { kind: "p", lines: [] }; }
    current.lines.push(line);
  }
  flush();
  return out;
}

// Inline pass: `code` first (its content is verbatim -- no bold inside code),
// then **bold**, then *emphasis* -- models write "*My recommendation:*" even
// when only bold was asked for, and literal asterisks on screen are worse
// than honouring the intent. Single-asterisk requires non-space at both ends
// of its content so "5 * 3 * 2" stays arithmetic, not italics. Whatever
// remains goes to the caller's text renderer, which is where citation tokens
// become buttons.
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*\S(?:[^*\n]*\S)?\*)/g;

function inline(
  text: string,
  keyBase: string,
  renderText: (segment: string, key: string) => ReactNode,
): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-i${i}`;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part ? renderText(part, key) : null;
  });
}
