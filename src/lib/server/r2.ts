import "server-only";
import { createStorage, type Storage } from "@/lib/storage/s3";

let cached: Storage | null | undefined;

/** Cloudflare R2 bucket from server-side secrets. Null if not configured. */
export function getStorage(): Storage | null {
  if (cached !== undefined) return cached;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  cached =
    endpoint && accessKeyId && secretAccessKey && bucket
      ? createStorage({ endpoint, bucket, accessKeyId, secretAccessKey })
      : null;
  return cached;
}
