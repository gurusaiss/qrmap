/**
 * Seeds reference data (categories, plans, flags) and, in development, two
 * demo merchants used by the isolation tests and the UI.
 */
import { eq, sql } from 'drizzle-orm';
import { withSystem } from '../tenancy';
import { schema } from './client';
import { hashPassword } from '../auth/crypto';
import { createTenant } from '../merchants/tenants';
import { closeDb } from './client';

export const CATEGORIES = [
  { slug: 'barber', name: 'Barber Shop', templateKey: 'services', aiEnabledByDefault: true },
  { slug: 'salon', name: 'Salon & Spa', templateKey: 'services', aiEnabledByDefault: true },
  { slug: 'restaurant', name: 'Restaurant', templateKey: 'menu', aiEnabledByDefault: true },
  { slug: 'cafe', name: 'Cafe', templateKey: 'menu', aiEnabledByDefault: true },
  { slug: 'clothing', name: 'Clothing Store', templateKey: 'retail', aiEnabledByDefault: true },
  { slug: 'grocery', name: 'Grocery & Kirana', templateKey: 'retail', aiEnabledByDefault: true },
  { slug: 'bakery', name: 'Bakery', templateKey: 'retail', aiEnabledByDefault: true },
  { slug: 'hardware', name: 'Hardware Store', templateKey: 'retail', aiEnabledByDefault: true },
  { slug: 'mobile-repair', name: 'Mobile & Repair', templateKey: 'services', aiEnabledByDefault: true },
  { slug: 'gym', name: 'Gym & Fitness', templateKey: 'services', aiEnabledByDefault: true },
  { slug: 'wholesale', name: 'Wholesale & Trading', templateKey: 'wholesale', aiEnabledByDefault: true },
  // AI is off by default for medical: the highest-liability surface in the product.
  { slug: 'medical', name: 'Clinic & Medical', templateKey: 'services', aiEnabledByDefault: false },
  { slug: 'other', name: 'Other Business', templateKey: 'generic', aiEnabledByDefault: true },
];

export const PLANS = [
  {
    key: 'free',
    name: 'Free',
    priceMinor: 0,
    limits: { catalogItems: 20, activeOffers: 3, mediaMb: 25, aiQuestionsPerMonth: 0, branches: 1 },
    features: { analytics: 'basic', ai: false, removeBranding: false, website: false },
    sortOrder: 0,
  },
  {
    key: 'growth',
    name: 'Growth',
    priceMinor: 14900,
    limits: { catalogItems: 500, activeOffers: 50, mediaMb: 500, aiQuestionsPerMonth: 500, branches: 1 },
    features: { analytics: 'full', ai: true, removeBranding: true, website: false, leadInbox: true },
    sortOrder: 1,
  },
  {
    key: 'business',
    name: 'Business',
    priceMinor: 39900,
    limits: { catalogItems: 5000, activeOffers: 200, mediaMb: 2000, aiQuestionsPerMonth: 2000, branches: 10 },
    features: { analytics: 'full', ai: true, removeBranding: true, website: true, leadInbox: true, staff: true },
    sortOrder: 2,
  },
];

const FLAGS = [
  { key: 'ai_assistant', description: 'Per-merchant AI assistant', defaultEnabled: true },
  { key: 'analytics_report', description: 'Monthly merchant report', defaultEnabled: true },
  { key: 'merchant_groups', description: 'Aggregator / multi-branch groups (V2)', defaultEnabled: false },
  { key: 'website_builder', description: 'Website builder (V3)', defaultEnabled: false },
];

export async function seedReferenceData(): Promise<void> {
  await withSystem(async ({ tx }) => {
    for (const [index, c] of CATEGORIES.entries()) {
      await tx
        .insert(schema.categories)
        .values({ ...c, sortOrder: index })
        .onConflictDoUpdate({
          target: schema.categories.slug,
          set: { name: c.name, templateKey: c.templateKey, aiEnabledByDefault: c.aiEnabledByDefault },
        });
    }
    for (const p of PLANS) {
      await tx
        .insert(schema.plans)
        .values(p as never)
        .onConflictDoUpdate({ target: schema.plans.key, set: { name: p.name, priceMinor: p.priceMinor } });
    }
    for (const f of FLAGS) {
      await tx.insert(schema.featureFlags).values(f).onConflictDoNothing();
    }
  });
}

export async function seedPlatformAdmin(email: string, password: string): Promise<string> {
  const passwordHash = await hashPassword(password);
  return withSystem(async ({ tx }) => {
    const [user] = await tx
      .insert(schema.users)
      .values({ email, passwordHash, fullName: 'Platform Admin' })
      .onConflictDoUpdate({ target: schema.users.email, set: { passwordHash } })
      .returning();
    if (!user) throw new Error('failed to seed admin');
    await tx
      .insert(schema.platformAdmins)
      .values({ userId: user.id, role: 'super_admin' })
      .onConflictDoNothing();
    return user.id;
  });
}

async function categoryId(slug: string): Promise<string> {
  return withSystem(async ({ tx }) => {
    const [row] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.slug, slug))
      .limit(1);
    if (!row) throw new Error(`category ${slug} missing`);
    return row.id;
  });
}

