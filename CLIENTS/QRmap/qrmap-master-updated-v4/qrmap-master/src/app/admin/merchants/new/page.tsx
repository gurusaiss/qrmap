import { requirePlatform } from '@/modules/auth/session-server';
import { withSystem } from '@/modules/tenancy';
import { schema } from '@/modules/db/client';
import { asc } from 'drizzle-orm';
import { PageHeader } from '@/components/ui';
import { NewMerchantForm } from './form';

export const metadata = { title: 'New merchant' };

export default async function NewMerchantPage() {
  await requirePlatform('platform:tenant:create');
  const categories = await withSystem(({ tx }) =>
    tx.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
  );

  return (
    <div className="max-w-lg">
      <PageHeader title="Create a merchant" description="A stable address and QR are created immediately." />
      <NewMerchantForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
