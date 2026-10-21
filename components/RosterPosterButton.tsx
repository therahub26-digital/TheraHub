"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageDown, Share2, X, Loader2 } from "lucide-react";
import { POSTER_DEFAULT_TITLE, mixHex } from "@/lib/posterTheme";

// ---------------------------------------------------------------------
// Poster "Our Squad Today" — terapis bertugas hari ini untuk status WA.
//
// Riwayat: 2026-10-08 versi pertama "Your Relax Squad" (hero foto + grid
// gelap). 2026-10-21 didesain ulang mengikuti katalog Royal Spa milik
// Adjie: pita atas berwarna brand (gambar header milik spa ATAU judul
// teks), area foto krem dengan foto berbingkai + label nomor·nama di
// pojok kiri bawah, pita bawah berisi kontak & daftar off. Gambar header,
// warna pita, warna aksen, dan teks judul diatur admin per spa di
// Business Profile (migrasi 0044). Kosong = default turunan warna brand.
//
// Keputusan "siapa yang bertugas" (Adjie, Opsi B): SEMUA terapis aktif
// di outlet ini dikurangi yang punya pengecualian OFF/LEAVE hari ini.
//
// Kenapa <canvas> browser, bukan next/og: foto terapis bisa WebP, dan
// Satori tidak bisa membacanya. Foto dari Supabase Storage publik dikirim
// dengan CORS `*`, jadi crossOrigin="anonymous" cukup. Foto/header yang
// gagal dimuat jatuh ke kotak inisial / judul teks — poster tetap jadi.
// ---------------------------------------------------------------------

export type PosterTherapist = {
  id: string;
  name: string;
  photoUrl: string | null;
  skill: string | null;
};

export type PosterOff = { name: string; type: "OFF" | "LEAVE" };

export type RosterPosterData = {
  date: string; // YYYY-MM-DD
  dateLabel: string; // "Rabu, 21 Oktober 2026"
  brandName: string;
  outletName: string;
  /** Gambar header milik spa (opsional). Kosong → judul teks. */
  headerUrl: string | null;
  /** Warna pita atas/bawah, #RRGGBB. */
  bgColor: string;
  /** Warna judul, nomor, garis ornamen, #RRGGBB. */
  accentColor: string;
  /** Teks judul kecil, mis. "OUR SQUAD TODAY". */
  title: string;
  whatsapp: string | null;
  instagram: string | null;
  onDuty: PosterTherapist[];
  off: PosterOff[];
};


const W = 1080;
const H = 1920;

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function cssFont(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Gambar `img` menutupi kotak (x,y,w,h) seperti object-fit: cover. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, focusY = 0.3) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) * focusY;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function rgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Teks dengan jarak huruf (ctx.letterSpacing kalau ada, manual kalau tidak). */
function spacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number): number {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = prev;
  return total;
}

/** Garis ornamen kiri-kanan dengan belah ketupat kecil di ujung dalam. */
function ornamentLines(ctx: CanvasRenderingContext2D, color: string, y: number, innerGap: number, outerPad: number) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  const cx = W / 2;
  for (const dir of [-1, 1]) {
    const x1 = cx + dir * innerGap;
    const x2 = dir < 0 ? outerPad : W - outerPad;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y - 6);
    ctx.lineTo(x1 + dir * 6, y);
    ctx.lineTo(x1, y + 6);
    ctx.lineTo(x1 - dir * 6, y);
    ctx.closePath();
    ctx.fill();
  }
}

