import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TokenPricingCalculator } from '@/components/admin/TokenPricingCalculator';
import { AdminBackButton } from '@/components/admin/AdminBackButton';

export const metadata: Metadata = {
  title: 'Token pricing calculator',
  description: 'Model cost price and target sale price for video token bundles.',
};

export default function AdminTokenPricingPage() {
  return (
    <div className="space-y-6">
      <AdminBackButton className="w-fit" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Token pricing simulator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-300">
          Combine Google Nano Banana frames, ElevenLabs narration, and Claude-based copywriting to estimate cost price and markup per video token.
        </p>
      </div>
      <TokenPricingCalculator />
      <div className="pt-2">
        <Link href="/admin/pricing/gpu-roi" className="inline-flex">
          <Button variant="secondary">View GPU ROI table</Button>
        </Link>
      </div>
    </div>
  );
}
