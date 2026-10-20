import { Page, PageHeader } from "@/components/ui";
import { t } from "@/i18n/es";

export default function Tab() {
  return (
    <>
      <PageHeader title={t.nav.menu} />
      <Page>
        <p className="text-muted">{t.common.comingSoon}</p>
      </Page>
    </>
  );
}
