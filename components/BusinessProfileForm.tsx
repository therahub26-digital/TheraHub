"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Field, BrandPicker } from "@/components/ui";
import ThemePresetPicker from "@/components/ThemePresetPicker";
import { TenantLogoUploader, TenantBackgroundUploader } from "@/components/TenantBrandingUploaders";
import { setTenantProfile, setTenantBrand, type TenantProfileInput } from "@/lib/actions/tenant";
import type { TenantProfile } from "@/lib/data/tenant";

// ---------------------------------------------------------------------
// Client half of /admin/profile (Business Profile). User (2026-08-25):
// "bussines profile: visual, brand, logo, belum fungsi" — every field
// here used to be a static defaultValue with a disabled Save button.
// Now: the Identitas/Kontak/Footer fields save via setTenantProfile on
// "Simpan Perubahan", and the brand color / background preset swatches
// in BrandPicker save instantly on click via setTenantBrand (same
// "pick it and it's applied" feel as the client-only ThemePresetPicker
// above it — except this one actually persists to the tenant row).
// ---------------------------------------------------------------------

function fieldsFromTenant(t: TenantProfile): TenantProfileInput {
  return {
    brandName: t.brandName,
    legalName: t.legalName ?? "",
    npwp: t.npwp ?? "",
    website: t.website ?? "",
    instagram: t.instagram ?? "",
    tagline: t.tagline ?? "",
    email: t.email ?? "",
    phone: t.phone ?? "",
    whatsapp: t.whatsapp ?? "",
    address: t.address ?? "",
    invoiceFooter: t.invoiceFooter ?? "",
  };
}

export default function BusinessProfileForm({ tenant }: { tenant: TenantProfile }) {
  const [fields, setFields] = useState<TenantProfileInput>(fieldsFromTenant(tenant));
  const [logoTone, setLogoTone] = useState(tenant.logoTone);
  const [bgTone, setBgTone] = useState(tenant.bgTone);
  const [isPending, startTransition] = useTransition();
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [brandMsg, setBrandMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof TenantProfileInput>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function save() {
    setSaveMsg(null);
    startTransition(async () => {
      const r = await setTenantProfile(fields);
      setSaveMsg(r.ok ? { ok: true, text: "Tersimpan." } : { ok: false, text: r.error });
    });
  }

  function selectBrand(key: string) {
    const prev = logoTone;
    setLogoTone(key);
    setBrandMsg(null);
    startTransition(async () => {
      const r = await setTenantBrand(key, bgTone);
      if (!r.ok) { setLogoTone(prev); setBrandMsg({ ok: false, text: r.error }); }
    });
  }

  function selectBackground(key: string) {
    const prev = bgTone;
    setBgTone(key);
    setBrandMsg(null);
    startTransition(async () => {
      const r = await setTenantBrand(logoTone, key);
      if (!r.ok) { setBgTone(prev); setBrandMsg({ ok: false, text: r.error }); }
    });
  }

  return (
    <>
      <PageHead
        title="Business Profile"
        desc="Logo, nama brand, kontak, dan identitas invoice. Tidak mengubah plan/entitlement."
        actions={
          <button className="btn btn-primary btn-sm" disabled={isPending} onClick={save}>
            <Icon name="save" size={14} /> {isPending ? "Menyimpan…" : "Simpan Perubahan"}
          </button>
        }
      />

      {saveMsg && (
        <div className={`small ${saveMsg.ok ? "" : ""}`} style={{ color: saveMsg.ok ? "var(--success)" : "var(--danger)", marginBottom: 12 }}>
          {saveMsg.text}
        </div>
      )}

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <div className="stack g5" style={{ gridColumn: "span 2" }}>
          <Card>
            <CardHead title="Identitas Bisnis" sub="Ditampilkan di seluruh outlet & invoice" />
            <div className="card-body grid grid-2">
              <Field label="Nama Brand"><input className="input" value={fields.brandName} onChange={(e) => set("brandName", e.target.value)} /></Field>
              <Field label="Nama Legal (PT/CV)"><input className="input" value={fields.legalName} onChange={(e) => set("legalName", e.target.value)} /></Field>
              <Field label="NPWP"><input className="input" value={fields.npwp} onChange={(e) => set("npwp", e.target.value)} /></Field>
              <Field label="Website"><input className="input" value={fields.website} onChange={(e) => set("website", e.target.value)} /></Field>
              <Field label="Instagram"><input className="input" value={fields.instagram} onChange={(e) => set("instagram", e.target.value)} /></Field>
              <Field label="Tagline"><input className="input" value={fields.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Kontak" sub="Digunakan untuk notifikasi & dukungan pelanggan" />
            <div className="card-body grid grid-2">
              <Field label="Email"><input className="input" value={fields.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="Telepon Kantor"><input className="input" value={fields.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="WhatsApp Business"><input className="input" value={fields.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></Field>
              <Field label="Alamat Kantor Pusat">
                <textarea className="textarea" value={fields.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Footer Invoice / Struk" sub="Teks tambahan pada bagian bawah struk" />
            <div className="card-body">
              <Field label="Pesan Footer">
                <textarea className="textarea" value={fields.invoiceFooter} onChange={(e) => set("invoiceFooter", e.target.value)} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="stack g5">
          <Card className="card-pad">
            <h3 style={{ marginBottom: 12 }}>Brand, Logo &amp; Background</h3>
            <ThemePresetPicker />
            <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />
            {brandMsg && !brandMsg.ok && (
              <div className="tiny" style={{ color: "var(--danger)", marginBottom: 8 }}>{brandMsg.text}</div>
            )}
            <BrandPicker
              selected={logoTone}
              logoInitial={fields.brandName[0] ?? "Z"}
              background={bgTone}
              logoUrl={tenant.logoUrl}
              backgroundPhotoUrl={tenant.backgroundPhotoUrl}
              onSelectBrand={selectBrand}
              onSelectBackground={selectBackground}
              logoUploadSlot={<TenantLogoUploader tenantId={tenant.id} />}
              backgroundUploadSlot={<TenantBackgroundUploader tenantId={tenant.id} />}
            />
          </Card>

          <Card className="card-pad">
            <div className="row g2" style={{ marginBottom: 10 }}>
              <Icon name="info" size={15} style={{ color: "var(--info)" }} />
              <h4>Kenapa identitas visual penting?</h4>
            </div>
            <p className="small muted" style={{ lineHeight: 1.7 }}>
              Setiap spa punya identitas visual sendiri. Warna, logo, dan background yang dipilih di sini
              disimpan sebagai identitas resmi tenant Anda. <strong>Catatan:</strong> saat ini baru halaman ini
              yang membaca nilai tersimpan secara langsung — penerapan otomatis ke sidebar/tombol di portal
              Owner, Manager, Kasir, Terapis, dan Customer PWA masih memakai preset bawaan dan menyusul di
              pembaruan berikutnya.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
