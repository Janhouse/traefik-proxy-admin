"use client";

import { useState, useEffect } from "react";
import NextLink from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CheckCircle,
  Copy,
  ArrowLeft,
  Settings,
  Shield,
  Users,
  Database,
  Menu,
  X
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { TraefikConfigDialog } from "@/components/traefik-config-dialog";
import { ServiceTable } from "@/components/service-table";
import { ServiceForm } from "@/components/service-form";
import { ServiceSecurityList } from "@/components/service-security-list";
import { AppFooter } from "@/components/app-footer";
import { useServices } from "@/hooks/use-services";
import type { Service } from "@/components/service-table";

export default function HomePage() {
  const {
    services,
    loading,
    baseDomain,
    defaultDuration,
    fetchServices,
    fetchBaseDomain,
    saveService,
    deleteService,
    toggleService,
    generateShareLink,
  } = useServices();

  // UI State
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [managingSecurityForService, setManagingSecurityForService] = useState<Service | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchServices();
    fetchBaseDomain();
  }, [fetchServices, fetchBaseDomain]);

  const handleSubmit = async (serviceData: Omit<Service, "id" | "createdAt" | "updatedAt">) => {
    await saveService(serviceData, editingService);
    setShowForm(false);
    setEditingService(null);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingService(null);
  };

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditingService(null);
    setShowForm(true);
  };

  const handleManageSecurity = (service: Service) => {
    setManagingSecurityForService(service);
  };

  const handleGenerateShareLink = async (serviceId: string) => {
    try {
      const url = await generateShareLink(serviceId);
      setShareUrl(url);
      setShowShareDialog(true);
      setCopiedShareUrl(false);
      // URL is already copied to clipboard by the generateShareLink function
    } catch (error) {
      console.error("Failed to generate share link:", error);
      // You could add a toast notification here
    }
  };

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(true);
      setTimeout(() => setCopiedShareUrl(false), 2000);
    } catch (error) {
      console.error("Failed to copy URL:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-800 flex-shrink-0">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Traefik Admin
              </h1>
              <nav className="hidden md:flex space-x-6">
                <NextLink
                  href="/"
                  className="text-gray-900 dark:text-gray-100 font-medium"
                >
                  Services
                </NextLink>
                <NextLink
                  href="/security"
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Security
                </NextLink>
                <NextLink
                  href="/sessions"
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Sessions
                </NextLink>
                <NextLink
                  href="/config"
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Config
                </NextLink>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2">
                <TraefikConfigDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Traefik Config
                    </Button>
                  }
                />
                <ThemeToggle />
              </div>
              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-white dark:bg-gray-800">
            <div className="container mx-auto px-4 py-4 space-y-3">
              <NextLink
                href="/"
                className="block text-gray-900 dark:text-gray-100 font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Services
              </NextLink>
              <NextLink
                href="/security"
                className="block text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                Security
              </NextLink>
              <NextLink
                href="/sessions"
                className="block text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sessions
              </NextLink>
              <NextLink
                href="/config"
                className="block text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                Config
              </NextLink>
              <div className="flex items-center gap-2 pt-2 border-t">
                <TraefikConfigDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Traefik Config
                    </Button>
                  }
                />
                <ThemeToggle />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="container mx-auto px-4 py-8 flex-1">
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Settings className="h-6 w-6 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold">{services.length}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Services</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold">
                        {services.filter(s => s.enabled).length}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Active</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Security Management or Service Form or Service Table */}
            {managingSecurityForService ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setManagingSecurityForService(null)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Services
                  </Button>
                  <h2 className="text-lg font-medium">
                    Security Management - {managingSecurityForService.name}
                  </h2>
                </div>
                <ServiceSecurityList
                  serviceId={managingSecurityForService.id}
                  serviceName={managingSecurityForService.name}
                />
              </div>
            ) : showForm ? (
              <div className="space-y-4">
                <ServiceForm
                  service={editingService}
                  baseDomain={baseDomain}
                  defaultDuration={defaultDuration}
                  onSubmit={handleSubmit}
                  onCancel={handleCloseForm}
                />
              </div>
            ) : (
              <ServiceTable
                services={services}
                loading={loading}
                baseDomain={baseDomain}
                onAddNew={handleAddNew}
                onEdit={handleEdit}
                onDelete={deleteService}
                onToggle={toggleService}
                onManageSecurity={handleManageSecurity}
                onGenerateShareLink={handleGenerateShareLink}
                onRefresh={fetchServices}
              />
            )}
          </div>
        </div>
        <AppFooter />
      </div>

      {/* Share Link Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Link Generated</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This link provides temporary access to the service:
            </p>
            <div className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded">
              <code className="flex-1 text-sm break-all">{shareUrl}</code>
              <Button size="sm" onClick={copyShareUrl}>
                {copiedShareUrl ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}