import { getCurrentTenant } from "@/lib/data/tenant";
import BusinessProfileForm from "@/components/BusinessProfileForm";
import MockDataNotice from "@/components/MockDataNotice";

export default async function BusinessProfilePage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <MockDataNotice title="Tidak bisa memuat profil bisnis">
        Sesi Anda tidak terhubung ke tenant manapun — coba login ulang, atau hubungi admin jika masalah
        berlanjut.
      </MockDataNotice>
    );
  }

  return <BusinessProfileForm tenant={tenant} />;
}
