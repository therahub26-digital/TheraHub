"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { setTenantPosterSettings, setTenantPosterHeaderUrl } from "@/lib/actions/tenant";
import { renderRosterPoster, type RosterPosterData } from "@/components/RosterPosterButton";
import { POSTER_DEFAULT_ACCENT, POSTER_DEFAULT_TITLE } from "@/lib/posterTheme";
import type { TenantPosterSettings } from "@/lib/data/tenant";

// ---------------------------------------------------------------------
// Pengaturan poster "Our Squad Today" per spa (Business Profile, 0044).
// Gambar header diunggah langsung ke bucket `tenant-branding` (pola sama
// dengan logo), warna & judul disimpan lewat server action. Pratinjau
// digambar dengan renderer yang SAMA dengan tombol poster di Cek Jadwal
// Harian, memakai terapis contoh berinisial — apa yang dilihat admin di
// sini = apa yang akan dibagikan kasir.
// ---------------------------------------------------------------------

const SAMPLE = ["Ayu Lestari", "Dewi Anggraini", "Sari Kusumawati", "Nining Rahayu", "Wulan Permatasari", "Ratna Sukmawati", "Intan Puspita", "Maya Andriani", "Lina Marlina", "Dian Novita", "Rini Hartati", "Yuni Astuti"];
const HEX = /^#[0-9A-Fa-f]{6}$/;

type Props = {
  tenantId: string;
  brandName: string;
  whatsapp: string | null;
  instagram: string | null;
  settings: TenantPosterSettings;
  defaultBg: string;
};

