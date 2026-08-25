"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui";
import { FloatingPanel as Panel } from "@/components/FloatingPanel";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  createServiceType,
  updateServiceType,
  setServiceTypeActive,
  deleteServiceType,
  type ActionResult,
  type CategoryInput,
  type ServiceTypeInput,
} from "@/lib/actions/masterCatalog";
import type { ServiceCategory, ServiceType } from "@/lib/types";

// ---------------------------------------------------------------------
// Editor master tenant sungguhan untuk /admin/master — Adjie (2026-08-25),
// item 3/3: "dibuatkan opsi saja mana yg akan di aktifkan, kalau di amet
// baru 1 layanan, sisanya optional dan bisa diedit, tambahkan atau
// dihapus." Sebelumnya seluruh halaman ini (`CATEGORIES`/`SERVICE_TYPES`
// dari lib/mock) cuma tampilan contoh dengan tombol `disabled`.
//
// Dua bagian: kategori (CategoryList — kartu dengan tombol edit/hapus +
// form tambah) dan jenis layanan (ServiceTypeTable — tabel dengan saklar
// aktif/nonaktif cepat + tombol edit/hapus + form tambah). Menghapus
// kategori/jenis layanan yang masih dipakai (jenis layanan di dalam
// kategori, atau paket harga yang memakai jenis layanan) ditolak di sisi
// action dengan pesan yang menjelaskan kenapa, bukan dibiarkan gagal
// dengan error FK mentah.
// ---------------------------------------------------------------------

const ICONS = [
  "layers", "book-open", "sparkles", "droplet", "flower", "sun", "waves",
  "heart-handshake", "hand-heart", "gem", "wind", "leaf", "star", "crown",
] as const;

function useSaver() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onDone?.();
    });
  }

  return { pending, error, run, setError };
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="tiny" style={{ color: "var(--danger)", marginTop: 6 }}>
      <Icon name="alert-triangle" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />
      {error}
    </div>
  );
}

function IconPicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="row g2">
      <span className="stat-icon" style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0 }}>
        <Icon name={value} size={15} />
      </span>
      <select className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ height: 30, fontSize: 12 }}>
        {ICONS.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

// =====================================================================
// Kategori
// =====================================================================

function CategoryForm({
  initial,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  initial: CategoryInput;
  onCancel: () => void;
  onSubmit: (v: CategoryInput) => void;
  pending: boolean;
  error: string | null;
}) {
  const [values, setValues] = useState<CategoryInput>(initial);
  return (
    <div className="stack g2">
      <label className="stack g1">
        <span className="tiny dim">Nama kategori</span>
        <input className="input" value={values.name} disabled={pending} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
      </label>
      <label className="stack g1">
        <span className="tiny dim">Ikon</span>
        <IconPicker value={values.icon} onChange={(icon) => setValues((v) => ({ ...v, icon }))} disabled={pending} />
      </label>
      <label className="stack g1">
        <span className="tiny dim">Deskripsi</span>
        <textarea className="textarea" value={values.description} disabled={pending} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} style={{ minHeight: 48, fontSize: 12 }} />
      </label>
      <ErrorNote error={error} />
      <div className="row g2">
        <button className="btn btn-primary btn-sm" type="button" disabled={pending || !values.name.trim()} onClick={() => onSubmit(values)}>
          <Icon name="check" size={13} /> {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={onCancel}>Batal</button>
      </div>
    </div>
  );
}

function CategoryCard({ category, typeCount }: { category: ServiceCategory; typeCount: number }) {
  const { pending, error, run, setError } = useSaver();
  const [editing, setEditing] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="row g3" style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
      <span className="stat-icon" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}>
        <Icon name={category.icon} size={16} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="small strong" style={{ color: "var(--text-1)" }}>{category.name}</div>
        <div className="tiny dim truncate">{category.description || "Tidak ada deskripsi."}</div>
      </div>
      <Badge tone="neutral">{typeCount} jenis</Badge>
      <button ref={anchorRef} className="btn btn-quiet btn-icon btn-sm" type="button" title="Edit kategori" onClick={() => { setError(null); setEditing(true); }}>
        <Icon name="edit" size={13} />
      </button>
      <button
        className="btn btn-quiet btn-icon btn-sm"
        type="button"
        title={typeCount > 0 ? "Hapus dulu semua jenis layanan di kategori ini" : "Hapus kategori"}
        disabled={pending}
        onClick={() => run(() => deleteCategory(category.id))}
      >
        <Icon name="trash" size={13} />
      </button>
      {editing && (
        <Panel anchorRef={anchorRef} onClose={() => setEditing(false)}>
          <div className="small strong" style={{ color: "var(--text-1)" }}>Edit kategori</div>
          <CategoryForm
            initial={{ name: category.name, icon: category.icon, description: category.description }}
            pending={pending}
            error={error}
            onCancel={() => setEditing(false)}
            onSubmit={(v) => run(() => updateCategory(category.id, v), () => setEditing(false))}
          />
        </Panel>
      )}
    </div>
  );
}