export async function renderRosterPoster(data: RosterPosterData): Promise<Blob> {
  const sans = cssFont("--font-inter", "system-ui, sans-serif");
  const serif = `"Cormorant Garamond", "Playfair Display", Georgia, "Times New Roman", serif`;
  if (document.fonts) {
    await Promise.all([document.fonts.load(`700 30px ${sans}`), document.fonts.load(`600 24px ${sans}`)]).catch(() => undefined);
  }

  const frame = data.bgColor;
  const accent = data.accentColor;
  const darkFrame = luminance(frame) < 0.55;
  const onFrameMuted = darkFrame ? "rgba(246,238,228,0.72)" : "rgba(42,24,38,0.68)";
  const body = mixHex("#FBF6F0", accent, 0.1); // krem hangat bernuansa aksen
  const badge = mixHex(frame, "#000000", darkFrame ? 0.15 : 0.6);

  const [header, ...photos] = await Promise.all([loadImage(data.headerUrl), ...data.onDuty.map((t) => loadImage(t.photoUrl))]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // ---- latar penuh warna pita (atas & bawah), area foto ditimpa krem
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, W, H);

  // ---- HEADER
  let y = 0;
  if (header) {
    // Gambar header digambar selebar poster dengan rasio aslinya,
    // dibatasi 150–460 px supaya grid tetap kebagian ruang.
    const hh = Math.max(150, Math.min(460, Math.round((W * header.naturalHeight) / header.naturalWidth)));
    drawCover(ctx, header, 0, 0, W, hh, 0.5);
    y = hh;
  } else {
    // Judul teks: nama brand besar huruf kapital + garis ornamen.
    ctx.fillStyle = accent;
    ctx.textAlign = "center";
    let fs = 112;
    ctx.font = `600 ${fs}px ${serif}`;
    const brand = data.brandName.toUpperCase();
    while (fs > 56 && ctx.measureText(brand).width + brand.length * 6 > W - 260) {
      fs -= 4;
      ctx.font = `600 ${fs}px ${serif}`;
    }
    const tw = spacedText(ctx, brand, W / 2, 150, 6);
    ornamentLines(ctx, rgba(accent, 0.85), 112, tw / 2 + 34, 48);
    ctx.textAlign = "left";
    y = 196;
  }

  // ---- STRIP judul kecil + tanggal
  const stripH = 104;
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = `600 30px ${sans}`;
  const tTitle = spacedText(ctx, (data.title || POSTER_DEFAULT_TITLE).toUpperCase(), W / 2, y + 44, 9);
  ornamentLines(ctx, rgba(accent, 0.6), y + 34, tTitle / 2 + 26, 120);
  ctx.fillStyle = onFrameMuted;
  ctx.font = `500 24px ${sans}`;
  spacedText(ctx, `${data.dateLabel} · ${data.outletName}`.toUpperCase(), W / 2, y + 84, 2.5);
  ctx.textAlign = "left";
  y += stripH;

  // ---- FOOTER (dihitung dulu)
  const offNames = data.off.map((o) => (o.type === "LEAVE" ? `${o.name.split(" ")[0]} (cuti)` : o.name.split(" ")[0]));
  const hasContact = !!(data.whatsapp || data.instagram);
  const footerH = 118 + (offNames.length ? 38 : 0);
  const footerTop = H - footerH;

  // ---- BODY krem + grid
  const M = 14; // margin & jarak antar foto, seperti katalog contoh
  ctx.fillStyle = body;
  ctx.fillRect(0, y, W, footerTop - y);
  const n = data.onDuty.length;
  const gridTop = y + M;
  const gridBottom = footerTop - M;
  if (n === 0) {
    ctx.fillStyle = "rgba(42,24,38,0.6)";
    ctx.font = `600 32px ${sans}`;
    ctx.textAlign = "center";
    ctx.fillText("Belum ada terapis bertugas hari ini.", W / 2, (gridTop + gridBottom) / 2);
    ctx.textAlign = "left";
  } else {
    // Pilih jumlah kolom (2–5) yang menghasilkan foto dengan LUAS terbesar
    // untuk jumlah terapis hari itu. Kotak boleh memanjang dari 1:1 sampai
    // 1:1,4 supaya area krem terisi saat terapis sedikit (tidak ada pita
    // kosong di atas/bawah grid).
    const MAX_RATIO = 1.4;
    const availW = W - M * 2;
    const availH = gridBottom - gridTop;
    let best = { cols: 4, rows: Math.ceil(n / 4), tw: 0, th: 0 };
    for (const c of [2, 3, 4, 5]) {
      const rows = Math.ceil(n / c);
      const byW = (availW - M * (c - 1)) / c;
      const hMax = (availH - M * (rows - 1)) / rows;
      const tw = Math.floor(Math.min(byW, hMax));
      const th = Math.floor(Math.min(tw * MAX_RATIO, hMax));
      if (tw * th > best.tw * best.th) best = { cols: c, rows, tw, th };
    }
    const { cols, rows, tw, th } = best;
    const gridW = cols * tw + (cols - 1) * M;
    const gridH = rows * th + (rows - 1) * M;
    const x0 = (W - gridW) / 2;
    const y0 = gridTop + Math.max(0, (availH - gridH) / 2);
    const BORDER = Math.max(4, Math.round(tw * 0.022));

    data.onDuty.forEach((t, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const rowOffset = ((cols - inRow) * (tw + M)) / 2;
      const x = x0 + rowOffset + c * (tw + M);
      const yy = y0 + r * (th + M);

      // bingkai putih
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(x, yy, tw, th);
      ctx.shadowColor = "transparent";
      const ix = x + BORDER, iy = yy + BORDER, iw = tw - BORDER * 2, ih = th - BORDER * 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, iy, iw, ih);
      ctx.clip();
      const photo = photos[i];
      if (photo) {
        drawCover(ctx, photo, ix, iy, iw, ih, 0.22);
      } else {
        ctx.fillStyle = mixHex(body, accent, 0.25);
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = frame;
        ctx.font = `700 ${Math.round(iw * 0.3)}px ${serif}`;
        ctx.textAlign = "center";
        ctx.fillText(initials(t.name), ix + iw / 2, iy + ih / 2 + iw * 0.1);
        ctx.textAlign = "left";
      }

      // label nomor · nama di pojok kiri bawah
      const num = String(i + 1).padStart(2, "0");
      const numFs = Math.max(20, Math.round(tw * 0.1));
      const nameFs = Math.max(15, Math.round(tw * 0.068));
      ctx.font = `600 ${numFs}px ${serif}`;
      const numW = ctx.measureText(num).width;
      ctx.font = `600 ${nameFs}px ${sans}`;
      const first = t.name.split(" ")[0];
      const nameText = fitText(ctx, first, iw - numW - 46);
      const nameW = ctx.measureText(nameText).width;
      const bh = Math.round(numFs * 1.5);
      const bw = Math.min(iw - 8, Math.round(numW + nameW + 34));
      const bx = ix, by = iy + ih - bh;
      roundRect(ctx, bx, by, bw, bh + 8, 8);
      ctx.fillStyle = rgba(badge, 0.88);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.font = `600 ${numFs}px ${serif}`;
      ctx.fillText(num, bx + 12, by + bh * 0.72);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `600 ${nameFs}px ${sans}`;
      ctx.fillText(nameText, bx + 12 + numW + 10, by + bh * 0.7);
      ctx.restore();
    });
  }

  // ---- FOOTER
  ctx.fillStyle = frame;
  ctx.fillRect(0, footerTop, W, footerH);
  const contact = [data.whatsapp ? `BOOKING WA ${data.whatsapp}` : null, data.instagram ? (data.instagram.startsWith("@") ? data.instagram : `@${data.instagram}`).toUpperCase() : null]
    .filter(Boolean)
    .join("  •  ");
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = `600 24px ${sans}`;
  const footText = hasContact ? contact : data.brandName.toUpperCase();
  const fw = spacedText(ctx, footText, W / 2, footerTop + 66, 3.5);
  ornamentLines(ctx, rgba(accent, 0.55), footerTop + 57, fw / 2 + 28, 40);
  if (offNames.length) {
    ctx.fillStyle = onFrameMuted;
    ctx.font = `500 22px ${sans}`;
    ctx.fillText(fitText(ctx, `Off hari ini: ${offNames.join(", ")}`, W - 120), W / 2, footerTop + 108);
  }
  ctx.textAlign = "left";

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat gambar."))), "image/png")
  );
}

