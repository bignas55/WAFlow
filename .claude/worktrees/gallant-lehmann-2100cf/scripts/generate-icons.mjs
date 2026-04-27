/**
 * WAFlow PWA Icon Generator
 * Generates PNG icons without any external dependencies.
 * Uses raw PNG binary format with Node.js built-in zlib.
 */

import zlib from "zlib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../client/public/icons");

// ── Minimal PNG encoder ───────────────────────────────────────────────────────

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function makePng(width, height, pixels) {
  // pixels: Uint8Array of RGBA values, row by row

  // Build raw image data with filter byte (0 = None) per row
  const rowSize = width * 4;
  const rawData = Buffer.alloc((rowSize + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (rowSize + 1)] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (rowSize + 1) + 1 + x * 4;
      rawData[dst]     = pixels[src];     // R
      rawData[dst + 1] = pixels[src + 1]; // G
      rawData[dst + 2] = pixels[src + 2]; // B
      rawData[dst + 3] = pixels[src + 3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 6 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Draw the WAFlow icon ──────────────────────────────────────────────────────
// A green rounded square with a white lightning bolt ⚡

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42; // rounded corner radius for the "squircle" bg

  // Background color: #25D366 (WhatsApp green)
  const BG_R = 0x25, BG_G = 0xD3, BG_B = 0x66;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded square: distance from nearest corner-center
      const dx = Math.max(0, Math.abs(x - cx) - radius * 0.6);
      const dy = Math.max(0, Math.abs(y - cy) - radius * 0.6);
      const cornerDist = Math.sqrt(dx * dx + dy * dy);
      const inSquircle = cornerDist < radius * 0.4 + 0.5;

      if (!inSquircle) {
        // Transparent outside
        pixels[idx] = pixels[idx+1] = pixels[idx+2] = pixels[idx+3] = 0;
        continue;
      }

      // Lightning bolt shape — simplified as a polygon check
      // Normalised coordinates (-1 to 1)
      const nx = (x - cx) / (size * 0.25);
      const ny = (y - cy) / (size * 0.35);

      const inBolt = isInBolt(nx, ny);

      if (inBolt) {
        pixels[idx]   = 255; // white
        pixels[idx+1] = 255;
        pixels[idx+2] = 255;
        pixels[idx+3] = 255;
      } else {
        pixels[idx]   = BG_R;
        pixels[idx+1] = BG_G;
        pixels[idx+2] = BG_B;
        pixels[idx+3] = 255;
      }
    }
  }
  return pixels;
}

function isInBolt(nx, ny) {
  // Lightning bolt polygon in normalised space (-1..1)
  // Top triangle: upper right area
  // Bottom triangle: lower left area
  // Basic zig-zag bolt shape
  const pts = [
    [ 0.15, -1.0],  // top right
    [-0.55,  0.0],  // middle left point
    [ 0.15,  0.0],  // middle right
    [-0.15,  1.0],  // bottom left
    [ 0.55,  0.0],  // middle right point
    [-0.15,  0.0],  // middle left
  ];
  return pointInPolygon(nx, ny, pts);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Generate all icon sizes ───────────────────────────────────────────────────

const SIZES = [192, 512, 180, 144, 96, 72, 48];

for (const size of SIZES) {
  const pixels = drawIcon(size);
  const png    = makePng(size, size, pixels);
  const name   = size === 180 ? "apple-touch-icon.png" : `icon-${size}x${size}.png`;
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`✅ Generated ${name} (${png.length} bytes)`);
}

console.log(`\n🎉 All icons written to ${OUT_DIR}`);
