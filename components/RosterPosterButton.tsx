"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageDown, Share2, X, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------
// "Your Relax Squad" — poster harian terapis bertugas untuk status WA.
// Permintaan Adjie 2026-10-08: dari halaman cek jadwal harian, kasir/
// manager menekan satu tombol, dapat PNG 1080×1920 berisi header brand,
// grid foto + nama terapis yang bertugas, dan daftar nama yang off —
// lalu langsung dibagikan ke status WhatsApp.
//
// Keputusan "siapa yang bertugas" (Adjie, Opsi B): SEMUA terapis aktif
// di outlet ini dikurangi yang punya pengecualian OFF/LEAVE hari ini.
// Bukan berdasarkan check-in, karena poster dibuat pagi di awal
// operasional sebelum semua terapis datang.
//
// Kenapa digambar di <canvas> browser, bukan next/og di server:
// foto terapis diunggah dengan accept="image/*" sehingga bisa WebP/HEIC-
// yang-sudah-dikonversi-browser, dan Satori (mesin next/og) tidak bisa
// membaca WebP. Browser bisa membaca format apa pun yang ia tampilkan.
// Foto dari Supabase Storage publik dikirim dengan header CORS `*`,
// jadi `crossOrigin = "anonymous"` cukup supaya canvas tidak "tainted".
// Foto yang gagal dimuat jatuh ke kotak inisial — poster tetap jadi.
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
  dateLabel: string; // "Kamis, 8 Oktober 2026"
  brandName: string;
  outletName: string;
  logoUrl: string | null;
  heroPhotoUrl: string | null;
  accent: string;
  accent2: string;
  base: string;
  whatsapp: string | null;
  instagram: string | null;
  onDuty: PosterTherapist[];
  off: PosterOff[];
};

const W = 1080;
const H = 1920;
const PAD = 64;
const TEXT = "#F6F1EA";
const MUTED = "rgba(246, 241, 234, 0.70)";
const CHIP = "rgba(255, 255, 255, 0.09)";
const LINE = "rgba(255, 255, 255, 0.14)";

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

