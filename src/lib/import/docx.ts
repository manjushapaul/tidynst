import { inflateRawSync } from "node:zlib";

export class DocxReadError extends Error {
  override name = "DocxReadError";
}

/** Word documents larger than this once unpacked are refused, so a crafted file cannot exhaust memory. */
const DOCUMENT_XML_MAX_BYTES = 30 * 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** One file from a zip archive (a .docx is a zip), or null when the archive does not contain it. */
function zipEntry(archive: Buffer, name: string): Buffer | null {
  let eocd = -1;
  for (let i = archive.length - 22; i >= Math.max(0, archive.length - 22 - 0xffff); i--) {
    if (archive.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocxReadError("This is not a Word (.docx) document.");

  const entries = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE)
      throw new DocxReadError("The document is damaged.");
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const entryName = archive.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (entryName === name) {
      if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE)
        throw new DocxReadError("The document is damaged.");
      const start =
        localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
      const data = archive.subarray(start, start + compressedSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data, { maxOutputLength: DOCUMENT_XML_MAX_BYTES });
      throw new DocxReadError("The document uses a format that cannot be read.");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const RUN_TOKEN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:br|cr)(?:\s[^>]*)?\/>|<w:tab(?:\s[^>]*)?\/>/g;

/** The text of each paragraph in WordprocessingML, with line breaks inside a paragraph kept as "\n". */
export function documentParagraphs(xml: string): string[] {
  const body = /<w:body[\s>][\s\S]*<\/w:body>/.exec(xml)?.[0] ?? xml;
  const paragraphs: string[] = [];
  for (const [paragraph] of body.matchAll(/<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    // Tab stops in paragraph properties are layout, not text.
    const content = paragraph.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/g, "");
    let text = "";
    for (const token of content.matchAll(RUN_TOKEN)) {
      if (token[1] !== undefined) text += decodeXml(token[1]);
      else text += token[0].startsWith("<w:tab") ? "\t" : "\n";
    }
    paragraphs.push(text);
  }
  return paragraphs;
}

/** Paragraph texts of a .docx file. Pictures and formatting are ignored. */
export function docxParagraphs(bytes: Uint8Array): string[] {
  let xml: Buffer | null;
  try {
    xml = zipEntry(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), "word/document.xml");
  } catch (error) {
    if (error instanceof DocxReadError) throw error;
    throw new DocxReadError("The document could not be read. Save it again as a Word (.docx) file.");
  }
  if (!xml) throw new DocxReadError("This is not a Word (.docx) document.");
  return documentParagraphs(xml.toString("utf8"));
}
