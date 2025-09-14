"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
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
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              Domain Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage domains for your services with certificate settings
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddDomain}>
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          </div>
        </div>

        {/* Domains Table */}
        <DomainsTable
          domains={domains}
          onEdit={handleEditDomain}
          onDelete={handleDeleteDomain}
        />

        {/* Domain Form Dialog */}
        {showForm && (
          <DomainForm
            domain={editingDomain}
            onSave={handleSaveDomain}
            onCancel={handleFormCancel}
          />
        )}
      </div>
    </AppLayout>
  );
}