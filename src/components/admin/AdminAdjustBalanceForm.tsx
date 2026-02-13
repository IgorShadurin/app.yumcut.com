"use client";

import { FormEvent, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Coins, Loader2 } from 'lucide-react';

interface Props {
  userId: string;
  currentBalance: number;
}

export function AdminAdjustBalanceForm({ userId, currentBalance }: Props) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) {
      toast.error('Enter a non-zero token amount');
      return;
    }
    setSubmitting(true);
    (async () => {
      try {
        await Api.adminAdjustTokens(userId, {
          amount: value,
          reason: reason.trim() ? reason.trim() : undefined,
        });
        toast.success(`Balance updated (${value > 0 ? '+' : ''}${value} tokens)`);
        setAmount('');
        setReason('');
        router.refresh();
      } catch (_) {
        // Api helper already surfaces a toast; swallow error.
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="token-adjust-amount">
          Amount
        </label>
        <Input
          id="token-adjust-amount"
          type="number"
          step="1"
          min="-1000000"
          max="1000000"
          required
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 250 or -75"
          disabled={submitting}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Positive numbers add tokens, negative numbers deduct. Current balance: {currentBalance.toLocaleString()} tokens.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="token-adjust-reason">
          Note (optional)
        </label>
        <Textarea
          id="token-adjust-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason shown in the ledger"
          disabled={submitting}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Coins className="mr-2 h-4 w-4" />
          )}
          {submitting ? 'Applying…' : 'Apply change'}
        </Button>
      </div>
    </form>
  );
}
