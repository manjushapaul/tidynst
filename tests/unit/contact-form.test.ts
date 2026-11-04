import { describe, expect, it } from "vitest";
import { contactFieldErrors, contactFormSchema, contactSubject } from "@/lib/content/contact-schema";

const valid = {
  name: "Asha Menon",
  email: "asha@example.com",
  topic: "correction",
  message: "The spice guide still mentions a shop that has closed.",
};

describe("contact form", () => {
  it("accepts a complete message", () => {
    const parsed = contactFormSchema.parse(valid);
    expect(parsed.topic).toBe("correction");
    expect(contactSubject(parsed.topic, parsed.name)).toBe("TidyNest contact: Correction from Asha Menon");
  });

  it("rejects a message that is too short", () => {
    const result = contactFormSchema.safeParse({ ...valid, message: "Too short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(contactFieldErrors(result.error).message).toMatch(/little more/);
    }
  });

  it("keeps a name with a line break on one subject line", () => {
    expect(contactSubject("question", "Asha\nMenon")).toBe("TidyNest contact: Question from Asha Menon");
  });
});
