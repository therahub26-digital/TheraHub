"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { updatePackagePricing, updateExtensionPricing, type ActionResult } from "@/lib/actions/catalog";
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
