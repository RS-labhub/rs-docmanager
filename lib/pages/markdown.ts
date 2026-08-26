// Lightweight server-side BlockNote ↔ Markdown bridge. Lossy, covers the
// common subset (paragraph, heading 1-3, lists, quote, code, image); the
// client-written `markdown_cache` is preferred when available.
import "server-only";

interface InlineRun {
  type: "text";
  text: string;
  styles?: Record<string, boolean | string>;
}

interface BNBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: InlineRun[] | string;
  children?: BNBlock[];
}


function inlineToMarkdown(content: BNBlock["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map((run) => {
      // Link nodes carry their own content array — flatten by
      // recursing so nested formatting survives the round-trip.
      const r = run as unknown as
        | InlineRun
        | {
            type: "link";
            href: string;
            content?: InlineRun[];
          };

      if (r.type === "link") {
        const inner = inlineToMarkdown(r.content ?? []);
        return `[${inner}](${r.href})`;
      }

      if (r.type !== "text") return "";
      let text = r.text ?? "";
      const s = r.styles ?? {};
      if (s.code) text = `\`${text}\``;
      if (s.bold) text = `**${text}**`;
      if (s.italic) text = `*${text}*`;
      if (s.strike) text = `~~${text}~~`;
      return text;
    })
    .join("");
}

function blockToMarkdown(block: BNBlock, indent = 0): string {
  const pad = "  ".repeat(indent);
  const inline = inlineToMarkdown(block.content);
  const renderChildren = () =>
    (block.children ?? [])
      .map((c) => blockToMarkdown(c, indent + 1))
      .join("\n");

  switch (block.type) {
    case "heading": {
      const level = Math.min(
        Math.max(
          Number((block.props as { level?: number } | undefined)?.level ?? 1),
          1
        ),
        3
      );
      return `${pad}${"#".repeat(level)} ${inline}`.trimEnd();
    }
    case "bulletListItem":
      return [`${pad}- ${inline}`, renderChildren()]
        .filter(Boolean)
        .join("\n");
    case "numberedListItem":
      return [`${pad}1. ${inline}`, renderChildren()]
        .filter(Boolean)
        .join("\n");
    case "checkListItem": {
      const checked = (block.props as { checked?: boolean } | undefined)
        ?.checked
        ? "x"
        : " ";
      return [`${pad}- [${checked}] ${inline}`, renderChildren()]
        .filter(Boolean)
        .join("\n");
    }
    case "quote":
      return inline
        .split("\n")
        .map((l) => `${pad}> ${l}`)
        .join("\n");
    case "codeBlock": {
      const lang =
        (block.props as { language?: string } | undefined)?.language ?? "";
      return `${pad}\`\`\`${lang}\n${inline}\n${pad}\`\`\``;
    }
    case "image": {
      const url = (block.props as { url?: string } | undefined)?.url ?? "";
      const caption =
        (block.props as { caption?: string } | undefined)?.caption ??
        inline ??
        "";
      return `${pad}![${caption}](${url})`;
    }
    case "divider":
      return `${pad}---`;
    case "paragraph":
    default:
      return `${pad}${inline}`.trimEnd();
  }
}

export function blocksToMarkdown(blocks: unknown[]): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return blocks
    .filter((b): b is BNBlock => !!b && typeof b === "object")
    .map((b) => blockToMarkdown(b))
    .join("\n\n")
    .trim();
}

// markdown → blocks

// Parse inline markdown (bold, italic, strike, code, links) into BlockNote runs.
// Code is captured first so marks inside a code span stay literal.
function parseInline(text: string): InlineRun[] {
  if (!text) return [];
  const runs: InlineRun[] = [];

  // Token types we split the string into.
  type Token =
    | { kind: "text"; value: string }
    | { kind: "code"; value: string }
    | { kind: "link"; label: string; url: string }
    | { kind: "mark"; style: "bold" | "italic" | "strike"; value: string };

  // Greedy tokeniser: walk the string and at every position try to
  // match one of the supported inline patterns. Whatever doesn't
  // match is accumulated as plain text.
  const tokens: Token[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      tokens.push({ kind: "text", value: buf });
      buf = "";
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);

    // Inline code — ``...`` or `...`
    const codeDouble = rest.match(/^``([^`]+)``/);
    if (codeDouble) {
      flush();
      tokens.push({ kind: "code", value: codeDouble[1] });
      i += codeDouble[0].length;
      continue;
    }
    const codeSingle = rest.match(/^`([^`\n]+)`/);
    if (codeSingle) {
      flush();
      tokens.push({ kind: "code", value: codeSingle[1] });
      i += codeSingle[0].length;
      continue;
    }

    // Image: swallow but keep the alt text — inline images aren't
    // representable as a style, so we drop them with a placeholder.
    const img = rest.match(/^!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/);
    if (img) {
      flush();
      // Treat the alt text as plain text so the page isn't blank.
      if (img[1]) tokens.push({ kind: "text", value: img[1] });
      i += img[0].length;
      continue;
    }

    // Link [label](url)
    const link = rest.match(/^\[([^\]]+)\]\(([^)\s]+)[^)]*\)/);
    if (link) {
      flush();
      tokens.push({ kind: "link", label: link[1], url: link[2] });
      i += link[0].length;
      continue;
    }

    // ~~strike~~
    const strike = rest.match(/^~~([^~\n]+)~~/);
    if (strike) {
      flush();
      tokens.push({ kind: "mark", style: "strike", value: strike[1] });
      i += strike[0].length;
      continue;
    }

    // **bold** or __bold__
    const bold = rest.match(/^(\*\*|__)([^\n]+?)\1/);
    if (bold) {
      flush();
      tokens.push({ kind: "mark", style: "bold", value: bold[2] });
      i += bold[0].length;
      continue;
    }

    // *italic* or _italic_ (avoid matching inside words).
    const italic = rest.match(/^(\*|_)([^\s*_][^*_\n]*?)\1/);
    if (italic) {
      flush();
      tokens.push({ kind: "mark", style: "italic", value: italic[2] });
      i += italic[0].length;
      continue;
    }

    buf += text[i];
    i++;
  }
  flush();

  for (const tok of tokens) {
    switch (tok.kind) {
      case "text":
        runs.push({ type: "text", text: tok.value, styles: {} });
        break;
      case "code":
        runs.push({ type: "text", text: tok.value, styles: { code: true } });
        break;
      case "link":
        // BlockNote represents links as a "link" content object with
        // child text runs. Callers push these through as-is because
        // inlineToMarkdown only reads runs with type === "text".
        (runs as unknown as Array<Record<string, unknown>>).push({
          type: "link",
          href: tok.url,
          content: [{ type: "text", text: tok.label, styles: {} }],
        });
        break;
      case "mark": {
        // Recurse so that "**_nested_**" becomes bold+italic.
        const inner = parseInline(tok.value);
        for (const run of inner) {
          if (run.type !== "text") {
            runs.push(run);
            continue;
          }
          runs.push({
            type: "text",
            text: run.text,
            styles: { ...(run.styles ?? {}), [tok.style]: true },
          });
        }
        break;
      }
    }
  }

  return runs;
}

