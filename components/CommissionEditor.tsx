"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updatePackagePricing, updateExtensionPricing, createAddon, updateAddon, createPackage, type ActionResult } from "@/lib/actions/catalog";
import { commissionAmount, formatCommissionRule, type CommissionType } from "@/lib/commission";
import { rp } from "@/lib/format";

// ---------------------------------------------------------------------
// The catalog setup control: price + commission (rupiah or percent) for
// one sellable item. Opens inline on the catalog page rather than in a
// separate settings screen, because the admin sets the two numbers
// together — the commission only means something next to the price it is
// taken from, and a percent rule is impossible to sanity-check without
// seeing the resulting rupiah.
//
// That is what the live preview line is for: typing "25" with Persen
// selected immediately shows "= Rp45.000 per treatment", so a mistyped
// rule is caught by the person entering it, before it becomes somebody's
// pay. All validation is repeated server-side (lib/actions/catalog.ts)
// and again in the database (migration 0004) — this is the friendly
// layer, not the enforcing one.
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

type EditorProps = {
  label: string;
  initialPrice: number;
  initialType: CommissionType;
  initialValue: number;
  onSave: (price: number, type: CommissionType, value: number) => Promise<ActionResult>;
};

function PricingEditor({ label, initialPrice, initialType, initialValue, onSave }: EditorProps) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(initialPrice));
  const [type, setType] = useState<CommissionType>(initialType);
  const [value, setValue] = useState(String(initialValue));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const priceNum = Number(price);
  const valueNum = Number(value);
  const previewValid = Number.isFinite(priceNum) && Number.isFinite(valueNum) && valueNum > 0;
  const preview = previewValid ? commissionAmount({ type, value: valueNum }, priceNum) : 0;

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); setSaved(false); }}>
        <Icon name="edit" size={12} /> Atur
      </button>
    );
  }

  return (
    <div
      className="stack g2"
      style={{
        padding: "12px 14px",
        borderRadius: "var(--r-md)",
        background: "var(--bg-deep)",
        border: "1px solid var(--border)",
        minWidth: 280,
      }}
    >
      <div className="tiny dim">{label}</div>

      <label className="stack g1">
        <span className="tiny dim">Harga (Rp)</span>
        <input
          className="input"
          type="number"
          min={0}
          value={price}
          disabled={isPending}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>

      <label className="stack g1">
        <span className="tiny dim">Komisi terapis</span>
        <div className="row g2">
          <select
            className="select"
            value={type}
            disabled={isPending}
            onChange={(e) => setType(e.target.value as CommissionType)}
            style={{ maxWidth: 110 }}
          >
            <option value="fixed">Rupiah</option>
            <option value="percent">Persen</option>
          </select>
          <input
            className="input"
            type="number"
            min={0}
            max={type === "percent" ? 100 : undefined}
            value={value}
            disabled={isPending}
            onChange={(e) => setValue(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
      </label>

      {previewValid ? (
        <div className="tiny" style={{ color: "var(--text-2)" }}>
          {formatCommissionRule({ type, value: valueNum })} → terapis dapat{" "}
          <span className="strong" style={{ color: "var(--text-1)" }}>{rp(preview)}</span> per treatment
        </div>
      ) : (
        <div className="tiny dim">Komisi belum diisi — terapis tidak akan dapat komisi dari item ini.</div>
      )}

      <ErrorNote error={error} />

      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await onSave(priceNum, type, valueNum);
              if (result.ok) {
                setSaved(true);
                setOpen(false);
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>

      {saved && <div className="tiny dim">Tersimpan.</div>}
    </div>
  );
}

export function PackagePricingEditor({
  packageId,
  name,
  listPrice,
  commissionType,
  commissionValue,
}: {
  packageId: string;
  name: string;
  listPrice: number;
  commissionType: CommissionType;
  commissionValue: number;
}) {
  return (
    <PricingEditor
      label={name}
      initialPrice={listPrice}
      initialType={commissionType}
      initialValue={commissionValue}
      onSave={(price, type, value) =>
        updatePackagePricing({ packageId, listPrice: price, commissionType: type, commissionValue: value })
      }
    />
  );
}

export function ExtensionPricingEditor({
  extensionId,
  name,
  price,
  commissionType,
  commission,
}: {
  extensionId: string;
  name: string;
  price: number;
  commissionType: CommissionType;
  commission: number;
}) {
  return (
    <PricingEditor
      label={name}
      initialPrice={price}
      initialType={commissionType}
      initialValue={commission}
      onSave={(newPrice, type, value) =>
        updateExtensionPricing({ extensionId, price: newPrice, commissionType: type, commission: value })
      }
    />
  );
}

// ---------------------------------------------------------------------
// Add-ons (hot stone, oil/nuru massage, dll) — added 2026-08-22. Unlike
// packages/extensions, add-ons had ZERO rows and no create path at all
// when the user asked for this, so this needs both an edit form (for
// rows that exist) AND a create form (for the first ones) — the plain
// PricingEditor above doesn't cover name/duration/active, so this is a
// separate small form rather than a variant of it.
// ---------------------------------------------------------------------

type AddonFormValues = {
  name: string;
  price: string;
  commissionType: CommissionType;
  commissionValue: string;
  durationMin: string;
  active: boolean;
};

function AddonFormFields({
  values,
  disabled,
  onChange,
}: {
  values: AddonFormValues;
  disabled: boolean;
  onChange: (patch: Partial<AddonFormValues>) => void;
}) {
  const priceNum = Number(values.price);
  const valueNum = Number(values.commissionValue);
  const previewValid = Number.isFinite(priceNum) && Number.isFinite(valueNum) && valueNum > 0;
  const preview = previewValid ? commissionAmount({ type: values.commissionType, value: valueNum }, priceNum) : 0;

  return (
    <>
      <label className="stack g1">
        <span className="tiny dim">Nama add-on</span>
        <input className="input" value={values.name} disabled={disabled} placeholder="mis. Hot Stone" onChange={(e) => onChange({ name: e.target.value })} />
      </label>

      <label className="stack g1">
        <span className="tiny dim">Harga (Rp)</span>
        <input className="input" type="number" min={0} value={values.price} disabled={disabled} onChange={(e) => onChange({ price: e.target.value })} />
      </label>

      <label className="stack g1">
        <span className="tiny dim">Komisi terapis</span>
        <div className="row g2">
          <select
            className="select"
            value={values.commissionType}
            disabled={disabled}
            onChange={(e) => onChange({ commissionType: e.target.value as CommissionType })}
            style={{ maxWidth: 110 }}
          >
            <option value="fixed">Rupiah</option>
            <option value="percent">Persen</option>
          </select>
          <input
            className="input"
            type="number"
            min={0}
            max={values.commissionType === "percent" ? 100 : undefined}
            value={values.commissionValue}
            disabled={disabled}
            onChange={(e) => onChange({ commissionValue: e.target.value })}
            style={{ flex: 1 }}
          />
        </div>
      </label>

      <label className="stack g1">
        <span className="tiny dim">Tambahan durasi (menit — 0 kalau tidak menambah waktu sesi)</span>
        <input className="input" type="number" min={0} value={values.durationMin} disabled={disabled} onChange={(e) => onChange({ durationMin: e.target.value })} />
      </label>

      {previewValid ? (
        <div className="tiny" style={{ color: "var(--text-2)" }}>
          {formatCommissionRule({ type: values.commissionType, value: valueNum })} → terapis dapat{" "}
          <span className="strong" style={{ color: "var(--text-1)" }}>{rp(preview)}</span> per treatment
        </div>
      ) : (
        <div className="tiny dim">Komisi belum diisi — terapis tidak akan dapat komisi dari item ini.</div>
      )}

      <label className="row g2" style={{ alignItems: "center" }}>
        <input type="checkbox" checked={values.active} disabled={disabled} onChange={(e) => onChange({ active: e.target.checked })} />
        <span className="small">Aktif — tampil sebagai pilihan add-on saat booking/checkout</span>
      </label>
    </>
  );
}

/** Inline "Atur" editor for one existing add-on row (price/komisi/durasi/aktif). */
export function AddonEditor({
  addonId,
  name,
  price,
  commissionType,
  commission,
  durationMin,
  active,
}: {
  addonId: string;
  name: string;
  price: number;
  commissionType: CommissionType;
  commission: number;
  durationMin: number;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const initial: AddonFormValues = {
    name, price: String(price), commissionType, commissionValue: String(commission), durationMin: String(durationMin), active,
  };
  const [values, setValues] = useState<AddonFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { setValues(initial); setError(null); setOpen(true); }}>
        <Icon name="edit" size={12} /> Atur
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", minWidth: 280 }}>
      <AddonFormFields values={values} disabled={isPending} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />

      <ErrorNote error={error} />

      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await updateAddon({
                addonId,
                name: values.name,
                price: Number(values.price),
                commissionType: values.commissionType,
                commissionValue: Number(values.commissionValue),
                durationMin: Number(values.durationMin),
                active: values.active,
              });
              if (r.ok) setOpen(false);
              else setError(r.error);
            });
          }}
        >
          <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// "Paket Baru" — added 2026-08-23, user feedback: "tambah paket baru
