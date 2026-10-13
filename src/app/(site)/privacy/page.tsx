import Link from "next/link";
import { StaticPage } from "@/components/site/static-page";
import { analyticsMeasurementId } from "@/lib/analytics";
import { pageMetadata } from "@/lib/seo/metadata";
import { site } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description:
    "What information TidyNest collects when you read the site, which cookies are used, and how to contact us about your data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  const analyticsOn = analyticsMeasurementId() !== null;
  return (
    <StaticPage
      title="Privacy policy"
      lead="TidyNest is a reading site. You do not need an account, and we collect as little information as we can."
      path="/privacy"
      lastUpdated="13 October 2026"
    >
      <h2>Information we collect</h2>
      <p>
        You can read every guide without creating an account or giving us personal details. When you visit,
        our hosting provider automatically processes technical information that every website receives — such
        as your IP address, browser type and the page requested — in order to deliver the page, keep the
        service secure and diagnose errors.
      </p>
      <p>
        When you use the search box, your search words are sent to our server to find matching guides. We do
        not store search words against your identity.
      </p>

      <h2>Cookies</h2>
      {analyticsOn ? (
        <p>
          We use Google Analytics cookies to understand how readers use the site, as described below. The only
          other cookies we use are strictly necessary cookies for members of the {site.name} team who sign in
          to the editorial dashboard.
        </p>
      ) : (
        <p>
          Reading the site does not set any cookies. The only cookies we use are strictly necessary cookies
          for members of the {site.name} team who sign in to the editorial dashboard.
        </p>
      )}

      <h2>Analytics</h2>
      {analyticsOn ? (
        <p>
          We use Google Analytics to measure which pages are read and how visitors find them, so we can
          improve our guides. Google Analytics collects information such as pages visited, approximate
          location, device and browser type, and uses cookies to do so. We do not send Google your name, email
          address or any other information that directly identifies you. Google&apos;s use of this data is
          described in <a href="https://policies.google.com/privacy">Google&apos;s privacy policy</a>.
        </p>
      ) : (
        <p>
          We do not currently use analytics or advertising tools. If we decide to add analytics in the future,
          we will update this policy before doing so and explain what is collected and why.
        </p>
      )}

      <h2>Emails you send us</h2>
      <p>
        If you email us, we use your email address and message only to read and reply to it. We do not add you
        to mailing lists or share your message with anyone else.
      </p>

      <h2>Links to other websites</h2>
      <p>
        Guides may link to other websites, such as manufacturers or shops. Those websites have their own
        privacy policies, and we are not responsible for how they handle your information. See our{" "}
        <Link href="/affiliate-disclosure">affiliate disclosure</Link> for how we handle shopping links.
      </p>

      <h2>Your choices and requests</h2>
      <p>
        You can ask us what personal information we hold about you, and ask us to correct or delete it, by
        contacting us through our <Link href="/contact">contact page</Link>.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change how we handle information, we will update this page and the date below before the change
        takes effect.
      </p>
    </StaticPage>
  );
}
