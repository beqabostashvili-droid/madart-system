import type { OrderStatus, PaymentStatus, ProductionDisplayStatus } from '@madart/domain';
import { Badge, cx } from './components';
import { orderStatusStyles, paymentStatusStyles, productionStatusStyles } from './tokens';

export function OrderStatusBadge({ status, lang = 'ka', className }: { status: OrderStatus; lang?: 'ka' | 'en'; className?: string }) {
  const s = orderStatusStyles[status];
  return <Badge className={cx(s.badge, className)}>{lang === 'ka' ? s.labelKa : s.labelEn}</Badge>;
}

export function PaymentStatusBadge({ status, lang = 'ka', className }: { status: PaymentStatus; lang?: 'ka' | 'en'; className?: string }) {
  const s = paymentStatusStyles[status];
  return <Badge className={cx(s.badge, className)}>{lang === 'ka' ? s.labelKa : s.labelEn}</Badge>;
}

export function ProductionStatusBadge({ status, lang = 'ka', className }: { status: ProductionDisplayStatus; lang?: 'ka' | 'en'; className?: string }) {
  const s = productionStatusStyles[status];
  return <Badge className={cx(s.badge, className)}>{lang === 'ka' ? s.labelKa : s.labelEn}</Badge>;
}
