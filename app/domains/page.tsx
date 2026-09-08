"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { DomainsTable } from "@/components/domains-table";
import { DomainForm } from "@/components/domain-form";
import { useDomains } from "@/lib/hooks/use-domains";
import type { DomainResponse, CreateDomainRequest, UpdateDomainRequest } from "@/lib/dto/domain.dto";

export default function DomainsPage() {
  const {
    domains,
    loading,
    fetchDomains,
    saveDomain,
    deleteDomain,
  } = useDomains();

  const [editingDomain, setEditingDomain] = useState<DomainResponse | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleAddDomain = () => {
    setEditingDomain(null);
    setShowForm(true);
  };

  const handleEditDomain = (domain: DomainResponse) => {
    setEditingDomain(domain);
    setShowForm(true);
  };

  const handleSaveDomain = async (domain: CreateDomainRequest | UpdateDomainRequest) => {
    await saveDomain(domain, editingDomain?.id);
    setShowForm(false);
    setEditingDomain(null);
  };

  const handleDeleteDomain = async (id: string) => {
    await deleteDomain(id);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingDomain(null);
  };

  if (loading && domains.length === 0) {
    return (
      <AppLayout>
        <PageBand eyebrow="Manage" title="Domains" subtitle="Base domains, wildcard certs & resolvers" />
        <PageMain>
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </PageMain>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageBand
        eyebrow="Manage"
        title="Domains"
        subtitle="Base domains, wildcard certs & resolvers"
        actions={
          <Button className="btn-brand" onClick={handleAddDomain}>
            <Plus className="mr-2 h-4 w-4" />
            Add Domain
          </Button>
        }
      />
      <PageMain>
        <DomainsTable
          domains={domains}
          onEdit={handleEditDomain}
          onDelete={handleDeleteDomain}
        />

        {showForm && (
          <DomainForm
            domain={editingDomain}
            onSave={handleSaveDomain}
            onCancel={handleFormCancel}
          />
        )}
      </PageMain>
    </AppLayout>
  );
}