export default function RosterPosterButton({ data }: { data: RosterPosterData }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const filename = `our-squad-${data.date}.png`;

  const generate = useCallback(async () => {
    setOpen(true);
    setBusy(true);
    setError(null);
    try {
      const b = await renderRosterPoster(data);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(b);
      urlRef.current = url;
      setBlob(b);
      setPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat poster.");
    } finally {
      setBusy(false);
    }
  }, [data]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const download = useCallback(() => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [previewUrl, filename]);

  const share = useCallback(async () => {
    if (!blob) return;
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        // dibatalkan pengguna — bukan error
      }
    } else {
      download();
    }
  }, [blob, filename, download]);

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={generate}>
        <ImageDown size={16} /> Buat Poster Hari Ini
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Poster terapis hari ini"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 200, background: "rgba(3,7,12,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="stack g3"
            style={{
              width: "100%", maxWidth: 420, maxHeight: "94vh", overflowY: "auto",
              background: "var(--bg-surface-1)", borderRadius: "var(--r-lg)",
              border: "1px solid var(--border)", padding: 16,
            }}
          >
            <div className="row between">
              <div>
                <div className="strong">Poster {data.title || POSTER_DEFAULT_TITLE}</div>
                <div className="tiny dim">
                  {data.onDuty.length} bertugas · {data.off.length} off · {data.dateLabel}
                </div>
              </div>
              <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label="Tutup" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                aspectRatio: "9 / 16", width: "100%", maxHeight: "68vh", margin: "0 auto",
                borderRadius: 12, overflow: "hidden", background: "var(--bg-surface-2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {busy && (
                <div className="row g2 small dim">
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Menyiapkan poster…
                </div>
              )}
              {!busy && error && <div className="small" style={{ color: "var(--danger)", padding: 16 }}>{error}</div>}
              {!busy && !error && previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Pratinjau poster terapis hari ini" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              )}
            </div>

            <div className="tiny dim">
              Daftar bertugas = semua terapis aktif outlet ini, kecuali yang Libur/Cuti hari ini. Ubah status off di halaman ini, lalu buat ulang posternya. Gambar header &amp; warna poster diatur Admin di Business Profile.
            </div>

            <div className="row g2" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={download} disabled={busy || !previewUrl}>
                <ImageDown size={16} /> Unduh PNG
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={share} disabled={busy || !blob}>
                <Share2 size={16} /> Bagikan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
