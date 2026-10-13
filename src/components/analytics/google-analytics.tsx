import Script from "next/script";
import { analyticsMeasurementId } from "@/lib/analytics";

/** Renders nothing unless analytics has been explicitly enabled and configured. */
export function GoogleAnalytics() {
  const id = analyticsMeasurementId();
  if (!id) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});`}
      </Script>
    </>
  );
}