function ColorField({ id, label, value, placeholder, onChange }: { id: string; label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  const shown = HEX.test(value) ? value : placeholder;
  return (
    <label className="field" htmlFor={id}>
      <span className="tiny bold">{label}</span>
      <div className="row g2">
        <input
          type="color"
          aria-label={`Pilih ${label.toLowerCase()}`}
          value={shown}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          style={{ width: 44, height: 38, padding: 2, border: "1px solid var(--border)", borderRadius: 8, background: "transparent", cursor: "pointer" }}
        />
        <input id={id} className="input" value={value} placeholder={`${placeholder} (default)`} maxLength={7} onChange={(e) => onChange(e.target.value.trim())} />
      </div>
    </label>
  );
}

export default function PosterSettingsCard({ tenantId, brandName, whatsapp, instagram, settings, defaultBg }: Props) {
  const [bg, setBg] = useState(settings.bgColor ?? "");
  const [accent, setAccent] = useState(settings.accentColor ?? "");
  const [title, setTitle] = useState(settings.title ?? "");
  const [headerUrl, setHeaderUrl] = useState(settings.headerUrl);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  const effBg = HEX.test(bg) ? bg : defaultBg;
  const effAccent = HEX.test(accent) ? accent : POSTER_DEFAULT_ACCENT;

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function makePreview(nextHeader = headerUrl) {
    setRendering(true);
    try {
      const data: RosterPosterData = {
        date: "2026-01-01",
        dateLabel: "Contoh tanggal",
        brandName,
        outletName: "Outlet",
        headerUrl: nextHeader,
        bgColor: effBg,
        accentColor: effAccent,
        title: title.trim() || POSTER_DEFAULT_TITLE,
        whatsapp,
        instagram,
        onDuty: SAMPLE.map((name, i) => ({ id: String(i), name, photoUrl: null, skill: null })),
        off: [{ name: "Rosa Melinda", type: "OFF" }],
      };
      const blob = await renderRosterPoster(data);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setPreview(urlRef.current);
    } catch {
      setMsg({ ok: false, text: "Pratinjau gagal dibuat." });
    } finally {
      setRendering(false);
    }
  }

  function save() {
    if (bg && !HEX.test(bg)) return setMsg({ ok: false, text: "Warna latar harus format #RRGGBB, mis. #3B1736." });
    if (accent && !HEX.test(accent)) return setMsg({ ok: false, text: "Warna aksen harus format #RRGGBB, mis. #D4B26A." });
    setMsg(null);
    startTransition(async () => {
      const r = await setTenantPosterSettings({ bgColor: bg, accentColor: accent, title });
      setMsg(r.ok ? { ok: true, text: "Pengaturan poster tersimpan." } : { ok: false, text: r.error });
      if (r.ok) makePreview();
    });
  }

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg({ ok: false, text: "File harus berupa gambar (PNG/JPG/WebP)." });
    if (file.size > 2 * 1024 * 1024) return setMsg({ ok: false, text: "Ukuran gambar maksimal 2MB." });
    setMsg(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const path = `${tenantId}/poster-header-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("tenant-branding").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("tenant-branding").getPublicUrl(path);
      const r = await setTenantPosterHeaderUrl(pub.publicUrl);
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else {
        setHeaderUrl(pub.publicUrl);
        setMsg({ ok: true, text: "Gambar header terpasang." });
        makePreview(pub.publicUrl);
      }
    } catch {
      setMsg({ ok: false, text: "Gagal mengunggah gambar — coba lagi." });
    } finally {
      setUploading(false);
    }
  }

  async function removeHeader() {
    const r = await setTenantPosterHeaderUrl(null);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setHeaderUrl(null);
    setMsg({ ok: true, text: "Gambar header dihapus — poster memakai judul teks." });
    makePreview(null);
  }

  return (
    <Card className="card-pad">
      <h3 style={{ marginBottom: 4 }}>Poster Our Squad Today</h3>
      <p className="tiny dim" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        Poster terapis bertugas yang dibuat kasir/manager dari Cek Jadwal Harian untuk status WhatsApp. Atur tampilannya sesuai brand spa Anda.
      </p>

      <div className="stack g3">
        <div className="field">
          <span className="tiny bold">Gambar header</span>
          {headerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headerUrl} alt="Gambar header poster" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", display: "block" }} />
          ) : (
            <div className="tiny dim" style={{ padding: "10px 12px", borderRadius: 8, border: "1px dashed var(--border-3)" }}>
              Belum ada — poster memakai judul teks “{brandName.toUpperCase()}”.
            </div>
          )}
          <div className="row g2" style={{ marginTop: 6 }}>
            <button className="btn btn-ghost btn-sm" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <Icon name="upload" size={13} /> {uploading ? "Mengunggah…" : headerUrl ? "Ganti gambar" : "Unggah gambar"}
            </button>
            {headerUrl && (
              <button className="btn btn-quiet btn-sm" type="button" onClick={removeHeader}>Hapus</button>
            )}
          </div>
          <span className="tiny dim">Disarankan lebar 1080 px, tinggi 150–460 px (mis. 1080×300). PNG/JPG/WebP, maks 2MB.</span>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={onChoose} />
        </div>

        <ColorField id="poster-bg" label="Warna latar (pita atas & bawah)" value={bg} placeholder={defaultBg.toUpperCase()} onChange={setBg} />
        <ColorField id="poster-accent" label="Warna aksen (judul, nomor, garis)" value={accent} placeholder={POSTER_DEFAULT_ACCENT} onChange={setAccent} />

        <label className="field" htmlFor="poster-title">
          <span className="tiny bold">Teks judul</span>
          <input id="poster-title" className="input" value={title} maxLength={40} placeholder={POSTER_DEFAULT_TITLE} onChange={(e) => setTitle(e.target.value)} />
        </label>

        {msg && <div className="tiny" style={{ color: msg.ok ? "var(--success)" : "var(--danger)" }}>{msg.text}</div>}

        <div className="row g2">
          <button className="btn btn-primary btn-sm" type="button" disabled={isPending} onClick={save}>
            <Icon name="save" size={13} /> {isPending ? "Menyimpan…" : "Simpan poster"}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" disabled={rendering} onClick={() => makePreview()}>
            <Icon name="eye" size={13} /> {rendering ? "Membuat…" : "Lihat contoh"}
          </button>
        </div>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Contoh poster dengan pengaturan ini" style={{ width: "100%", maxWidth: 300, aspectRatio: "9 / 16", margin: "4px auto 0", display: "block", borderRadius: 10, border: "1px solid var(--border)" }} />
        )}
      </div>
    </Card>
  );
}
