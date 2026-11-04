/** Pages on this site that the editor's Link button can point to. Paths are site-relative. */
export type LinkTargets = {
  categories: { name: string; path: string }[];
  subcategories: {
    categoryName: string;
    name: string;
    path: string;
    topics: { name: string; path: string }[];
  }[];
  /** Published articles only, so a link never points at a page readers cannot open. */
  articles: { id: string; title: string; path: string; categoryName: string | null }[];
};

export const NO_LINK_TARGETS: LinkTargets = { categories: [], subcategories: [], articles: [] };
