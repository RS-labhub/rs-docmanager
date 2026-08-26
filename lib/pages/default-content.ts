// Default BlockNote content for new pages: a small template + ~75
// empty paragraphs so the editor opens with room to write.
export function buildDefaultPageContent(): unknown[] {
  const blocks: unknown[] = [];

  // Headline row so the page feels intentional rather than empty.
  blocks.push({
    type: "heading",
    props: { level: 2 },
    content: [{ type: "text", text: "Getting started", styles: {} }],
  });
  blocks.push({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Type ",
        styles: {},
      },
      {
        type: "text",
        text: "/",
        styles: { code: true },
      },
      {
        type: "text",
        text: " to open the command menu and insert headings, lists, quotes, images, and more.",
        styles: {},
      },
    ],
  });
  blocks.push({ type: "paragraph", content: [] });
  blocks.push({ type: "paragraph", content: [] });

  // Pre-allocate ~75 empty paragraph blocks so the canvas feels roomy.
  for (let i = 0; i < 75; i++) {
    blocks.push({ type: "paragraph", content: [] });
  }
  return blocks;
}

// Plain-text markdown cache corresponding to the default content.
export function defaultPageMarkdown(): string {
  return [
    "## Getting started",
    "",
    "Type `/` to open the command menu and insert headings, lists, quotes, images, and more.",
    "",
  ].join("\n");
}
