import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/index.jsx';
import { Tabs } from '@/components/ui/tabs.jsx';
import { CatalogManager } from '@/features/catalogs/CatalogManager.jsx';
import { MASTER_DEFINITIONS } from '@/features/catalogs/catalogs.js';
import { preloadCatalog } from '@/features/catalogs/useCatalog.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { BackgroundImagesManager } from '@/features/catalogs/BackgroundImagesManager.jsx';

export function MasterDataPage() {
  const { isAdmin } = useAuth();
  const [kind, setKind] = useState('property-types');

  useEffect(() => {
    if (!isAdmin) return;
    Object.entries(MASTER_DEFINITIONS).filter(([, definition]) => !definition.custom).forEach(([masterKind]) => {
      preloadCatalog(masterKind, { admin: true });
    });
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/admin/dashboard" replace />;
  return (
    <div className="space-y-6">
      <PageHeader title="Masters" description="Manage catalogue values and the homepage background images used across the platform." />
      <Tabs value={kind} onChange={setKind} label="Master type" items={Object.entries(MASTER_DEFINITIONS).map(([value, definition]) => ({ value, label: definition.label }))} />
      {kind === 'background-images' ? <BackgroundImagesManager /> : <CatalogManager key={kind} kind={kind} />}
    </div>
  );
}
