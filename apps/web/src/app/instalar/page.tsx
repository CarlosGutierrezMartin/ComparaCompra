import { InstallButton } from "@/components/InstallButton";
import { Page, PageHeader } from "@/components/ui";
import { t } from "@/i18n/es";

export const metadata = { title: "Instalar" };

export default function Instalar() {
  return (
    <>
      <PageHeader title={t.install.iosTitle} />
      <Page>
        <ol className="list-decimal space-y-3 pl-5">
          {t.install.iosSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <InstallButton />
      </Page>
    </>
  );
}
