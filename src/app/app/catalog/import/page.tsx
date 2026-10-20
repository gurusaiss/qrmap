import { requireMerchant } from '@/modules/auth/session-server';
import { listCatalogGroups } from '@/modules/merchants/content';
import { PageHeader } from '@/components/ui';
import { ImportWizard } from './import-wizard';

export const metadata = { title: 'Import your menu' };

export default async function CatalogImportPage() {
  const { tenantId } = await requireMerchant('catalog:write');
  const groups = await listCatalogGroups(tenantId);

  return (
    <div>
      <PageHeader
        title="Import your menu"
        description="Upload a spreadsheet, PDF, Word document, or a photo of your price list — we'll read it and fill in your menu for you."
      />
      <ImportWizard groups={groups.map((g) => ({ id: g.id, name: g.name }))} />
    </div>
  );
}