async function seedDemoMerchants(adminId: string): Promise<void> {
  const existing = await withSystem(async ({ tx }) => {
    const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.tenants);
    return row?.n ?? 0;
  });
  if (existing > 0) {
    process.stdout.write('  demo merchants already present, skipping\n');
    return;
  }

  const barber = await createTenant({
    displayName: 'Sharma Hair Salon',
    categoryId: await categoryId('barber'),
    slug: 'sharma-hair-salon',
    phone: '+919876543210',
    city: 'Hyderabad',
    actorUserId: adminId,
  });

  const wholesaler = await createTenant({
    displayName: 'Krishna Hardware Traders',
    categoryId: await categoryId('wholesale'),
    slug: 'krishna-hardware',
    phone: '+919876500000',
    city: 'Vijayawada',
    actorUserId: adminId,
  });

  await withSystem(async ({ tx }) => {
    await tx
      .update(schema.businessProfiles)
      .set({
        tagline: 'Haircuts, beard styling and grooming since 1998',
        description: 'A family-run salon in Kothapet. Walk-ins welcome, air-conditioned, card and UPI accepted.',
        addressLine1: 'Shop 12, Main Road, Kothapet',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500035',
        accentColor: '#c2491d',
      })
      .where(eq(schema.businessProfiles.tenantId, barber.tenantId));

    await tx.insert(schema.catalogItems).values([
      { tenantId: barber.tenantId, kind: 'service', name: 'Haircut', priceMinor: 15000, durationMinutes: 30, sortOrder: 1 },
      { tenantId: barber.tenantId, kind: 'service', name: 'Haircut + Beard', priceMinor: 25000, durationMinutes: 45, sortOrder: 2 },
      { tenantId: barber.tenantId, kind: 'service', name: 'Head Massage', priceMinor: 20000, durationMinutes: 30, sortOrder: 3 },
      { tenantId: barber.tenantId, kind: 'service', name: 'Hair Colour', priceMinor: 60000, priceMaxMinor: 150000, durationMinutes: 90, sortOrder: 4 },
      { tenantId: barber.tenantId, kind: 'product', name: 'Beard Oil (50ml)', priceMinor: 25000, stockStatus: 'in_stock', sortOrder: 5 },
    ]);

    await tx.insert(schema.offers).values({
      tenantId: barber.tenantId,
      title: 'Festival Offer - Haircut at Rs 99',
      description: 'Limited period festival pricing on all regular haircuts.',
      discountType: 'flat',
      discountValueMinor: 5100,
      isPublished: true,
      isFeatured: true,
      ctaType: 'call',
      endsAt: new Date(Date.now() + 30 * 86_400_000),
    });

    await tx
      .update(schema.businessProfiles)
      .set({
        tagline: 'Wholesale hardware, plumbing and electrical supplies',
        description: 'Serving retailers across Andhra Pradesh since 2004. GST billing, bulk rates, delivery available.',
        addressLine1: 'Plot 45, Auto Nagar',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        extra: { gstin: '37ABCDE1234F1Z5' },
      })
      .where(eq(schema.businessProfiles.tenantId, wholesaler.tenantId));

    await tx.insert(schema.catalogItems).values([
      { tenantId: wholesaler.tenantId, kind: 'product', name: 'PVC Pipe 1 inch', priceMinor: 12000, priceUnit: 'per length', minOrderQty: 50, bulkTiers: [{ minQty: 100, priceMinor: 11000 }, { minQty: 500, priceMinor: 10000 }] as never, sortOrder: 1 },
      { tenantId: wholesaler.tenantId, kind: 'product', name: 'Copper Wire 1.5mm (90m)', priceMinor: 185000, minOrderQty: 10, sortOrder: 2 },
      { tenantId: wholesaler.tenantId, kind: 'product', name: 'Door Handle - Steel', priceMinor: null, priceUnit: 'price on request', minOrderQty: 100, sortOrder: 3 },
    ]);

    await tx
      .update(schema.tenants)
      .set({ publishedAt: new Date(), status: 'active' })
      .where(eq(schema.tenants.id, barber.tenantId));
    await tx
      .update(schema.tenants)
      .set({ publishedAt: new Date(), status: 'active' })
      .where(eq(schema.tenants.id, wholesaler.tenantId));
  });

  process.stdout.write(`  seeded /m/${barber.slug} and /m/${wholesaler.slug}\n`);
}

export async function seed(): Promise<void> {
  process.stdout.write('seeding\n');
  await seedReferenceData();
  process.stdout.write('  reference data\n');
  const adminId = await seedPlatformAdmin('admin@example.com', 'change-this-password');
  process.stdout.write('  platform admin: admin@example.com / change-this-password\n');
  await seedDemoMerchants(adminId);
  process.stdout.write('seed complete\n');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed()
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      const cause = err instanceof Error && err.cause ? `\ncause: ${String(err.cause)}` : '';
      process.stderr.write(`seed failed: ${String(err)}${cause}\n`);
      process.exit(1);
    });
}
