import type { Storage } from "./storage";

export interface FakeStorage extends Storage {
  readonly objects: Map<string, { body: Uint8Array; contentType: string }>;
}

/** In-memory storage for local work and tests. */
export function createFakeStorage(): FakeStorage {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    objects,
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async get(key) {
      return objects.get(key)?.body ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    publicUrl(key) {
      return `/fake-storage/${encodeURI(key)}`;
    },
  };
}
