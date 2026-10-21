import { getCurrentTenant, getTenantPosterSettings } from "@/lib/data/tenant";
import { brandByKey } from "@/lib/brand";
import { defaultPosterBg } from "@/lib/posterTheme";
import BusinessProfileForm from "@/components/BusinessProfileForm";
import MockDataNotice from "@/components/MockDataNotice";

export default async function BusinessProfilePage() {
  const [tenant, poster] = await Promise.all([getCurrentTenant(), getTenantPosterSettings()]);

  if (!tenant) {
    return (
      <MockDataNotice title="Tidak bisa memuat profil bisnis">
        Sesi Anda tidak terhubung ke tenant manapun — coba login ulang, atau hubungi admin jika masalah
        berlanjut.
      </MockDataNotice>
    );
  }

  return <BusinessProfileForm tenant={tenant} poster={poster} posterDefaultBg={defaultPosterBg(brandByKey(tenant.logoTone).accent)} />;
}