// belum bisa, tombolnya sebaiknya ada di kotak daftar paket". Same
// inline-open-form pattern as NewAddonForm below, but a package additionally
// needs a jenis layanan (service type) and a room type — see
// createPackage's header in lib/actions/catalog.ts for what's defaulted.
// ---------------------------------------------------------------------

type NewPackageValues = {
  name: string;
  serviceTypeId: string;
  durationMin: string;
  listPrice: string;
  memberPrice: string;
  weekendPrice: string;
  roomType: string;
  commissionType: CommissionType;
  commissionValue: string;
};

/** "Paket Baru" — inline create form, opened from the Daftar Paket card header. */
export function NewPackageForm({
  outletId,
  serviceTypes,
}: {
  outletId: string;
  serviceTypes: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const empty: NewPackageValues = {
    name: "",
    serviceTypeId: serviceTypes[0]?.id ?? "",
    durationMin: "60",
    listPrice: "0",
    memberPrice: "0",
    weekendPrice: "0",
    roomType: "Massage",
    commissionType: "fixed",
    commissionValue: "0",
  };
  const [values, setValues] = useState<NewPackageValues>(empty);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const priceNum = Number(values.listPrice);
  const valueNum = Number(values.commissionValue);
  const previewValid = Number.isFinite(priceNum) && Number.isFinite(valueNum) && valueNum > 0;
  const preview = previewValid ? commissionAmount({ type: values.commissionType, value: valueNum }, priceNum) : 0;

  function patch(p: Partial<NewPackageValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  if (!open) {
    return (
      <button
        className="btn btn-primary btn-sm"
        onClick={() => { setValues({ ...empty, serviceTypeId: serviceTypes[0]?.id ?? "" }); setError(null); setOpen(true); }}
      >
        <Icon name="plus" size={12} /> Paket Baru
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", marginBottom: 4, minWidth: 300 }}>
      <label className="stack g1">
        <span className="tiny dim">Nama paket</span>
        <input className="input" value={values.name} disabled={isPending} placeholder="mis. Deep Tissue 60 Menit" onChange={(e) => patch({ name: e.target.value })} />
      </label>

      <label className="stack g1">
        <span className="tiny dim">Jenis layanan</span>
        <select className="select" value={values.serviceTypeId} disabled={isPending} onChange={(e) => patch({ serviceTypeId: e.target.value })}>
          {serviceTypes.length === 0 && <option value="">— Belum ada jenis layanan —</option>}
          {serviceTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

      <div className="row g2">
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Durasi (menit)</span>
          <input className="input" type="number" min={1} value={values.durationMin} disabled={isPending} onChange={(e) => patch({ durationMin: e.target.value })} />
        </label>
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Tipe room</span>
          <input className="input" value={values.roomType} disabled={isPending} placeholder="mis. Massage" onChange={(e) => patch({ roomType: e.target.value })} />
        </label>
      </div>

      <div className="row g2">
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Harga List (Rp)</span>
          <input className="input" type="number" min={0} value={values.listPrice} disabled={isPending} onChange={(e) => patch({ listPrice: e.target.value })} />
        </label>
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Harga Member (Rp)</span>
          <input className="input" type="number" min={0} value={values.memberPrice} disabled={isPending} onChange={(e) => patch({ memberPrice: e.target.value })} />
        </label>
        <label className="stack g1" style={{ flex: 1 }}>
          <span className="tiny dim">Harga Weekend (Rp)</span>
          <input className="input" type="number" min={0} value={values.weekendPrice} disabled={isPending} onChange={(e) => patch({ weekendPrice: e.target.value })} />
        </label>
      </div>

      <label className="stack g1">
        <span className="tiny dim">Komisi terapis</span>
        <div className="row g2">
          <select
            className="select"
            value={values.commissionType}
            disabled={isPending}
            onChange={(e) => patch({ commissionType: e.target.value as CommissionType })}
            style={{ maxWidth: 110 }}
          >
            <option value="fixed">Rupiah</option>
            <option value="percent">Persen</option>
          </select>
          <input
            className="input"
            type="number"
            min={0}
            max={values.commissionType === "percent" ? 100 : undefined}
            value={values.commissionValue}
            disabled={isPending}
            onChange={(e) => patch({ commissionValue: e.target.value })}
            style={{ flex: 1 }}
          />
        </div>
      </label>

      {previewValid ? (
        <div className="tiny" style={{ color: "var(--text-2)" }}>
          {formatCommissionRule({ type: values.commissionType, value: valueNum })} → terapis dapat{" "}
          <span className="strong" style={{ color: "var(--text-1)" }}>{rp(preview)}</span> per treatment
        </div>
      ) : (
        <div className="tiny dim">Komisi belum diisi — terapis tidak akan dapat komisi dari paket ini.</div>
      )}

      <ErrorNote error={error} />

      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await createPackage({
                outletId,
                serviceTypeId: values.serviceTypeId,
                name: values.name,
                durationMin: Number(values.durationMin),
                listPrice: Number(values.listPrice),
                memberPrice: Number(values.memberPrice),
                weekendPrice: Number(values.weekendPrice),
                roomType: values.roomType,
                commissionType: values.commissionType,
                commissionValue: Number(values.commissionValue),
              });
              if (r.ok) { setValues(empty); setOpen(false); }
              else setError(r.error);
            });
          }}
        >
          <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan Paket"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>
    </div>
  );
}

