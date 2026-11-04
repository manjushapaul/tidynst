# Creating article drafts from n8n

TidyNest has a small automation API so tools such as [n8n](https://n8n.io) can add articles to the
CMS. It only ever creates **unpublished drafts** (optionally submitted for review). A person still
adds images, reviews and publishes in the admin.

Images are not part of the API. Add the featured image and any article images in the editor
afterwards; the **SEO health** page lists articles that still need them.

## 1. One-time setup

1. **Create an automation user.** In the admin go to **Users** and create a user such as
   `automation@your-domain` with the **Author** role. Authors can create drafts and submit them
   for review, but cannot publish, so the API cannot publish either. Every draft and every
   change shows up in the **Audit Log** under this user.
2. **Create a secret key** of at least 32 characters:

   ```bash
   openssl rand -base64 48
   ```

3. **Add both settings** to `.env.local` (local) or the production environment, then restart the
   app:

   ```bash
   AUTOMATION_API_KEY=the-key-from-step-2
   AUTOMATION_USER_EMAIL=automation@your-domain
   ```

   While either is missing, the API answers `404` and is effectively switched off. Keep the key
   secret: anyone who has it can create drafts as the automation user. To revoke it, change or
   remove `AUTOMATION_API_KEY`, or disable the user.

## 2. The endpoints

Every request sends the key in the `Authorization` header:

```
Authorization: Bearer <AUTOMATION_API_KEY>
```

Each automation user may make 120 requests per hour.

### List the names you can use

`GET /api/automation/catalog` returns every category, its subcategories, the topics and the
products, by the address names (slugs) the create endpoint accepts.

### Create a draft

`POST /api/automation/guides` with a JSON body:

```json
{
  "title": "Pantry Shelf Ideas for Small Indian Kitchens",
  "slug": "pantry-shelf-ideas-small-indian-kitchens",
  "excerpt": "Practical shelf ideas that keep dals, spices and oil within reach in a compact kitchen.",
  "body": "## Use the wall above the counter\n\nMarkdown text…",
  "closing": "## Final thoughts\n\n…",
  "category": "kitchen",
  "subcategory": "food-and-grocery-storage",
  "topics": ["no-drill"],
  "products": [{ "slug": "wall-rack", "note": "Fits above most counters." }],
  "seoTitle": "Pantry Shelf Ideas for Small Kitchens",
  "seoDescription": "Simple pantry shelf ideas for compact Indian kitchens.",
  "faqs": [{ "question": "Do I need to drill?", "answer": "No, these ideas use adhesive hooks." }],
  "submitForReview": false
}
```

| Field                        | Required | Notes                                                                             |
| ---------------------------- | -------- | --------------------------------------------------------------------------------- |
| `title`                      | yes      | Same limits as the editor.                                                        |
| `body`                       | yes      | Markdown, as typed in the editor's Body box. Use `##` for sections.               |
| `slug`                       | no       | The article's address. Made from the title when left out.                         |
| `excerpt`                    | no       | The summary under the title. Needs 100–300 characters before it can be published. |
| `closing`                    | no       | The "Final thoughts" section, in Markdown.                                        |
| `category`                   | no       | `kitchen`, `bathroom`, `bedroom-wardrobe`, `small-apartments` or `renters`.       |
| `subcategory`                | no       | A subcategory slug from the catalog, within `category`.                           |
| `topics`                     | no       | Topic slugs from the catalog.                                                     |
| `products`                   | no       | Product slugs from the catalog, each with an optional `note`.                     |
| `seoTitle`, `seoDescription` | no       | Leave out to use the title and summary.                                           |
| `faqs`                       | no       | `question` and `answer` pairs.                                                    |
| `submitForReview`            | no       | `true` puts the draft straight into **Content review**.                           |

Any other field (for example an image) is rejected, so typos are caught rather than ignored.

### Responses

| Status | Meaning                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `201`  | Draft created. The body has `id`, `slug`, `status` (`draft` or `in_review`) and `editUrl`. A `warning` is included if the draft could not be submitted for review. |
| `400`  | The body is not JSON.                                                                                                                                              |
| `401`  | Missing or wrong key.                                                                                                                                              |
| `403`  | The automation user does not exist, is disabled, or may not create articles.                                                                                       |
| `404`  | The API is switched off (settings missing).                                                                                                                        |
| `409`  | An article already uses that address. Nothing was created; send a different `slug`.                                                                                |
| `413`  | The body is too large.                                                                                                                                             |
| `422`  | Something is invalid. `fieldErrors` says which field and why, including names that were not found.                                                                 |
| `429`  | Too many requests this hour.                                                                                                                                       |

## 3. Setting it up in n8n

1. Add a trigger, for example **Schedule Trigger**, **Google Sheets Trigger** or a manual
   **Execute Workflow** while testing.
2. Add a node that produces the article fields: a Google Sheets, Airtable or Notion row, or an AI
   step that writes Markdown.
3. Add an **HTTP Request** node:
   - **Method:** `POST`
   - **URL:** `https://your-domain/api/automation/guides` (locally: `http://localhost:3000/api/automation/guides`)
   - **Authentication:** _Generic Credential Type → Header Auth_, with **Name** `Authorization`
     and **Value** `Bearer <your key>`. Storing it as a credential keeps the key out of the
     workflow itself.
   - **Send Body:** on, **Body Content Type:** JSON, then map the fields above from the previous
     node with expressions such as `{{ $json.title }}`.
   - Under **Options → Response**, turn on **Never Error** if you want to handle `409` and `422`
     answers in the workflow instead of stopping it.
4. Run the workflow once and open the returned `editUrl` to check the draft in the admin.

If n8n runs in Docker on the same computer as a local dev server, use
`http://host.docker.internal:3000` instead of `localhost`.
