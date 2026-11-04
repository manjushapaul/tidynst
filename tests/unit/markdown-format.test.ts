import { describe, expect, it } from "vitest";
import {
  continueList,
  formatLines,
  insertLink,
  insertLinkTo,
  wrapSelection,
} from "@/lib/content/markdown-format";

const selected = (edit: { value: string; selectionStart: number; selectionEnd: number }) =>
  edit.value.slice(edit.selectionStart, edit.selectionEnd);

describe("inline formatting", () => {
  it("wraps the selection, or inserts a selected placeholder when nothing is selected", () => {
    const bold = wrapSelection("Keep jars low.", 5, 9, "**", "bold text");
    expect(bold.value).toBe("Keep **jars** low.");
    expect(selected(bold)).toBe("jars");

    const empty = wrapSelection("Keep ", 5, 5, "_", "italic text");
    expect(empty.value).toBe("Keep _italic text_");
    expect(selected(empty)).toBe("italic text");
  });

  it("removes the markers when the selection is already wrapped", () => {
    const undone = wrapSelection("Keep **jars** low.", 7, 11, "**", "bold text");
    expect(undone.value).toBe("Keep jars low.");
    expect(selected(undone)).toBe("jars");
  });

  it("inserts a link and selects the address", () => {
    const edit = insertLink("See shelves here.", 4, 11);
    expect(edit.value).toBe("See [shelves](https://) here.");
    expect(selected(edit)).toBe("https://");
  });
});

describe("block formatting", () => {
  const text = "Intro.\n\nOil\nSalt\n\nAfter.";
  const start = text.indexOf("Oil");
  const end = text.indexOf("Salt") + "Salt".length;

  it("turns every selected line into a bulleted or numbered list item", () => {
    expect(formatLines(text, start, end, "bullet").value).toBe("Intro.\n\n- Oil\n- Salt\n\nAfter.");
    expect(formatLines(text, start, end, "number").value).toBe("Intro.\n\n1. Oil\n2. Salt\n\nAfter.");
  });

  it("switches between list types and removes the format when applied twice", () => {
    const bullets = formatLines(text, start, end, "bullet").value;
    const from = bullets.indexOf("- Oil");
    const to = bullets.indexOf("- Salt") + "- Salt".length;
    expect(formatLines(bullets, from, to, "number").value).toBe("Intro.\n\n1. Oil\n2. Salt\n\nAfter.");
    expect(formatLines(bullets, from, to, "bullet").value).toBe(text);
  });

  it("makes headings and tips from the current line, even with the cursor mid-line", () => {
    const cursor = text.indexOf("Oil") + 1;
    expect(formatLines(text, cursor, cursor, "h2").value).toBe("Intro.\n\n## Oil\nSalt\n\nAfter.");
    expect(formatLines("## Oil", 4, 4, "h3").value).toBe("### Oil");
    expect(formatLines("Wipe spills daily.", 0, 0, "tip").value).toBe("> **Tip:** Wipe spills daily.");
    expect(formatLines("> **Tip:** Wipe spills daily.", 3, 3, "tip").value).toBe("Wipe spills daily.");
  });

  it("starts a new list item on an empty line", () => {
    const edit = formatLines("Intro.\n\n", 8, 8, "bullet");
    expect(edit.value).toBe("Intro.\n\n- ");
    expect(edit.selectionStart).toBe(edit.value.length);
  });
});

describe("continuing lists with Enter", () => {
  it("adds the next bullet or number", () => {
    const bullet = continueList("- Oil", 5);
    expect(bullet?.value).toBe("- Oil\n- ");
    expect(bullet?.selectionStart).toBe(8);
    expect(continueList("1. Oil\n2. Salt", 14)?.value).toBe("1. Oil\n2. Salt\n3. ");
  });

  it("ends the list on an empty item and leaves other lines alone", () => {
    expect(continueList("- Oil\n- ", 8)?.value).toBe("- Oil\n");
    expect(continueList("Plain paragraph", 15)).toBeNull();
  });
});

describe("links chosen from the link picker", () => {
  const text = "See our shelf guide for more.";

  it("links the selected words, keeping them as the link text", () => {
    const edit = insertLinkTo(
      text,
      8,
      19,
      "/categories/kitchen/food-and-grocery-storage",
      "",
      "Food Storage",
    );
    expect(edit.value).toBe("See our [shelf guide](/categories/kitchen/food-and-grocery-storage) for more.");
    expect(edit.selectionStart).toBe(edit.selectionEnd);
    expect(edit.value.slice(0, edit.selectionStart).endsWith(")")).toBe(true);
  });

  it("uses typed text first, and the page name when nothing is selected", () => {
    expect(insertLinkTo(text, 8, 19, "/x", "  pantry tips ", "Food Storage").value).toBe(
      "See our [pantry tips](/x) for more.",
    );
    expect(insertLinkTo("Read ", 5, 5, "/categories/kitchen", "", "Kitchen").value).toBe(
      "Read [Kitchen](/categories/kitchen)",
    );
  });

  it("keeps square brackets in the text from breaking the link", () => {
    expect(insertLinkTo("", 0, 0, "/x", "Spice [and] dabba", "").value).toBe("[Spice (and) dabba](/x)");
  });
});
