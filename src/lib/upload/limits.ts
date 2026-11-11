/**
 * Upload limits for the pilot: web-sized JPEGs only.
 * These MUST match public.upload_limits() in the database migration.
 * tests/db/permissions.test.ts checks that they do.
 */
export const UPLOAD_LIMITS = {
  maxFileBytes: 4 * 1024 * 1024,
  maxFilesPerBatch: 100,
  maxLongEdgePx: 3000,
  minLongEdgePx: 600,
  contentType: "image/jpeg",
} as const;

export interface FileDescriptor {
  name: string;
  size: number;
  type: string;
}

export interface FileCheck<T extends FileDescriptor> {
  accepted: T[];
  rejected: { file: T; reason: string }[];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Natural sort ("IMG_2.jpg" before "IMG_10.jpg") so sequence follows the camera. */
export function sortByFilename<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true, sensitivity: "base" }));
}

/** Quick checks in the browser before anything is uploaded. The server re-checks everything. */
export function checkFiles<T extends FileDescriptor>(files: T[]): FileCheck<T> {
  const accepted: T[] = [];
  const rejected: { file: T; reason: string }[] = [];
  for (const file of sortByFilename(files)) {
    if (!/\.jpe?g$/i.test(file.name) || file.type !== UPLOAD_LIMITS.contentType) {
      rejected.push({ file, reason: "Not a JPEG. Export as .jpg first." });
    } else if (file.size === 0) {
      rejected.push({ file, reason: "The file is empty." });
    } else if (file.size > UPLOAD_LIMITS.maxFileBytes) {
      rejected.push({
        file,
        reason: `Too large (${formatBytes(file.size)}). Export web-sized JPEGs under ${formatBytes(UPLOAD_LIMITS.maxFileBytes)}.`,
      });
    } else if (accepted.length >= UPLOAD_LIMITS.maxFilesPerBatch) {
      rejected.push({ file, reason: `Only ${UPLOAD_LIMITS.maxFilesPerBatch} photos per upload. Add the rest in another upload.` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}
