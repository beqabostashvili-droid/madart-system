import type {
  AdminProductView,
  AuditLogView,
  BranchView,
  CatalogView,
  CategoryView,
  ConfirmCashBody,
  CreateBranchBody,
  CreateCategoryBody,
  CreateDeviceBody,
  CreateOrderBody,
  CreateOrderResponse,
  CreateProductBody,
  CreateStationBody,
  CreateUserBody,
  DashboardView,
  DeviceProfile,
  DeviceView,
  DeviceWithTokenView,
  DispatchBoardView,
  DisplayBoardView,
  ImportPreviewView,
  ImportResultView,
  InitiatePaymentBody,
  LoginResponse,
  OrderSummaryView,
  OrderTimelineEntry,
  OrderView,
  Paginated,
  PaymentView,
  PickupSlotsQuoteBody,
  PickupSlotsResponse,
  ProductBranchInput,
  ProductionBoardView,
  ProductionConfigInput,
  ProductionTaskView,
  RefundBody,
  RoleView,
  StationView,
  SystemSettingView,
  UpdateBranchBody,
  UpdateCategoryBody,
  UpdateDeviceBody,
  UpdateProductBody,
  UpdateStationBody,
  UpdateUserBody,
  UserProfile,
  UserView,
} from '@madart/types';
import { Http, type HttpOptions, qs } from './http';

