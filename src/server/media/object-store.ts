import "server-only";
import { del, get, list, put } from "@vercel/blob";

export type StoredObject = {
  pathname: string;
  url: string;
  contentType: string;
  body: Buffer;
};

export type MediaObjectStore = {
  readonly provider: "vercel_blob";
  put(pathname: string, body: Buffer, contentType: string): Promise<{ pathname: string; url: string }>;
  getByUrl(url: string): Promise<StoredObject | null>;
  deleteUrls(urls: readonly string[]): Promise<void>;
  /** Lists object pathnames under a prefix (for report-only orphan detection). */
  listPathnames(prefix: string): Promise<Array<{ pathname: string; url: string }>>;
};

/** In-memory store for tests and local runs without Blob credentials. */
export function createMemoryObjectStore(): MediaObjectStore {
  const files = new Map<string, { url: string; contentType: string; body: Buffer }>();
  let seq = 0;
  return {
    provider: "vercel_blob",
    async put(pathname, body, contentType) {
      seq += 1;
      const url = `memory://blob/${seq}/${encodeURIComponent(pathname)}`;
      files.set(url, { url, contentType, body: Buffer.from(body) });
      return { pathname, url };
    },
    async getByUrl(url) {
      const row = files.get(url);
      if (!row) return null;
      return { pathname: "", url: row.url, contentType: row.contentType, body: Buffer.from(row.body) };
    },
    async deleteUrls(urls) {
      for (const url of urls) files.delete(url);
    },
    async listPathnames(prefix) {
      const out: Array<{ pathname: string; url: string }> = [];
      for (const [url, row] of files) {
        const marker = "/";
        const encoded = url.slice(url.lastIndexOf(marker) + 1);
        let pathname = encoded;
        try {
          pathname = decodeURIComponent(encoded);
        } catch {
          /* keep encoded */
        }
        if (pathname.startsWith(prefix)) out.push({ pathname, url: row.url });
      }
      return out;
    },
  };
}

export function createVercelBlobStore(token: string): MediaObjectStore {
  return {
    provider: "vercel_blob",
    async put(pathname, body, contentType) {
      const result = await put(pathname, body, {
        access: "private",
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
      return { pathname: result.pathname, url: result.url };
    },
    async getByUrl(url) {
      const result = await get(url, { access: "private", token });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const chunks: Buffer[] = [];
      const reader = result.stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      return {
        pathname: result.blob.pathname,
        url: result.blob.url,
        contentType: result.blob.contentType,
        body: Buffer.concat(chunks),
      };
    },
    async deleteUrls(urls) {
      if (urls.length === 0) return;
      await del([...urls], { token });
    },
    async listPathnames(prefix) {
      const out: Array<{ pathname: string; url: string }> = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, token, cursor, limit: 1000 });
        for (const blob of page.blobs) {
          out.push({ pathname: blob.pathname, url: blob.url });
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out;
    },
  };
}

const globalStore = globalThis as typeof globalThis & {
  __tidynestMediaObjectStore?: MediaObjectStore | null;
};

/**
 * Active object store. Vitest uses an in-memory fake by default. Production uses Vercel Blob when
 * `BLOB_READ_WRITE_TOKEN` is set; otherwise null (new uploads fall back to legacy bytea).
 */
export function getMediaObjectStore(): MediaObjectStore | null {
  if (globalStore.__tidynestMediaObjectStore !== undefined) {
    return globalStore.__tidynestMediaObjectStore;
  }
  if (process.env.VITEST) {
    globalStore.__tidynestMediaObjectStore = createMemoryObjectStore();
    return globalStore.__tidynestMediaObjectStore;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;
  return createVercelBlobStore(token);
}

/** Test helper: force a store (or null). Pass `undefined` to clear the override. */
export function setMediaObjectStoreForTests(store: MediaObjectStore | null | undefined): void {
  if (store === undefined) delete globalStore.__tidynestMediaObjectStore;
  else globalStore.__tidynestMediaObjectStore = store;
}

export function blobConfigured(): boolean {
  if (process.env.VITEST && globalStore.__tidynestMediaObjectStore !== null) return true;
  return (
    Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()) ||
    (globalStore.__tidynestMediaObjectStore !== undefined && globalStore.__tidynestMediaObjectStore !== null)
  );
}
