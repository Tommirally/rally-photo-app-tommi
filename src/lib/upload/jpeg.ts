/**
 * Minimal JPEG header reader: confirms the bytes are a JPEG, reads the pixel
 * dimensions and the EXIF capture time. Works on the first chunk of a file;
 * returns `needMoreBytes` if the frame header wasn't reached yet.
 */
export interface JpegInfo {
  width: number;
  height: number;
  /** EXIF DateTimeOriginal, "YYYY:MM:DD HH:MM:SS" (camera local time), if present. */
  exifDateTimeOriginal: string | null;
  /** EXIF OffsetTimeOriginal, e.g. "+01:00", if present. */
  exifOffsetTimeOriginal: string | null;
}

export type JpegResult =
  | { ok: true; info: JpegInfo }
  | { ok: false; reason: "not_jpeg" | "corrupt" | "needMoreBytes" };

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function readJpegInfo(buf: Uint8Array): JpegResult {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    return { ok: false, reason: "not_jpeg" };
  }
  let exifDate: string | null = null;
  let exifOffset: string | null = null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return { ok: false, reason: "corrupt" };
    // Skip fill bytes.
    while (i < buf.length && buf[i] === 0xff) i++;
    if (i >= buf.length) break;
    const marker = buf[i];
    i++;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return { ok: false, reason: "corrupt" }; // no frame header before scan/end
    if (i + 2 > buf.length) break;
    const len = (buf[i] << 8) | buf[i + 1];
    if (len < 2) return { ok: false, reason: "corrupt" };
    const start = i + 2;
    const end = i + len;
    if (SOF_MARKERS.has(marker)) {
      if (start + 5 > buf.length) break;
      const height = (buf[start + 1] << 8) | buf[start + 2];
      const width = (buf[start + 3] << 8) | buf[start + 4];
      if (width === 0 || height === 0) return { ok: false, reason: "corrupt" };
      return { ok: true, info: { width, height, exifDateTimeOriginal: exifDate, exifOffsetTimeOriginal: exifOffset } };
    }
    if (marker === 0xe1 && end <= buf.length && !exifDate) {
      const exif = readExifTimes(buf.subarray(start, end));
      exifDate = exif.dateTimeOriginal;
      exifOffset = exif.offsetTimeOriginal;
    }
    i = end;
  }
  return { ok: false, reason: "needMoreBytes" };
}

function readExifTimes(seg: Uint8Array): { dateTimeOriginal: string | null; offsetTimeOriginal: string | null } {
  const none = { dateTimeOriginal: null, offsetTimeOriginal: null };
  // "Exif\0\0" header
  if (seg.length < 14 || seg[0] !== 0x45 || seg[1] !== 0x78 || seg[2] !== 0x69 || seg[3] !== 0x66) return none;
  const t = seg.subarray(6);
  const little = t[0] === 0x49 && t[1] === 0x49;
  const big = t[0] === 0x4d && t[1] === 0x4d;
  if (!little && !big) return none;
  const u16 = (o: number) => (o + 2 > t.length ? -1 : little ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const u32 = (o: number) =>
    o + 4 > t.length
      ? -1
      : little
        ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0
        : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0;
  const ascii = (entry: number): string | null => {
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    if (type !== 2 || count < 1 || count > 64) return null;
    const off = count <= 4 ? entry + 8 : u32(entry + 8);
    if (off < 0 || off + count > t.length) return null;
    let s = "";
    for (let k = 0; k < count; k++) {
      const c = t[off + k];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim() || null;
  };
  const findTag = (ifd: number, tag: number): number => {
    const n = u16(ifd);
    if (n < 0 || n > 512) return -1;
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (e + 12 > t.length) return -1;
      if (u16(e) === tag) return e;
    }
    return -1;
  };
  const ifd0 = u32(4);
  if (ifd0 < 8 || ifd0 >= t.length) return none;
  const exifPtr = findTag(ifd0, 0x8769);
  if (exifPtr < 0) return none;
  const exifIfd = u32(exifPtr + 8);
  if (exifIfd < 8 || exifIfd >= t.length) return none;
  const dt = findTag(exifIfd, 0x9003);
  const off = findTag(exifIfd, 0x9011);
  return {
    dateTimeOriginal: dt >= 0 ? ascii(dt) : null,
    offsetTimeOriginal: off >= 0 ? ascii(off) : null,
  };
}
