import { requireMerchant } from '@/modules/auth/session-server';
import { getAiConfig } from '@/modules/merchants/content';
import { isFeatureBlockedForTenant } from '@/modules/platform/features';
import { Badge, Card, PageHeader } from '@/components/ui';
import { AiConfigForm } from './ai-config-form';

export const metadata = { title: 'AI assistant' };

export default async function AiSettingsPage() {
  const { tenantId } = await requireMerchant('ai:configure');
  const [config, blocked] = await Promise.all([
    getAiConfig(tenantId),
    isFeatureBlockedForTenant(tenantId, 'ai_assistant'),
  ]);

  return (
    <div>
      <PageHeader
        title="AI assistant"
        description="Answers customer questions on your page automatically, using only your own shop information."
      />

      {blocked && (
        <Card className="mb-4 border-warning-600/30 bg-warning-50/40">
          <p className="flex items-center gap-2 text-[14px] text-ink-700">
            <Badge tone="warning">Restricted</Badge>
            The platform has turned this off for your account. Contact support if you think this is a
            mistake.
          </p>
        </Card>
      )}

      <AiConfigForm
        disabled={blocked}
        initial={{
          isEnabled: config?.isEnabled ?? false,
          extraInstructions: config?.extraInstructions ?? '',
        }}
      />
    </div>
  );
}
