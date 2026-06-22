# Server-to-Server Payments (Inflow)

Integration with Inflow's [server-to-server payments API](https://docs.inflowpay.com/docs/server-to-server-payments).
Card details are collected on our own frontend and processed entirely through
Inflow's API, giving us full checkout control.

> **Prerequisite:** S2S payments must be enabled on the Inflow account.

## Configuration

Credentials are read from the environment (never committed). Set these before
serving requests:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `INFLOW_API_KEY` | Yes | – | Secret API key (`inflow_prod_…`), sent as `X-Inflow-Api-Key`. |
| `INFLOW_CARD_BASE_URL` | No | `https://api-card.inflowpay.com` | PCI-scoped host that receives card data. |
| `INFLOW_API_BASE_URL` | No | `https://api.inflowpay.xyz` | Host for confirmation and status. |
| `INFLOW_3DS_SUCCESS_URL` | No | – | Default 3-D Secure success redirect. |
| `INFLOW_3DS_FAILURE_URL` | No | – | Default 3-D Secure failure redirect. |

Per-currency minimums and the network timeout live in `config/config.php`
under the `inflow` key.

## Database

Run the updated `sql/schema.sql` to create the `payments` table. It mirrors
each payment locally for reconciliation. **Raw card data (PAN, CVC, expiry) is
never stored** — only the last four digits are kept.

## Endpoints

All endpoints require an authenticated dashboard session. The `POST` endpoints
also require a valid `X-CSRF-Token` header (the page's `csrf-token` meta tag),
consistent with the rest of the app.

### `POST /api/payments`

Creates a payment. Example body:

```json
{
  "products": [{ "name": "Pro plan", "price": 4999, "quantity": 1 }],
  "currency": "EUR",
  "customerEmail": "customer@example.com",
  "billingCountry": "FR",
  "purchasingAsBusiness": false,
  "firstName": "Ada",
  "lastName": "Lovelace",
  "autoConfirm": false,
  "card": { "number": "4242424242424242", "expMonth": 12, "expYear": 2030, "cvc": "123" }
}
```

Notes:
- `price` is in minor units (cents). The total must meet the per-currency
  minimum (EUR €1.50 / USD $2.00).
- `postalCode` is required when `billingCountry` is `US`.
- `businessName` and `taxId` are required when `purchasingAsBusiness` is true.
- Omit `card` and set `useCustomerPaymentMethod: true` to charge the customer's
  most recently saved card.
- Include `firstName`/`lastName` to improve 3-D Secure success rates.

Success (`201`) returns the payment, including `threeDsSessionUrl` when bank
authentication is required:

```json
{ "success": true, "payment": { "id": "pay_abc123", "status": "INITIATION", "threeDsSessionUrl": null } }
```

### `POST /api/payments/confirm?id={paymentId}`

Confirms a payment after 3-D Secure (or when `depositStatus` indicates
confirmation is needed). Not required when the payment was created with
`autoConfirm: true`.

### `GET /api/payments/status?id={paymentId}`

Returns the current state of a payment. Prefer webhooks over polling for
production status updates.

## Payment flow

1. **Create** — `POST /api/payments` with customer, product and card details.
2. **3-D Secure** — if `threeDsSessionUrl` is returned, redirect the customer
   to complete bank authentication; they return to the success/failure URLs.
3. **Confirm** — `POST /api/payments/confirm?id=…` after 3DS (skip if
   `autoConfirm`).
4. **Verify** — `GET /api/payments/status?id=…` or a webhook listener.
