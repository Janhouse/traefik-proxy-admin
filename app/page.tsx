"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  Copy,
  Settings,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { ServiceTable } from "@/components/service-table";
import { useServices } from "@/hooks/use-services";
import { useRouter } from "next/navigation";
import type { Service } from "@/components/service-table";

export default function HomePage() {
  const {
    services,
    loading,
    fetchServices,
    deleteService,
    toggleService,
    generateShareLink,
  } = useServices();

  const router = useRouter();

  // Share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const handleManageSecurity = (service: Service) => {
    router.push(`/services/${service.id}/security`);
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
    <>
      <AppLayout>
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

          {/* Service Table */}
          <ServiceTable
            services={services}
            loading={loading}
            onDelete={deleteService}
            onToggle={toggleService}
            onManageSecurity={handleManageSecurity}
            onGenerateShareLink={handleGenerateShareLink}
            onRefresh={fetchServices}
            useRouterNavigation={true}
          />
        </div>
      </AppLayout>

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
    </>
  );
}