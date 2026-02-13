"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface AdminBackButtonProps {
  href?: string;
  label?: string;
  className?: string;
}

export function AdminBackButton({ href = '/admin', label = 'Back to dashboard', className }: AdminBackButtonProps) {
  return (
    <div className={className}>
      <Button asChild variant="secondary" size="sm" className="gap-2">
        <Link href={href}>
          <ArrowLeft className="h-4 w-4" />
          <span>{label}</span>
        </Link>
      </Button>
    </div>
  );
}
