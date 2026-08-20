import Icon from "@/components/Icon";
import { PageHead, Card, CardHead, Field, BrandPicker } from "@/components/ui";
import ThemePresetPicker from "@/components/ThemePresetPicker";
import { BUSINESS_PROFILE, ACTIVE_TENANT } from "@/lib/mock";

export default function BusinessProfilePage() {
  const b = BUSINESS_PROFILE;
  return (
    <>
      <PageHead
        title="Business Profile"
        desc="Logo, nama brand, kontak, dan identitas invoice. Tidak mengubah plan/entitlement."
        actions={<button className="btn btn-primary btn-sm"><Icon name="save" size={14} /> Simpan Perubahan</button>}
      />

      <div className="grid grid-3" style={{ alignItems: "start" }}>
        <div className="stack g5" style={{ gridColumn: "span 2" }}>
          <Card>
            <CardHead title="Identitas Bisnis" sub="Ditampilkan di seluruh outlet & invoice" />
            <div className="card-body grid grid-2">
              <Field label="Nama Brand"><input className="input" defaultValue={b.brandName} /></Field>
              <Field label="Nama Legal (PT/CV)"><input className="input" defaultValue={b.legalName} /></Field>
              <Field label="NPWP"><input className="input" defaultValue={b.npwp} /></Field>
              <Field label="Website"><input className="input" defaultValue={b.website} /></Field>
              <Field label="Instagram"><input className="input" defaultValue={b.instagram} /></Field>
              <Field label="Tagline"><input className="input" defaultValue={b.tagline} /></Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Kontak" sub="Digunakan untuk notifikasi & dukungan pelanggan" />
            <div className="card-body grid grid-2">
              <Field label="Email"><input className="input" defaultValue={b.email} /></Field>
              <Field label="Telepon Kantor"><input className="input" defaultValue={b.phone} /></Field>
              <Field label="WhatsApp Business"><input className="input" defaultValue={b.whatsapp} /></Field>
              <Field label="Alamat Kantor Pusat">
                <textarea className="textarea" defaultValue={b.address} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Footer Invoice / Struk" sub="Teks tambahan pada bagian bawah struk" />
            <div className="card-body">
              <Field label="Pesan Footer">
                <textarea className="textarea" defaultValue={b.invoiceFooter} />
              </Field>
            </div>
          </Card>
        </div>

        <div className="stack g5">
          <Card className="card-pad">
            <h3 style={{ marginBottom: 12 }}>Brand, Logo &amp; Background</h3>
            <ThemePresetPicker />
            <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />
            <BrandPicker
              selected={ACTIVE_TENANT.logoTone}
              logoInitial={b.brandName[0]}
              background={ACTIVE_TENANT.bgTone}
            />
          </Card>

          <Card className="card-pad">
            <div className="row g2" style={{ marginBottom: 10 }}>
              <Icon name="info" size={15} style={{ color: "var(--info)" }} />
              <h4>Kenapa identitas visual penting?</h4>
            </div>
            <p className="small muted" style={{ lineHeight: 1.7 }}>
              Setiap spa punya identitas visual sendiri. Warna, logo, dan background yang dipilih di sini
              otomatis diterapkan ke sidebar, tombol utama, badge status, dan grafik laporan di semua portal —
              Owner, Manager, Kasir, hingga aplikasi Terapis dan Customer PWA.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
