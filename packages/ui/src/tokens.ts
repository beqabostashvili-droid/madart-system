import type { OrderStatus, PaymentStatus, ProductionDisplayStatus } from '@madart/domain';

/** Raw colour values (mirror of styles.css) for places CSS classes cannot reach. */
export const colors = {
  brand: '#ffbb00',
  brandDark: '#e6a800',
  ink: '#212529',
  inkMuted: '#6c757d',
  surface: '#ffffff',
  canvas: '#f7f5f0',
  line: '#e8e4dc',
  ok: '#2f855a',
  warn: '#d97706',
  danger: '#c53030',
  info: '#2b6cb0',
} as const;

export interface StatusStyle {
  /** Tailwind classes for a badge/card accent */
  badge: string;
  bar: string;
  hex: string;
  labelKa: string;
  labelEn: string;
}

export const productionStatusStyles: Record<ProductionDisplayStatus, StatusStyle> = {
  SCHEDULED: { badge: 'bg-slate-100 text-slate-700', bar: 'bg-status-scheduled', hex: '#64748b', labelKa: 'დაგეგმილი', labelEn: 'Scheduled' },
  STARTING_SOON: { badge: 'bg-amber-100 text-amber-800', bar: 'bg-status-starting-soon', hex: '#d97706', labelKa: 'მალე იწყება', labelEn: 'Starting soon' },
  START_NOW: { badge: 'bg-blue-100 text-blue-800', bar: 'bg-status-start-now', hex: '#2563eb', labelKa: 'დაიწყე ახლა', labelEn: 'Start now' },
  IN_PRODUCTION: { badge: 'bg-violet-100 text-violet-800', bar: 'bg-status-in-production', hex: '#7c3aed', labelKa: 'მზადდება', labelEn: 'In production' },
  LATE: { badge: 'bg-red-100 text-red-800', bar: 'bg-status-late', hex: '#dc2626', labelKa: 'დაგვიანებული', labelEn: 'Late' },
  READY: { badge: 'bg-green-100 text-green-800', bar: 'bg-status-ready', hex: '#16a34a', labelKa: 'მზადაა', labelEn: 'Ready' },
  CANCELLED: { badge: 'bg-gray-100 text-gray-500', bar: 'bg-status-cancelled', hex: '#9ca3af', labelKa: 'გაუქმებული', labelEn: 'Cancelled' },
};

export const orderStatusStyles: Record<OrderStatus, StatusStyle> = {
  DRAFT: { badge: 'bg-gray-100 text-gray-600', bar: 'bg-gray-300', hex: '#9ca3af', labelKa: 'დრაფტი', labelEn: 'Draft' },
  AWAITING_PAYMENT: { badge: 'bg-amber-100 text-amber-800', bar: 'bg-amber-400', hex: '#d97706', labelKa: 'გადახდის მოლოდინში', labelEn: 'Awaiting payment' },
  PAID: { badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-400', hex: '#059669', labelKa: 'გადახდილი', labelEn: 'Paid' },
  CONFIRMED: { badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', hex: '#059669', labelKa: 'დადასტურებული', labelEn: 'Confirmed' },
  SCHEDULED: { badge: 'bg-slate-100 text-slate-700', bar: 'bg-slate-400', hex: '#64748b', labelKa: 'დაგეგმილი', labelEn: 'Scheduled' },
  IN_PRODUCTION: { badge: 'bg-violet-100 text-violet-800', bar: 'bg-violet-500', hex: '#7c3aed', labelKa: 'მზადდება', labelEn: 'In production' },
  PARTIALLY_READY: { badge: 'bg-indigo-100 text-indigo-800', bar: 'bg-indigo-500', hex: '#4f46e5', labelKa: 'ნაწილობრივ მზადაა', labelEn: 'Partially ready' },
  READY_FOR_ASSEMBLY: { badge: 'bg-cyan-100 text-cyan-800', bar: 'bg-cyan-500', hex: '#0891b2', labelKa: 'ასაწყობია', labelEn: 'Ready for assembly' },
  READY_FOR_PICKUP: { badge: 'bg-green-100 text-green-800', bar: 'bg-green-500', hex: '#16a34a', labelKa: 'მზადაა გასატანად', labelEn: 'Ready for pickup' },
  COMPLETED: { badge: 'bg-gray-100 text-gray-700', bar: 'bg-gray-400', hex: '#6b7280', labelKa: 'დასრულებული', labelEn: 'Completed' },
  CANCELLED: { badge: 'bg-red-100 text-red-800', bar: 'bg-red-400', hex: '#dc2626', labelKa: 'გაუქმებული', labelEn: 'Cancelled' },
  REFUNDED: { badge: 'bg-red-50 text-red-700', bar: 'bg-red-300', hex: '#ef4444', labelKa: 'დაბრუნებული', labelEn: 'Refunded' },
};

export const paymentStatusStyles: Record<PaymentStatus, StatusStyle> = {
  UNPAID: { badge: 'bg-amber-100 text-amber-800', bar: 'bg-amber-400', hex: '#d97706', labelKa: 'გადაუხდელი', labelEn: 'Unpaid' },
  PENDING: { badge: 'bg-blue-100 text-blue-800', bar: 'bg-blue-400', hex: '#2563eb', labelKa: 'მიმდინარე', labelEn: 'Pending' },
  PAID: { badge: 'bg-green-100 text-green-800', bar: 'bg-green-500', hex: '#16a34a', labelKa: 'გადახდილი', labelEn: 'Paid' },
  FAILED: { badge: 'bg-red-100 text-red-800', bar: 'bg-red-500', hex: '#dc2626', labelKa: 'წარუმატებელი', labelEn: 'Failed' },
  PARTIALLY_REFUNDED: { badge: 'bg-orange-100 text-orange-800', bar: 'bg-orange-400', hex: '#ea580c', labelKa: 'ნაწილობრივ დაბრუნებული', labelEn: 'Partially refunded' },
  REFUNDED: { badge: 'bg-gray-100 text-gray-700', bar: 'bg-gray-400', hex: '#6b7280', labelKa: 'დაბრუნებული', labelEn: 'Refunded' },
};

export const sourceLabels: Record<string, string> = {
  KIOSK: 'კიოსკი',
  POS: 'სალარო',
  MOBILE: 'მობილური',
  WOLT: 'Wolt',
  GLOVO: 'Glovo',
  BOLT_FOOD: 'Bolt Food',
  DELIVERY: 'მიტანა',
  API: 'API',
};
