# Hardware Integration

All device access goes through `packages/hardware-adapters`. Business logic in
the API and the POS/Kiosk apps depends on the interfaces only; MVP ships mock
implementations. Phase 9 adds real adapters when the provider is chosen.

## Adapters

| Interface | Used by | Mock |
|---|---|---|
| `PaymentTerminalAdapter` | API `PaymentsService` | `MockPaymentTerminalAdapter` – async callback after `MOCK_TERMINAL_DELAY_MS`; declines totals ending in `99` tetri (A-10); supports `queryStatus`, `cancel`, `refund` |
| `ReceiptPrinterAdapter` | POS / Kiosk (local) | `MockReceiptPrinterAdapter` – logs the document |
| `CashDrawerAdapter` | POS | `MockCashDrawerAdapter` |
| `BarcodeScannerAdapter`, `QRScannerAdapter` | POS | emitter mocks; real scanners usually act as keyboards (POS also accepts typed numbers) |

## Adding a bank terminal

1. Implement `PaymentTerminalAdapter` in `packages/hardware-adapters/src/<bank>.ts`.
   * `initiate` → send amount to the terminal, return the bank's transaction id as `providerReference`.
   * The terminal bridge (or bank webhook) must call `POST /api/v1/payments/:id/callback` with `providerReference`, `result`, and a `signature`.
   * `verifyCallback` must validate the signature/HMAC – the callback route is public.
   * `queryStatus` must be authoritative; the API calls it on reconnect/timeout.
2. Register it in `PaymentsService` behind `PAYMENT_TERMINAL_PROVIDER`.
3. Never persist PAN/track data. Only masked PAN, auth code and provider references (spec §37).

## Receipts

`ReceiptDocument` covers fiscal and non-fiscal receipts with QR payload
(`MADART:<number>:<qrToken>`). Printing happens on the device (Electron
preload can bridge to a local printer SDK); the API only supplies the data.

## Terminal/printer offline

Adapters throw `TerminalUnavailableError` (code `TERMINAL_OFFLINE`); the API
marks the payment FAILED with that code and the kiosk offers cash. Health of
the terminal is exposed in `GET /health` (`paymentTerminal`).
