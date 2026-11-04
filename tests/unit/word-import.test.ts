import { describe, expect, it } from "vitest";
import { carryOverImages } from "@/lib/content/body-images";
import { parseArticleBatch } from "@/lib/import/article-batch";
import { DocxReadError, docxParagraphs, documentParagraphs } from "@/lib/import/docx";
import { documentXml, docxFile, templateArticle } from "../support/docx";

describe("reading Word documents", () => {
  it("returns each paragraph, keeping line breaks and decoding characters", () => {
    const paragraphs = ["Title & intro", "## Heading\nFirst line\nSecond “quoted” line", ""];
    expect(docxParagraphs(docxFile(documentXml(paragraphs)))).toEqual(paragraphs);
    expect(docxParagraphs(docxFile(documentXml(paragraphs), false))).toEqual(paragraphs);
  });

  it("ignores tab stops in paragraph settings but keeps tabs in the text", () => {
    const xml =
      '<w:body><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t></w:r></w:p><w:p/></w:body>';
    expect(documentParagraphs(xml)).toEqual(["a\tb", ""]);
  });

  it("refuses files that are not Word documents", () => {
    expect(() => docxParagraphs(new TextEncoder().encode("plain text, not a zip"))).toThrow(DocxReadError);
  });
});

describe("parsing the article template", () => {
  const paragraphs = [
    "TidyNest – Kitchen Articles (Batch 1)",
    ...templateArticle({
      title: "Spice & Dabba Storage Ideas",
      slug: "spice-dabba-storage",
      subcategory: "food-and-grocery-storage",
      topics: "[no-drill, budget]",
      body: "Intro paragraph.\n\n\n\n- one\n- two\n\n## Plan Around Cooking\nText.",
      faqs: [
        ["Where should the dabba go?", "Near the counter."],
        ["Clear or steel?", "Either works."],
      ],
    }),
    ...templateArticle({ title: "Second article", body: "Body two." }),
  ];

  it("reads every field and ignores the reference notes", () => {
    const { articles, problems } = parseArticleBatch(paragraphs);
    expect(problems).toEqual([]);
    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      number: 1,
      title: "Spice & Dabba Storage Ideas",
      slug: "spice-dabba-storage",
      category: "kitchen",
      subcategory: "food-and-grocery-storage",
      topics: ["no-drill", "budget"],
      products: [],
      submitForReview: false,
      body: "Intro paragraph.\n\n- one\n- two\n\n## Plan Around Cooking\nText.",
      closing: "## Final Thoughts\n\nKeep it simple.",
      faqs: [
        { question: "Where should the dabba go?", answer: "Near the counter." },
        { question: "Clear or steel?", answer: "Either works." },
      ],
      problems: [],
    });
    expect(articles[1]).toMatchObject({ number: 2, title: "Second article", slug: null, subcategory: null });
  });

  it("reports template mistakes instead of guessing", () => {
    expect(parseArticleBatch(["Just some text"]).problems[0]).toMatch(/No articles were found/);
    const { articles, problems } = parseArticleBatch([
      "=== ARTICLE START ===",
      "CMS FIELDS",
      "body:",
      "",
      "faqs:",
      "Q1: A question with no answer",
    ]);
    expect(problems[0]).toMatch(/no === ARTICLE END ===/);
    expect(articles[0]?.problems).toEqual([
      'The FAQ "A question with no answer" has no answer.',
      "The article has no title: line.",
      "The article has no body: section.",
    ]);
  });
});

describe("keeping images when an article is rewritten", () => {
  const image = "![Spice shelf](/media/3eff51d5-254e-4ac8-9c59-af505a1cd8e5/shelf.png)";
  const intro = "![Counter](/media/aa75ad34-22c3-4862-a3ae-978eadcb36e9/counter.webp)";
  const gone = '![Old](/media/11111111-2222-4333-8444-555555555555/old.png "Caption")';
  const previous = [
    "Intro.",
    "",
    intro,
    "",
    "## Plan Around Cooking",
    "",
    image,
    "",
    "Old text.",
    "",
    "## Removed Section",
    "",
    gone,
  ].join("\n");

  it("puts each image back under the same section heading", () => {
    const next = [
      "New intro.",
      "",
      "## Plan around cooking",
      "",
      "New text.",
      "",
      "## Another Section",
      "",
      "More.",
    ].join("\n");
    const result = carryOverImages(previous, next);
    expect(result).toMatchObject({ carried: 3, atEnd: 1 });
    expect(result.markdown).toBe(
      [
        "New intro.",
        "",
        intro,
        "",
        "## Plan around cooking",
        "",
        image,
        "",
        "New text.",
        "",
        "## Another Section",
        "",
        "More.",
        "",
        gone,
      ].join("\n"),
    );
  });

  it("leaves text unchanged when it already has the images or there were none", () => {
    expect(carryOverImages("No images here.", "New text.")).toEqual({
      markdown: "New text.",
      carried: 0,
      atEnd: 0,
    });
    const withImage = `## Plan Around Cooking\n\n${image}`;
    expect(carryOverImages(withImage, withImage).carried).toBe(0);
  });
});
