import { deflateRawSync } from "node:zlib";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** WordprocessingML for paragraphs; "\n" inside a paragraph becomes a line break, as Word stores it. */
export function documentXml(paragraphs: readonly string[]): string {
  const body = paragraphs
    .map((paragraph) => {
      const runs = paragraph
        .split("\n")
        .map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
        .join("");
      return `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r>${runs}</w:r></w:p>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
}

/** A minimal .docx (a zip holding word/document.xml) built in memory. */
export function docxFile(xml: string, compress = true): Uint8Array {
  const name = Buffer.from("word/document.xml");
  const raw = Buffer.from(xml, "utf8");
  const data = compress ? deflateRawSync(raw) : raw;
  const method = compress ? 8 : 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return new Uint8Array(Buffer.concat([local, name, data, central, name, end]));
}

/** One article in the import template, as Word paragraphs. */
export function templateArticle(fields: {
  title: string;
  slug?: string;
  excerpt?: string;
  category?: string;
  subcategory?: string;
  topics?: string;
  body: string;
  closing?: string;
  faqs?: [string, string][];
}): string[] {
  return [
    "=== ARTICLE START ===",
    "REFERENCE ONLY (do not send to CMS)",
    "Main Category: Kitchen",
    "Focus Keyword: something",
    "CMS FIELDS",
    `title: ${fields.title}`,
    ...(fields.slug ? [`slug: ${fields.slug}`] : []),
    `excerpt: ${fields.excerpt ?? "A practical summary that is long enough to stand in for a meta description in search results here."}`,
    `category: ${fields.category ?? "kitchen"}`,
    ...(fields.subcategory ? [`subcategory: ${fields.subcategory}`] : []),
    `topics: ${fields.topics ?? "[]"}`,
    "products: []",
    "submitForReview: false",
    "body:",
    fields.body,
    "closing:",
    fields.closing ?? "## Final Thoughts\n\nKeep it simple.",
    "faqs:",
    ...(fields.faqs ?? [["Is this a test?", "Yes."]]).flatMap(([q, a], i) => [
      `Q${i + 1}: ${q}`,
      `A${i + 1}: ${a}`,
    ]),
    "=== ARTICLE END ===",
    "",
  ];
}