export interface OrdersListParams {
  branchId?: string;
  status?: string;
  awaitingCash?: boolean;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** All REST endpoints of the MADART API, typed with @madart/types. */
export function createApiClient(options: HttpOptions) {
  const http = new Http({ ...options, baseUrl: `${options.baseUrl.replace(/\/$/, '')}/api/v1` });

  return {
    http,
    health: () => fetch(`${options.baseUrl.replace(/\/$/, '')}/health`).then((r) => r.json() as Promise<{ status: string }>),

    auth: {
      login: (email: string, password: string) => http.post<LoginResponse>('/auth/login', { email, password }),
      me: () => http.get<{ kind: 'user'; user: UserProfile } | { kind: 'device'; device: DeviceProfile }>('/auth/me'),
      device: () => http.get<DeviceProfile>('/auth/device'),
    },

    branches: {
      list: () => http.get<BranchView[]>('/branches'),
      adminList: () => http.get<BranchView[]>('/admin/branches'),
      create: (body: CreateBranchBody) => http.post<BranchView>('/admin/branches', body),
      update: (id: string, body: UpdateBranchBody) => http.patch<BranchView>(`/admin/branches/${id}`, body),
    },

    stations: {
      list: (branchId?: string) => http.get<StationView[]>(`/stations${qs({ branchId })}`),
      create: (body: CreateStationBody) => http.post<StationView>('/admin/stations', body),
      update: (id: string, body: UpdateStationBody) => http.patch<StationView>(`/admin/stations/${id}`, body),
    },

    catalog: {
      get: (branchId: string, channel: 'KIOSK' | 'POS' | 'MOBILE', locale: 'ka' | 'en' | 'ru' = 'ka') =>
        http.get<CatalogView>(`/catalog${qs({ branchId, channel, locale })}`),
      categories: () => http.get<CategoryView[]>('/admin/categories'),
      createCategory: (body: CreateCategoryBody) => http.post<CategoryView>('/admin/categories', body),
      updateCategory: (id: string, body: UpdateCategoryBody) => http.patch<CategoryView>(`/admin/categories/${id}`, body),
      products: (params: { search?: string; categoryId?: string; includeArchived?: boolean } = {}) => http.get<AdminProductView[]>(`/admin/products${qs(params)}`),
      product: (id: string) => http.get<AdminProductView>(`/admin/products/${id}`),
      createProduct: (body: CreateProductBody) => http.post<AdminProductView>('/admin/products', body),
      updateProduct: (id: string, body: UpdateProductBody) => http.patch<AdminProductView>(`/admin/products/${id}`, body),
      setProductState: (id: string, state: 'enable' | 'disable' | 'archive') => http.post<AdminProductView>(`/admin/products/${id}/${state}`),
      setProductionConfig: (id: string, body: ProductionConfigInput) => http.put<AdminProductView>(`/admin/products/${id}/production-config`, body),
      setBranchOverride: (id: string, branchId: string, body: ProductBranchInput) => http.put<AdminProductView>(`/admin/products/${id}/branches/${branchId}`, body),
    },

    imports: {
      list: () => http.get<{ id: string; source: string; status: string; summary: unknown; warnings: string[]; createdAt: string; importedAt: string | null }[]>('/admin/catalog-imports'),
      preview: (source: 'MADART_GE' | 'JSON_SNAPSHOT' = 'MADART_GE') => http.post<ImportPreviewView>('/admin/catalog-imports/preview', { source }, { timeoutMs: 60_000 }),
      commit: (importId: string) => http.post<ImportResultView>(`/admin/catalog-imports/${importId}/commit`, {}, { timeoutMs: 60_000 }),
    },

    devices: {
      list: (branchId?: string) => http.get<DeviceView[]>(`/admin/devices${qs({ branchId })}`),
      create: (body: CreateDeviceBody) => http.post<DeviceWithTokenView>('/admin/devices', body),
      update: (id: string, body: UpdateDeviceBody) => http.patch<DeviceView>(`/admin/devices/${id}`, body),
      rotateToken: (id: string) => http.post<DeviceWithTokenView>(`/admin/devices/${id}/rotate-token`),
    },

    users: {
      list: (branchId?: string) => http.get<UserView[]>(`/admin/users${qs({ branchId })}`),
      create: (body: CreateUserBody) => http.post<UserView>('/admin/users', body),
      update: (id: string, body: UpdateUserBody) => http.patch<UserView>(`/admin/users/${id}`, body),
      roles: () => http.get<RoleView[]>('/admin/roles'),
      updateRole: (id: string, body: { name?: string; permissions?: string[] }) => http.patch<RoleView>(`/admin/roles/${id}`, body),
      permissions: () => http.get<string[]>('/admin/permissions'),
    },

    settings: {
      list: (branchId?: string) => http.get<SystemSettingView[]>(`/admin/settings${qs({ branchId })}`),
      upsert: (body: { key: string; value: unknown; branchId?: string | null }) => http.put<SystemSettingView>('/admin/settings', body),
    },

    orders: {
      create: (body: CreateOrderBody) => http.post<CreateOrderResponse>('/orders', body, { timeoutMs: 30_000 }),
      quoteSlots: (body: PickupSlotsQuoteBody) => http.post<PickupSlotsResponse>('/pickup-slots/quote', body),
      track: (qrToken: string) => http.get<OrderView>(`/orders/track/${qrToken}`),
      list: (params: OrdersListParams = {}) => http.get<Paginated<OrderSummaryView>>(`/orders${qs(params)}`),
      get: (id: string) => http.get<OrderView>(`/orders/${id}`),
      byNumber: (branchId: string, publicNumber: string) => http.get<OrderView>(`/orders/by-number/${encodeURIComponent(publicNumber)}${qs({ branchId })}`),
      byQr: (qrToken: string) => http.get<OrderView>(`/orders/by-qr/${qrToken}`),
      cancel: (id: string, reason: string) => http.post<OrderView>(`/orders/${id}/cancel`, { reason }),
      timeline: (id: string) => http.get<OrderTimelineEntry[]>(`/admin/orders/${id}/timeline`),
    },

    payments: {
      initiate: (orderId: string, body: InitiatePaymentBody) => http.post<PaymentView>(`/orders/${orderId}/payments`, body, { timeoutMs: 30_000 }),
      confirmCash: (orderId: string, body: ConfirmCashBody) => http.post<PaymentView>(`/orders/${orderId}/payments/cash-confirm`, body),
      get: (id: string) => http.get<PaymentView>(`/payments/${id}`),
      reconcile: (id: string) => http.post<PaymentView>(`/payments/${id}/reconcile`),
      refund: (id: string, body: RefundBody) => http.post<PaymentView>(`/payments/${id}/refunds`, body),
    },

    production: {
      board: (params: { branchId?: string; stationId?: string } = {}) => http.get<ProductionBoardView>(`/production/board${qs(params)}`),
      start: (taskId: string) => http.post<ProductionTaskView>(`/production/tasks/${taskId}/start`),
      ready: (taskId: string) => http.post<ProductionTaskView>(`/production/tasks/${taskId}/ready`),
    },

    dispatch: {
      board: (branchId?: string) => http.get<DispatchBoardView>(`/dispatch/board${qs({ branchId })}`),
      readyForCustomer: (orderId: string, force = false) => http.post<OrderView>(`/dispatch/orders/${orderId}/ready-for-customer${qs({ force: force || undefined })}`),
      handOver: (orderId: string) => http.post<OrderView>(`/dispatch/orders/${orderId}/handed-over`),
    },

    display: {
      board: (branchId?: string) => http.get<DisplayBoardView>(`/display/board${qs({ branchId })}`),
    },

    reports: {
      dashboard: (branchId?: string) => http.get<DashboardView>(`/admin/dashboard${qs({ branchId })}`),
      audit: (params: { branchId?: string; orderId?: string; action?: string; limit?: number; offset?: number } = {}) => http.get<Paginated<AuditLogView>>(`/admin/audit-logs${qs(params)}`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
