const FILLER = new Set(["and", "the", "for", "of", "in", "a", "an", "to", "with", "your"]);

/**
 * Words that appear in titles across the site and say nothing about a topic ("Kitchen Drawers"
 * is about drawers; "… Ideas for Small Indian Kitchens" ends almost every kitchen title;
 * "Spice Storage" and "Grain Storage" are different topics).
 */
const GENERIC = new Set([
  "idea",
  "tip",
  "guide",
  "way",
  "smart",
  "simple",
  "small",
  "compact",
  "indian",
  "india",
  "home",
  "house",
  "flat",
  "apartment",
  "kitchen",
  "bathroom",
  "bedroom",
  "room",
  "renter",
  "storage",
  "organisation",
  "organization",
  "organising",
  "organizing",
  "organiser",
  "organizer",
  "space",
  "saving",
  "area",
  "zone",
  "use",
  "everyday",
]);

/** Lower-cased words with "&" read as "and", filler words dropped and simple plurals made singular. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replaceAll("&", " and ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER.has(word))
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word,
    );
}

/**
 * Whether an article title is about a topic. Callers only compare articles and topics within one
 * subcategory, so one distinctive word of the topic in the title is enough: "Plates & Cutlery
 * Ideas" belongs under both "Plates, Bowls and Servingware" and "Kitchen Drawers and Cutlery".
 * A topic made only of generic words ("Living Room") must match all of them.
 */
export function titleMatchesTopic(topicName: string, title: string): boolean {
  const all = words(topicName);
  if (all.length === 0) return false;
  const distinctive = all.filter((word) => !GENERIC.has(word));
  const inTitle = new Set(words(title));
  if (distinctive.length) return distinctive.some((word) => inTitle.has(word));
  return all.every((word) => inTitle.has(word));
}
