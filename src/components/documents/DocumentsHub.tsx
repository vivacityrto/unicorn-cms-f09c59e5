import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Upload, ClipboardList, Sparkles } from 'lucide-react';
import { SharedDocumentsTab } from './tabs/SharedDocumentsTab';
import { ClientUploadsTab } from './tabs/ClientUploadsTab';
import { EvidenceRequestsTab } from './tabs/EvidenceRequestsTab';
import { GeneratedDocumentsTab } from './tabs/GeneratedDocumentsTab';

interface DocumentsHubProps {
  tenantId: number;
  isClientView?: boolean;
  tenantName?: string;
}

export function DocumentsHub({ tenantId, isClientView = false, tenantName }: DocumentsHubProps) {
  const [activeTab, setActiveTab] = useState('shared');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="shared" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Shared by Vivacity</span>
            <span className="sm:hidden">Shared</span>
          </TabsTrigger>
          <TabsTrigger value="uploads" className="gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Uploaded by Client</span>
            <span className="sm:hidden">Uploads</span>
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Evidence Requests</span>
            <span className="sm:hidden">Requests</span>
          </TabsTrigger>
          <TabsTrigger value="generated" className="gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Generated</span>
            <span className="sm:hidden">Generated</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shared" className="mt-6">
          <SharedDocumentsTab 
            tenantId={tenantId} 
            isClientView={isClientView} 
          />
        </TabsContent>

        <TabsContent value="uploads" className="mt-6">
          <ClientUploadsTab 
            tenantId={tenantId} 
            isClientView={isClientView} 
          />
        </TabsContent>

        <TabsContent value="requests" className="mt-6">
          <EvidenceRequestsTab 
            tenantId={tenantId} 
            isClientView={isClientView} 
          />
        </TabsContent>

        <TabsContent value="generated" className="mt-6">
          <GeneratedDocumentsTab 
            tenantId={tenantId} 
            isClientView={isClientView}
            tenantName={tenantName}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
