"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { setTenantLogoUrl, setTenantBackgroundPhotoUrl } from "@/lib/actions/tenant";

// ---------------------------------------------------------------------
// Logo + custom-background uploaders for /admin/profile (Business
// Profile > "Brand, Logo & Background"). Same client-upload-then-
// server-action pattern as ProfilePhotoUploader (components/
// StaffEditor.tsx) — upload straight to Supabase Storage from the
// browser, then persist the resulting public URL via a server action.
// Storage bucket + its RLS policies: supabase/migrations/
// 0025_tenant_business_profile.sql ("tenant-branding", public,
// 2MB limit, folder-per-tenant convention `${tenantId}/...`).
// ---------------------------------------------------------------------

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiny" style={{ color: "var(--danger)", marginTop: 6 }}>
      <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {error}
    </div>
  );
}

export function TenantLogoUploader({ tenantId }: { tenantId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("File harus berupa gambar (PNG/SVG)."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Ukuran file maksimal 2MB."); return; }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const path = `${tenantId}/logo-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("tenant-branding").upload(path, file, { upsert: true });
      if (uploadErr) { setError("Gagal mengunggah — coba lagi."); setUploading(false); return; }
      const { data: pub } = supabase.storage.from("tenant-branding").getPublicUrl(path);
      const r = await setTenantLogoUrl(pub.publicUrl);
      setUploading(false);
      if (!r.ok) setError(r.error);
    } catch {
      setUploading(false);
      setError("Gagal mengunggah — coba lagi.");
    }
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
        <Icon name="upload" size={13} /> {uploading ? "Mengunggah…" : "Unggah Logo"}
      </button>
      <input ref={inputRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" style={{ display: "none" }} onChange={onChoose} />
      <ErrorNote error={error} />
    </div>
  );
}

export function TenantBackgroundUploader({ tenantId }: { tenantId: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("File harus berupa gambar."); return; }
    if (file.size > 400 * 1024) { setError("Ukuran file maksimal 400KB."); return; }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${tenantId}/background-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("tenant-branding").upload(path, file, { upsert: true });
      if (uploadErr) { setError("Gagal mengunggah — coba lagi."); setUploading(false); return; }
      const { data: pub } = supabase.storage.from("tenant-branding").getPublicUrl(path);
      const r = await setTenantBackgroundPhotoUrl(pub.publicUrl);
      setUploading(false);
      if (!r.ok) setError(r.error);
    } catch {
      setUploading(false);
      setError("Gagal mengunggah — coba lagi.");
    }
  }

  return (
    <div>
      <button
        className="stack g2"
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        style={{
          width: "100%",
          aspectRatio: "1920 / 1080",
          maxHeight: 120,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--r-md)",
          border: "1.5px dashed var(--border-3)",
          background: "transparent",
          color: "var(--text-3)",
          cursor: "pointer",
        }}
      >
        <span className="stat-icon" style={{ width: 32, height: 32, borderRadius: 10 }}>
          <Icon name="camera" size={15} />
        </span>
        <span className="tiny bold" style={{ color: "var(--text-2)" }}>
          {uploading ? "Mengunggah…" : "Unggah foto latar sendiri"}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/webp,image/png" style={{ display: "none" }} onChange={onChoose} />
      <ErrorNote error={error} />
    </div>
  );
}
