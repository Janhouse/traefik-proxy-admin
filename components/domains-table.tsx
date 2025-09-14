"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Edit, Trash2, Star, Shield, ShieldOff } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { DomainResponse } from "@/lib/dto/domain.dto";

interface DomainsTableProps {
  domains: DomainResponse[];
  onEdit: (domain: DomainResponse) => void;
  onDelete: (id: string) => void;
}

export function DomainsTable({ domains, onEdit, onDelete }: DomainsTableProps) {

  if (domains.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
            No domains configured
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 text-center">
            Add your first domain to start managing services
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead>Cert Resolver</TableHead>
                <TableHead className="text-center">Services</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell>
                    {domain.isDefault && (
                      <div title="Default Domain">
                        <Star className="h-4 w-4 text-yellow-500 fill-current" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {domain.name}
                  </TableCell>
                  <TableCell>
                    <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {domain.domain}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={domain.useWildcardCert ? "default" : "secondary"} className="gap-1">
                      {domain.useWildcardCert ? (
                        <>
                          <Shield className="h-3 w-3" />
                          Wildcard
                        </>
                      ) : (
                        <>
                          <ShieldOff className="h-3 w-3" />
                          Individual
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {domain.certResolver}
                    </code>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">
                      {domain.serviceCount || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(domain)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={(domain.serviceCount ?? 0) > 0}
                            title={(domain.serviceCount ?? 0) > 0 ? "Cannot delete domain with existing services" : "Delete domain"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete Domain"
                        description={`Are you sure you want to delete the domain "${domain.name}"? This action cannot be undone.`}
                        onConfirm={() => onDelete(domain.id)}
                        variant="destructive"
                        confirmText="Delete"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </>
  );
}