export function NewCategoryButton() {
  const { pending, error, run, setError } = useSaver();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const empty: CategoryInput = { name: "", icon: "layers", description: "" };

  return (
    <>
      <button ref={anchorRef} className="btn btn-primary btn-sm" type="button" onClick={() => { setError(null); setOpen(true); }}>
        <Icon name="plus" size={14} /> Kategori Baru
      </button>
      {open && (
        <Panel anchorRef={anchorRef} onClose={() => setOpen(false)}>
          <div className="small strong" style={{ color: "var(--text-1)" }}>Kategori baru</div>
          <CategoryForm initial={empty} pending={pending} error={error} onCancel={() => setOpen(false)} onSubmit={(v) => run(() => createCategory(v), () => setOpen(false))} />
        </Panel>
      )}
    </>
  );
}

export function CategoryList({ categories, types }: { categories: ServiceCategory[]; types: ServiceType[] }) {
  return (
    <div className="card-body stack g3">
      {categories.length === 0 && <div className="tiny dim">Belum ada kategori — klik &quot;Kategori Baru&quot; untuk menambah.</div>}
      {categories.map((c) => (
        <CategoryCard key={c.id} category={c} typeCount={types.filter((t) => t.categoryId === c.id).length} />
      ))}
    </div>
  );
}

// =====================================================================
// Jenis Layanan
// =====================================================================

function ServiceTypeForm({
  categories,
  initial,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  categories: ServiceCategory[];
  initial: ServiceTypeInput;
  onCancel: () => void;
  onSubmit: (v: ServiceTypeInput) => void;
  pending: boolean;
  error: string | null;
}) {
  const [values, setValues] = useState<ServiceTypeInput>(initial);
  return (
    <div className="stack g2">
      <label className="stack g1">
        <span className="tiny dim">Nama jenis layanan</span>
        <input className="input" value={values.name} disabled={pending} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
      </label>
      <label className="stack g1">
        <span className="tiny dim">Kategori</span>
        <select className="select" value={values.categoryId} disabled={pending} onChange={(e) => setValues((v) => ({ ...v, categoryId: e.target.value }))}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="stack g1">
        <span className="tiny dim">Skill wajib</span>
        <input className="input" value={values.requiredSkill} disabled={pending} onChange={(e) => setValues((v) => ({ ...v, requiredSkill: e.target.value }))} />
      </label>
      <label className="stack g1">
        <span className="tiny dim">Deskripsi</span>
        <textarea className="textarea" value={values.description} disabled={pending} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} style={{ minHeight: 48, fontSize: 12 }} />
      </label>
      <label className="row g2" style={{ alignItems: "center" }}>
        <input type="checkbox" checked={values.active} disabled={pending} onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))} />
        <span className="tiny dim">Aktif — bisa langsung dipilih Manager saat membuat paket baru di Catalog</span>
      </label>
      <ErrorNote error={error} />
      <div className="row g2">
        <button className="btn btn-primary btn-sm" type="button" disabled={pending || !values.name.trim() || !values.categoryId} onClick={() => onSubmit(values)}>
          <Icon name="check" size={13} /> {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={onCancel}>Batal</button>
      </div>
    </div>
  );
}

