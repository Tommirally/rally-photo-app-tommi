/**
 * Object storage (Cloudflare R2, S3-compatible). Takes its config as an
 * argument so it can be tested against a local emulator; the app wires it
 * to real secrets in src/lib/server/r2.ts, which is server-only.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readJpegInfo } from "../upload/jpeg";
import { UPLOAD_LIMITS } from "../upload/limits";

export interface StorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface Storage {
  bucket: string;
  client: S3Client;
}

export function createStorage(config: StorageConfig): Storage {
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }),
  };
}

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/**
 * URL the browser PUTs the file to. The exact byte length and the JPEG
 * content type are part of the signature, so R2 refuses anything else.
 */
export function presignUpload(storage: Storage, key: string, bytes: number): Promise<string> {
  return getSignedUrl(
    storage.client,
    new PutObjectCommand({ Bucket: storage.bucket, Key: key, ContentType: UPLOAD_LIMITS.contentType, ContentLength: bytes }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

/**
 * Read URL for a private object. Signed at the start of the current hour and
 * valid for two hours, so the same image keeps the same URL for an hour and
 * browsers can cache it.
 */
export function presignView(storage: Storage, key: string, now = new Date()): Promise<string> {
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  return getSignedUrl(storage.client, new GetObjectCommand({ Bucket: storage.bucket, Key: key }), {
    expiresIn: 2 * 60 * 60,
    signingDate: hour,
  });
}

export type VerifyResult =
  | { status: "missing" }
  | { status: "rejected"; reason: string }
  | {
      status: "ok";
      byteSize: number;
      width: number;
      height: number;
      exifDateTimeOriginal: string | null;
      exifOffsetTimeOriginal: string | null;
    };

function isNotFound(err: unknown): boolean {
  return (
    err instanceof S3ServiceException &&
    (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404)
  );
}

async function readRange(storage: Storage, key: string, range?: string): Promise<Uint8Array> {
  const res = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: key, Range: range }));
  return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
}

/**
 * Inspect an uploaded object and decide whether to accept it. Rejected objects
 * are deleted so nothing invalid stays in the bucket.
 */
export async function verifyUpload(storage: Storage, key: string, declaredBytes: number): Promise<VerifyResult> {
  let size: number;
  try {
    const head = await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }));
    size = head.ContentLength ?? 0;
  } catch (err) {
    if (isNotFound(err)) return { status: "missing" };
    throw err;
  }

  const reject = async (reason: string): Promise<VerifyResult> => {
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
    return { status: "rejected", reason };
  };

  if (size > UPLOAD_LIMITS.maxFileBytes) return reject("File is larger than the upload limit.");
  if (size !== declaredBytes) return reject("Uploaded file size does not match the selected file.");

  let parsed = readJpegInfo(await readRange(storage, key, "bytes=0-262143"));
  if (!parsed.ok && parsed.reason === "needMoreBytes" && size > 262144) {
    parsed = readJpegInfo(await readRange(storage, key));
  }
  if (!parsed.ok) return reject("The file is not a valid JPEG image.");

  const { width, height } = parsed.info;
  const longEdge = Math.max(width, height);
  if (longEdge > UPLOAD_LIMITS.maxLongEdgePx) {
    return reject(`Image is ${width}×${height}px. Export web-sized, at most ${UPLOAD_LIMITS.maxLongEdgePx}px on the long edge.`);
  }
  if (longEdge < UPLOAD_LIMITS.minLongEdgePx) {
    return reject(`Image is only ${width}×${height}px. The long edge must be at least ${UPLOAD_LIMITS.minLongEdgePx}px.`);
  }

  return {
    status: "ok",
    byteSize: size,
    width,
    height,
    exifDateTimeOriginal: parsed.info.exifDateTimeOriginal,
    exifOffsetTimeOriginal: parsed.info.exifOffsetTimeOriginal,
  };
}