// Back-compat: some callers might still import the old name.
function plainText(text: string): InlineRun[] {
  return parseInline(text);
}
void plainText;

// Markdown → BlockNote blocks: headings, lists (incl. tasks), quotes, fenced
// code, images, horizontal rules, and tables (kept as raw text for now).
export function markdownToBlocks(markdown: string): BNBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: BNBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    const fence = line.match(/^```([\w+-]+)?\s*$/);
    if (fence) {
      const lang = fence[1] ?? "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push({
        type: "codeBlock",
        props: { language: lang || "text" },
        content: buf.join("\n"),
      });
      continue;
    }

    // Heading 1..6
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      // BlockNote's heading block only supports levels 1-3 by default;
      // clamp to stay within that range while preserving hierarchy.
      const rawLevel = heading[1].length;
      const level = Math.min(Math.max(rawLevel, 1), 3);
      out.push({
        type: "heading",
        props: { level },
        content: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    // Horizontal rule: --- or *** or ___ on its own line
    if (/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push({ type: "divider", content: [] });
      i++;
      continue;
    }

    // GitHub-style table:
    //   | col a | col b |
    //   | ----- | ----- |
    //   | ...   | ...   |
    if (
      /^\s*\|.+\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|[\s:-|]+\|\s*$/.test(lines[i + 1])
    ) {
      const tableLines: string[] = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const header = splitRow(tableLines[0]);
      const bodyRows = tableLines.slice(2).map(splitRow);

      // Render a readable plain-text table as a paragraph so no
      // content is lost. Users can convert it to a BlockNote table
      // inside the editor. We use a tabular layout with padding
      // so it stays legible.
      const colWidths = header.map((h, c) =>
        Math.max(
          h.length,
          ...bodyRows.map((r) => (r[c] ?? "").length),
        ),
      );
      const pad = (cells: string[]) =>
        cells
          .map((cell, c) => cell.padEnd(colWidths[c] ?? 0))
          .join(" │ ");
      const sep = colWidths.map((w) => "─".repeat(w)).join("─┼─");
      const rendered = [
        pad(header),
        sep,
        ...bodyRows.map((r) => pad(r.concat(Array(header.length - r.length).fill("")))),
      ].join("\n");

      out.push({
        type: "codeBlock",
        props: { language: "text" },
        content: rendered,
      });
      continue;
    }

    // Task list item: - [ ] or - [x]
    const task = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+(.+)$/);
    if (task) {
      out.push({
        type: "checkListItem",
        props: { checked: task[2].toLowerCase() === "x" },
        content: parseInline(task[3]),
      });
      i++;
      continue;
    }

    // Bullet list item
    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bullet) {
      out.push({
        type: "bulletListItem",
        content: parseInline(bullet[2]),
      });
      i++;
      continue;
    }

    // Numbered list item
    const numbered = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (numbered) {
      out.push({
        type: "numberedListItem",
        content: parseInline(numbered[2]),
      });
      i++;
      continue;
    }

    // Block quote (consumes consecutive >-prefixed lines)
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const buf = [quote[1]];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push({ type: "quote", content: parseInline(buf.join(" ")) });
      continue;
    }

    // Block-level image: ![alt](url) on its own line
    const image = line.match(/^!\[(.*?)\]\((.+?)\)\s*$/);
    if (image) {
      out.push({
        type: "image",
        props: { url: image[2], caption: image[1] },
        content: [],
      });
      i++;
      continue;
    }

    // Blank line — skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (collapse consecutive non-blank lines that aren't
    // the start of another block construct).
    const paraBuf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^(\s*)[-*+]\s/.test(lines[i]) &&
      !/^(\s*)\d+\.\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !/^\s*\|.+\|\s*$/.test(lines[i])
    ) {
      paraBuf.push(lines[i]);
      i++;
    }
    out.push({
      type: "paragraph",
      content: parseInline(paraBuf.join(" ")),
    });
  }

  if (out.length === 0) {
    out.push({ type: "paragraph", content: [] });
  }
  return out;
}
