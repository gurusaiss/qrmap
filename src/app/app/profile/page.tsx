import { requireMerchant } from '@/modules/auth/session-server';
import { getProfile } from '@/modules/merchants/content';
import { PageHeader } from '@/components/ui';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Shop details' };

export default async function ProfilePage() {
  const { tenantId } = await requireMerchant('profile:read');
  const { profile, tenant } = await getProfile(tenantId);

  return (
    <div>
      <PageHeader
        title="Shop details"
        description="This is what customers see when they scan your code."
      />
      <ProfileForm
        initial={{
          displayName: tenant?.displayName ?? '',
          tagline: profile?.tagline ?? '',
          description: profile?.description ?? '',
          phone: profile?.phone ?? '',
          whatsapp: profile?.whatsapp ?? '',
          email: profile?.email ?? '',
          websiteUrl: profile?.websiteUrl ?? '',
          addressLine1: profile?.addressLine1 ?? '',
          addressLine2: profile?.addressLine2 ?? '',
          city: profile?.city ?? '',
          state: profile?.state ?? '',
          pincode: profile?.pincode ?? '',
          googleMapsUrl: profile?.googleMapsUrl ?? '',
          gbpReviewUrl: profile?.gbpReviewUrl ?? '',
          accentColor: profile?.accentColor ?? '#1D4ED8',
        }}
      />
    </div>
  );
}
