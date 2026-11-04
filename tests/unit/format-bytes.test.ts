import { describe, expect, it } from "vitest";
import { formatBytes } from "@/lib/format";

describe("formatBytes", () => {
  it("formats common sizes for the storage dashboard", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(8051073)).toBe("7.7 MB");
    expect(formatBytes(18010927)).toBe("17.2 MB");
    expect(formatBytes(82556358656)).toBe("76.9 GB");
  });
});