function ServiceTypeRow({ type, categories, categoryName }: { type: ServiceType; categories: ServiceCategory[]; categoryName: string }) {
  const { pending, error, run, setError } = useSaver();
  const [editing, setEditing] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <tr>
      <td className="strong" style={{ color: "var(--text-1)" }}>{type.name}</td>
      <td className="muted small">{categoryName}</td>
      <td><Badge tone="accent">{type.requiredSkill || "—"}</Badge></td>
      <td>
        <button
          className={`chip${type.active ? " on" : ""}`}
          style={{ cursor: "pointer", border: "none" }}
          type="button"
          disabled={pending}
          title={type.active ? "Aktif — klik untuk nonaktifkan" : "Nonaktif/opsional — klik untuk aktifkan"}
          onClick={() => run(() => setServiceTypeActive(type.id, !type.active))}
        >
          {type.active ? "Aktif" : "Opsional"}
        </button>
      </td>
      <td>
        <div className="row g1">
          <button ref={anchorRef} className="btn btn-ghost btn-icon btn-sm" type="button" title="Edit" onClick={() => { setError(null); setEditing(true); }}>
            <Icon name="edit" size={13} />
          </button>
          <button className="btn btn-quiet btn-icon btn-sm" type="button" title="Hapus" disabled={pending} onClick={() => run(() => deleteServiceType(type.id))}>
            <Icon name="trash" size={13} />
          </button>
        </div>
        {editing && (
          <Panel anchorRef={anchorRef} onClose={() => setEditing(false)}>
            <div className="small strong" style={{ color: "var(--text-1)" }}>Edit jenis layanan</div>
            <ServiceTypeForm
              categories={categories}
              initial={{ categoryId: type.categoryId, name: type.name, requiredSkill: type.requiredSkill, description: type.description, active: type.active }}
              pending={pending}
              error={error}
              onCancel={() => setEditing(false)}
              onSubmit={(v) => run(() => updateServiceType(type.id, v), () => setEditing(false))}
            />
          </Panel>
        )}
        <ErrorNote error={editing ? null : error} />
      </td>
    </tr>
  );
}

export function NewServiceTypeButton({ categories }: { categories: ServiceCategory[] }) {
  const { pending, error, run, setError } = useSaver();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const empty: ServiceTypeInput = { categoryId: categories[0]?.id ?? "", name: "", requiredSkill: "", description: "", active: false };

  return (
    <>
      <button ref={anchorRef} className="btn btn-quiet btn-sm" type="button" disabled={categories.length === 0} title={categories.length === 0 ? "Buat kategori dulu" : undefined} onClick={() => { setError(null); setOpen(true); }}>
        <Icon name="plus" size={13} /> Jenis Layanan Baru
      </button>
      {open && (
        <Panel anchorRef={anchorRef} onClose={() => setOpen(false)}>
          <div className="small strong" style={{ color: "var(--text-1)" }}>Jenis layanan baru</div>
          <div className="tiny dim" style={{ marginBottom: 4 }}>
            Dibuat <strong>tidak aktif</strong> secara default — aman ditambahkan tanpa langsung bisa dipilih Manager. Aktifkan lewat saklar di tabel kalau sudah siap dipakai.
          </div>
          <ServiceTypeForm categories={categories} initial={empty} pending={pending} error={error} onCancel={() => setOpen(false)} onSubmit={(v) => run(() => createServiceType(v), () => setOpen(false))} />
        </Panel>
      )}
    </>
  );
}

export function ServiceTypeTable({ categories, types }: { categories: ServiceCategory[]; types: ServiceType[] }) {
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Jenis Layanan</th><th>Kategori</th><th>Skill Wajib</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {types.length === 0 && (
            <tr><td colSpan={5} className="muted small" style={{ textAlign: "center", padding: "24px 0" }}>Belum ada jenis layanan.</td></tr>
          )}
          {types.map((t) => (
            <ServiceTypeRow key={t.id} type={t} categories={categories} categoryName={categoryName(t.categoryId)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