function hexToRgba(hex: string, a: number): string {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Warna teks (gelap/putih) yang terbaca di atas warna aksen. */
function onAccent(hex: string): string {
  const m = hex.replace("#", "");
  const n = parseInt(m, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#14110d" : "#ffffff";
}

type Chip = { label: string; w: number };

export type PosterColumns = 3 | 4;

export async function renderRosterPoster(data: RosterPosterData): Promise<Blob> {
  const display = cssFont("--font-outfit", "system-ui, sans-serif");
  const body = cssFont("--font-inter", "system-ui, sans-serif");
  if (document.fonts) {
    await Promise.all([
      document.fonts.load(`800 96px ${display}`),
      document.fonts.load(`700 30px ${display}`),
      document.fonts.load(`600 24px ${body}`),
    ]).catch(() => undefined);
  }

  const [logo, hero, ...photos] = await Promise.all([
    loadImage(data.logoUrl),
    loadImage(data.heroPhotoUrl),
    ...data.onDuty.map((t) => loadImage(t.photoUrl)),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // ---- latar dasar
  ctx.fillStyle = data.base;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, H, 0, W, H, 900);
  glow.addColorStop(0, hexToRgba(data.accent, 0.14));
  glow.addColorStop(1, hexToRgba(data.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ---- HERO
  const HERO_H = 420;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, HERO_H);
  ctx.clip();
  if (hero) {
    drawCover(ctx, hero, 0, 0, W, HERO_H, 0.5);
    const scrim = ctx.createLinearGradient(0, 0, 0, HERO_H);
    scrim.addColorStop(0, "rgba(0,0,0,0.45)");
    scrim.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, HERO_H);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 0, W, HERO_H);
    ctx.fillStyle = hexToRgba(data.accent, 0.2);
    ctx.beginPath();
    ctx.arc(W - 120, -40, 300, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexToRgba(data.accent2, 0.24);
    ctx.beginPath();
    ctx.arc(W - 330, HERO_H + 30, 130, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // baris atas: logo + brand/outlet + chip tanggal
  const topY = 44;
  const LOGO = 76;
  if (logo) {
    ctx.save();
    roundRect(ctx, PAD, topY, LOGO, LOGO, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.clip();
    const s = Math.min((LOGO - 12) / logo.naturalWidth, (LOGO - 12) / logo.naturalHeight);
    const lw = logo.naturalWidth * s, lh = logo.naturalHeight * s;
    ctx.drawImage(logo, PAD + (LOGO - lw) / 2, topY + (LOGO - lh) / 2, lw, lh);
    ctx.restore();
  } else {
    roundRect(ctx, PAD, topY, LOGO, LOGO, 20);
    ctx.fillStyle = data.accent;
    ctx.fill();
    ctx.fillStyle = onAccent(data.accent);
    ctx.font = `800 40px ${display}`;
    ctx.textAlign = "center";
    ctx.fillText(data.brandName.slice(0, 1).toUpperCase(), PAD + LOGO / 2, topY + LOGO / 2 + 14);
    ctx.textAlign = "left";
  }

  ctx.font = `700 22px ${body}`;
  const dateChip = data.dateLabel;
  const chipW = ctx.measureText(dateChip).width + 48;
  roundRect(ctx, W - PAD - chipW, topY + 12, chipW, 52, 26);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fill();
  ctx.fillStyle = TEXT;
  ctx.fillText(dateChip, W - PAD - chipW + 24, topY + 46);

  const textX = PAD + LOGO + 20;
  const textMax = W - PAD - chipW - 24 - textX;
  ctx.fillStyle = TEXT;
  ctx.font = `700 30px ${display}`;
  ctx.fillText(fitText(ctx, data.brandName, textMax), textX, topY + 34);
  ctx.fillStyle = MUTED;
  ctx.font = `600 21px ${body}`;
  ctx.fillText(fitText(ctx, data.outletName, textMax), textX, topY + 66);

  // headline
  ctx.fillStyle = TEXT;
  ctx.font = `800 96px ${display}`;
  ctx.fillText("Your Relax", PAD - 4, 236);
  ctx.fillText("Squad", PAD - 4, 328);
  const squadW = ctx.measureText("Squad ").width;
  ctx.fillStyle = data.accent;
  ctx.fillText("✦", PAD - 4 + squadW, 328);

  ctx.fillStyle = MUTED;
  ctx.font = `600 28px ${body}`;
  ctx.fillText("Siap bikin harimu rileks. Pilih favoritmu, langsung booking.", PAD, 386);

  // ---- FOOTER (dihitung dulu, supaya grid tahu sisa tinggi)
  ctx.font = `600 25px ${body}`;
  const chips: Chip[] = data.off.map((o) => {
    const label = o.type === "LEAVE" ? `${o.name} · cuti` : o.name;
    return { label, w: ctx.measureText(label).width + 44 };
  });
  const CHIP_H = 54, CHIP_GAP = 12;
  const chipRows: Chip[][] = [];
  let cur: Chip[] = [];
  let curW = 0;
  for (const c of chips) {
    if (cur.length && curW + CHIP_GAP + c.w > W - PAD * 2) {
      chipRows.push(cur);
      cur = [];
      curW = 0;
    }
    curW += (cur.length ? CHIP_GAP : 0) + c.w;
    cur.push(c);
  }
  if (cur.length) chipRows.push(cur);
  const visibleRows = chipRows.slice(0, 3);
  const offBlockH = chips.length ? visibleRows.length * CHIP_H + (visibleRows.length - 1) * CHIP_GAP : 40;
  const hasContact = !!(data.whatsapp || data.instagram);
  const footerH = 40 + 22 + offBlockH + (hasContact ? 64 : 0) + 56;
  const footerTop = H - footerH;

  ctx.fillStyle = MUTED;
  ctx.font = `700 26px ${display}`;
  ctx.fillText("Lagi off hari ini", PAD, footerTop + 30);
  const lblW = ctx.measureText("Lagi off hari ini").width;
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD + lblW + 18, footerTop + 20, W - PAD * 2 - lblW - 18, 2);

  let cy = footerTop + 62;
  if (!chips.length) {
    ctx.fillStyle = TEXT;
    ctx.font = `600 26px ${body}`;
    ctx.fillText("Semua terapis masuk hari ini — full squad!", PAD, cy + 30);
  } else {
    ctx.font = `600 25px ${body}`;
    visibleRows.forEach((row, ri) => {
      let cx = PAD;
      const isLast = ri === visibleRows.length - 1 && chipRows.length > visibleRows.length;
      row.forEach((c, ci) => {
        let label = c.label;
        let w = c.w;
        if (isLast && ci === row.length - 1) {
          const rest = chips.length - visibleRows.flat().length;
          label = `+${rest + 1} lainnya`;
          w = ctx.measureText(label).width + 44;
        }
        roundRect(ctx, cx, cy, w, CHIP_H, CHIP_H / 2);
        ctx.fillStyle = CHIP;
        ctx.fill();
        ctx.fillStyle = TEXT;
        ctx.fillText(label, cx + 22, cy + 36);
        cx += w + CHIP_GAP;
      });
      cy += CHIP_H + CHIP_GAP;
    });
  }

  if (hasContact) {
    ctx.fillStyle = MUTED;
    ctx.font = `600 23px ${body}`;
    const baseY = H - 56;
    if (data.whatsapp) ctx.fillText(`Booking via WA: ${data.whatsapp}`, PAD, baseY);
    if (data.instagram) {
      ctx.textAlign = "right";
      ctx.fillText(data.instagram.startsWith("@") ? data.instagram : `@${data.instagram}`, W - PAD, baseY);
      ctx.textAlign = "left";
    }
  }

  // ---- GRID terapis bertugas
  const n = data.onDuty.length;
  const gridTop = HERO_H + 36;
  const gridBottom = footerTop - 24;
  if (n === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `600 32px ${body}`;
    ctx.textAlign = "center";
    ctx.fillText("Belum ada terapis bertugas hari ini.", W / 2, (gridTop + gridBottom) / 2);
    ctx.textAlign = "left";
  } else {
    // Auto-fit (Adjie 2026-10-08): format 3 atau 4 kolom, kotak foto 4:5,
    // dipilih otomatis mana yang menghasilkan FOTO TERBESAR untuk jumlah
    // terapis hari itu. Lebar kotak dibatasi lebar ATAU tinggi area (mana
    // yang lebih sempit) supaya semua tetap muat satu poster. Hasilnya:
    // 1–9 terapis → 3 kolom; 10 ke atas → 4 kolom (di 10–12 orang, 3 kolom
    // butuh 4 baris sehingga fotonya justru lebih kecil dari 4 kolom).
    const availW = W - PAD * 2;
    const availH = gridBottom - gridTop;
    const layoutFor = (c: PosterColumns) => {
      const rows = Math.ceil(n / c);
      const gap = c === 4 ? 18 : 24;
      const nameH = c === 4 ? 32 : 40;
      const byWidth = (availW - gap * (c - 1)) / c;
      const byHeight = ((availH - rows * (nameH + 10) - gap * (rows - 1)) / rows) * (4 / 5);
      return { cols: c, rows, gap, nameH, tw: Math.floor(Math.min(byWidth, byHeight)) };
    };
    const three = layoutFor(3);
    const four = layoutFor(4);
    const { cols, rows, gap, nameH, tw } = four.tw > three.tw ? four : three;
    const th = Math.floor((tw * 5) / 4);
    const cellH = th + 10 + nameH;
    const gridW = cols * tw + (cols - 1) * gap;
    const gridH = rows * cellH + (rows - 1) * gap;
    const x0 = (W - gridW) / 2;
    const y0 = gridTop + Math.max(0, (availH - gridH) / 2);
    const tileTones = [0.22, 0.3, 0.16, 0.26];

    data.onDuty.forEach((t, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      // baris terakhir yang tidak penuh ditengahkan
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const rowOffset = ((cols - inRow) * (tw + gap)) / 2;
      const x = x0 + rowOffset + c * (tw + gap);
      const y = y0 + r * (cellH + gap);

      ctx.save();
      roundRect(ctx, x, y, tw, th, Math.round(tw * 0.09));
      ctx.clip();
      const photo = photos[i];
      if (photo) {
        drawCover(ctx, photo, x, y, tw, th, 0.2);
      } else {
        ctx.fillStyle = hexToRgba(data.accent, tileTones[i % tileTones.length]);
        ctx.fillRect(x, y, tw, th);
        ctx.fillStyle = data.accent;
        ctx.font = `800 ${Math.round(tw * 0.32)}px ${display}`;
        ctx.textAlign = "center";
        ctx.fillText(initials(t.name), x + tw / 2, y + th / 2 + tw * 0.11);
        ctx.textAlign = "left";
      }
      if (t.skill) {
        const fs = cols === 4 ? 15 : 18;
        ctx.font = `600 ${fs}px ${body}`;
        const label = fitText(ctx, t.skill, tw - 48);
        const bw = ctx.measureText(label).width + 26;
        const bh = fs + 16;
        roundRect(ctx, x + 10, y + th - bh - 10, bw, bh, bh / 2);
        ctx.fillStyle = "rgba(0,0,0,0.58)";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, x + 23, y + th - 10 - bh / 2 + fs * 0.36);
      }
      ctx.restore();

      ctx.fillStyle = TEXT;
      ctx.font = `700 ${cols === 4 ? 24 : 28}px ${display}`;
      ctx.textAlign = "center";
      ctx.fillText(fitText(ctx, t.name, tw), x + tw / 2, y + th + 10 + nameH * 0.72);
      ctx.textAlign = "left";
    });
  }

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

  const filename = `relax-squad-${data.date}.png`;

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
                <div className="strong">Poster Your Relax Squad</div>
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
              Daftar bertugas = semua terapis aktif outlet ini, kecuali yang Libur/Cuti hari ini. Ubah status off di halaman ini, lalu buat ulang posternya.
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
