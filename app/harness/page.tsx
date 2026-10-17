"use client";

import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { Section } from "@/components/form-section";
import { TokensSection } from "@/components/harness/tokens-section";
import { SettingsSection } from "@/components/harness/settings-section";
import { SharesSection } from "@/components/harness/shares-section";

export default function HarnessPage() {
  return (
    <AppLayout>
      <PageBand
        eyebrow="Integrations"
        title="Harness API"
        subtitle="Token-scoped REST API and MCP that can only manage the shares they created"
      />
      <PageMain>
        <Section
          n={1}
          title="API tokens"
          desc={
            <>
              Bearer tokens for <code>/api/harness/v1</code> and the MCP endpoint{" "}
              <code>/api/harness/mcp</code>. A token only ever sees entries tagged with its owner
              tag — never anything created here in the panel.
            </>
          }
        >
          <TokensSection />
        </Section>
        <Section
          n={2}
          title="Zones"
          desc="Hostname suffixes shares may be created under, and what each one allows. Public shares always need an expiry; expired shares are removed automatically."
        >
          <SettingsSection />
        </Section>
        <Section n={3} title="Shares" desc="Everything created through the API, across all owner tags.">
          <SharesSection />
        </Section>
      </PageMain>
    </AppLayout>
  );
}
