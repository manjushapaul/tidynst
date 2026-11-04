import { describe, expect, it } from "vitest";
import { titleMatchesTopic } from "@/lib/content/topic-match";

describe("matching article titles to topics", () => {
  it("matches titles that contain every word of the topic", () => {
    const pairs: [string, string][] = [
      ["Multi-Use Furniture", "Multi-Use Furniture for Small Indian Apartments: 5 Smart Space-Saving Ideas"],
      ["Unused Corners", "Smart Ways to Use Unused Corners in Small Indian Apartments"],
      ["Room Layouts", "5 Smart Living Room Layout Ideas for Small Indian Apartments"],
      ["TV & Cable Storage", "TV and Cable Storage Ideas for Small Indian Living Rooms"],
      ["Work & Study Corners", "Work and Study Corner Ideas for Small Indian Apartments"],
      ["Shoe Racks", "Shoe Rack Ideas for Small Indian Apartments"],
    ];
    for (const [topic, title] of pairs)
      expect(titleMatchesTopic(topic, title), `${topic} → ${title}`).toBe(true);
  });

  it("matches a title that shares one distinctive word of the topic", () => {
    expect(titleMatchesTopic("Pots, Pans and Lids", "Pots & Pans Ideas for Small Indian Kitchens")).toBe(
      true,
    );
    expect(
      titleMatchesTopic("Plates, Bowls and Servingware", "Plates & Cutlery Ideas for Small Indian Kitchens"),
    ).toBe(true);
    expect(
      titleMatchesTopic("Kitchen Drawers and Cutlery", "Plates & Cutlery Ideas for Small Indian Kitchens"),
    ).toBe(true);
    expect(
      titleMatchesTopic("Lunch Boxes and Water Bottles", "Appliances & Lunch Boxes Ideas for Small Indian Kitchens"),
    ).toBe(true);
    expect(titleMatchesTopic("Kitchen Drawers and Cutlery", "Cutlery Drawer Ideas for Small Kitchens")).toBe(
      true,
    );
  });

  it("ignores words every title shares", () => {
    expect(
      titleMatchesTopic("Spice & Dabba Storage", "Groceries & Grains Storage for Compact Kitchens"),
    ).toBe(false);
    expect(
      titleMatchesTopic("Pots, Pans and Lids", "Plates & Cutlery Ideas for Small Indian Kitchens"),
    ).toBe(false);
    expect(
      titleMatchesTopic("Multi-Use Furniture", "Smart Ways to Use Unused Corners in Small Indian Apartments"),
    ).toBe(false);
  });

  it("does not match titles about something else", () => {
    expect(
      titleMatchesTopic("Flexible Layouts", "Smart Ways to Use Unused Corners in Small Indian Apartments"),
    ).toBe(false);
    expect(titleMatchesTopic("Dining Areas", "Guest and Hobby Space Ideas for Small Indian Apartments")).toBe(
      false,
    );
    expect(titleMatchesTopic("&", "Anything at all")).toBe(false);
  });
});
