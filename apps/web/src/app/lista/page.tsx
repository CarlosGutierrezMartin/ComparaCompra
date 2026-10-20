import { Page, PageHeader } from "@/components/ui";
import { t } from "@/i18n/es";

export default function Tab() {
  return (
    <>
      <PageHeader title={t.nav.lista} />
      <Page>
        <p className="text-muted">{t.common.comingSoon}</p>
      </Page>
    </>
  );
}
