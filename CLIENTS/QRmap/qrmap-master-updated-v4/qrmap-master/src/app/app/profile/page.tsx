import { requireMerchant } from '@/modules/auth/session-server';
import { getProfile, listMedia } from '@/modules/merchants/content';
import { pickVariant } from '@/modules/media/upload';
import { PageHeader } from '@/components/ui';
import { ProfileForm } from './profile-form';
import { PhotoUploadForm } from './photo-upload-form';
import { PhotoGrid } from './photo-grid';

export const metadata = { title: 'Shop details' };

export default async function ProfilePage() {
  const { tenantId } = await requireMerchant('profile:read');
  const { profile, tenant } = await getProfile(tenantId);
  const media = await listMedia(tenantId);
  const photos = media.map((m) => ({
    id: m.id,
    altText: m.altText,
    thumbUrl: (() => {
      const variants = (m.variants ?? {}) as Record<string, string>;
      const key = pickVariant(variants, 'webp', 400) ?? pickVariant(variants, 'avif', 400);
      return key ? `/api/media/${key}` : null;
    })(),
  }));

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
          accentColor: profile?.accentColor ?? '#c2491d',
        }}
      />

      <h2 className="mt-8 mb-3 font-display text-[18px] font-semibold">Photos</h2>
      <p className="mb-3 text-[14px] text-ink-500">
        Shown in a gallery on your page, in the order you add them.
      </p>
      <div className="space-y-3">
        <PhotoGrid photos={photos} />
        <PhotoUploadForm />
      </div>
    </div>
  );
}
