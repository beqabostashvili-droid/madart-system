import type { Locale } from '@madart/domain';
import { Button, Card, Input } from '@madart/ui';
import { useState } from 'react';
import { t } from '../i18n';

export function PairingScreen({ onToken, locale, error }: { onToken: (t: string) => void; locale: Locale; error?: string }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-8">
      <Card className="w-full max-w-lg space-y-4 p-8">
        <div className="text-2xl font-bold">{t(locale, 'pairing')}</div>
        <p className="text-ink-muted">{t(locale, 'pairingHint')}</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="eyJhbGciOi…" />
        <Button block size="lg" disabled={!value.trim()} onClick={() => onToken(value.trim())}>
          OK
        </Button>
      </Card>
    </div>
  );
}
