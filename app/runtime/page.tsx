"use client";

import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { RuntimeExplorer } from "@/components/runtime-explorer";

export default function RuntimePage() {
  return (
    <AppLayout>
      <PageBand
        eyebrow="Read-only · live from Traefik"
        title="Runtime configuration"
        subtitle="Everything Traefik currently has loaded — routers, services, middlewares and plugins across every provider. No need to open the Traefik dashboard separately."
      />
      <PageMain>
        <RuntimeExplorer />
      </PageMain>
    </AppLayout>
  );
}
