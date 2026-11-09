import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getConfig, providerMode } from "./config";
import { createFakeStorage } from "./storage.fake";

/** Object storage for gallery, product and pet photos. */
export interface Storage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The stored bytes, or null when the file is gone. */
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** Public address for public images (gallery, products). Pet photos are never public. */
  publicUrl(key: string): string;
}

function createS3Storage(): Storage {
  const config = getConfig();
  const endpoint = config.STORAGE_ENDPOINT!;
  const bucket = config.STORAGE_BUCKET!;
  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.STORAGE_ACCESS_KEY!,
      secretAccessKey: config.STORAGE_SECRET_KEY!,
    },
  });

  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return object.Body ? await object.Body.transformToByteArray() : null;
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    publicUrl(key) {
      // Supabase serves public objects at /object/public/<bucket>/<key> beside the S3 endpoint.
      const base = endpoint.replace(/\/s3\/?$/, "");
      return `${base}/object/public/${bucket}/${encodeURI(key)}`;
    },
  };
}

/** Storage not set up yet: uploads are refused, so admin hides them; there are no files to show. */
function createOffStorage(): Storage {
  const off = async () => {
    throw new Error("Storage is not set up (STORAGE_* keys missing)");
  };
  return { put: off, get: off, delete: off, publicUrl: () => "" };
}

let storage: Storage | undefined;

export function getStorage(): Storage {
  if (!storage) {
    const mode = providerMode("storage");
    storage = mode === "real" ? createS3Storage() : mode === "fake" ? createFakeStorage() : createOffStorage();
  }
  return storage;
}