/** "Add-on Baru" — inline create form, opened from the Add-on Layanan card header. */
export function NewAddonForm({ outletId }: { outletId: string }) {
  const [open, setOpen] = useState(false);
  const empty: AddonFormValues = { name: "", price: "0", commissionType: "fixed", commissionValue: "0", durationMin: "0", active: true };
  const [values, setValues] = useState<AddonFormValues>(empty);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => { setValues(empty); setError(null); setOpen(true); }}>
        <Icon name="plus" size={12} /> Add-on Baru
      </button>
    );
  }

  return (
    <div className="stack g2" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--bg-deep)", border: "1px solid var(--border)", marginBottom: 4 }}>
      <AddonFormFields values={values} disabled={isPending} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />

      <ErrorNote error={error} />

      <div className="row g2">
        <button
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await createAddon({
                outletId,
                name: values.name,
                price: Number(values.price),
                commissionType: values.commissionType,
                commissionValue: Number(values.commissionValue),
                durationMin: Number(values.durationMin),
                active: values.active,
              });
              if (r.ok) { setValues(empty); setOpen(false); }
              else setError(r.error);
            });
          }}
        >
          <Icon name="check" size={13} /> {isPending ? "Menyimpan…" : "Simpan Add-on"}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={isPending} onClick={() => setOpen(false)}>
          Batal
        </button>
      </div>
    </div>
  );
}
