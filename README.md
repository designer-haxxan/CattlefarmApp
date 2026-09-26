# SaleAPP POS

Offline-first, mobile-first Point of Sale as a static PWA (no build step).
HTML5 · ES modules · jQuery · Bootstrap 5 · Bootstrap Icons · IndexedDB · Service Worker · eposwala login API.

## Features

- **POS sales**: search, camera/hardware barcode scan, cart with qty/rate/discount, bill discount, tax, cash/bank/credit/partial payments, change calculation, hold/resume, edit, void, returns, receipt printing. The cart survives page refresh.
- **Purchases**: suppliers, purchase rate, discount, paid/remaining, edit, void, returns. Can update product cost from the latest purchase.
- **Products & categories**: SKU, barcode (scan or generate EAN-13), unit, purchase/sale/wholesale prices, opening/min stock, compressed images, services (no stock).
- **Customers & suppliers**: contact info, opening balance, ledger/statement (print), payments.
- **Accounts / cash book**: cash, bank/wallet, income, expense, asset, liability accounts. Receipts, payments and transfers use double-entry ledger entries.
- **Stock**: current stock, low/out-of-stock, stock ledger per product, adjustments (add/remove/set count) with void.
- **Reports** (print + CSV): daily sales, sales by range, sales/purchase returns, product-wise sales/purchases, customer/supplier ledgers, receivables, payables, cash book, account ledger, daily closing, stock (as of date), profit summary.
- **Backup & restore**: versioned JSON with checksum, validation preview, replace or merge.
- **PWA**: installable, works fully offline after the first online login.

## Architecture

```
index.html              App shell (splash, login, layout)
manifest.json           PWA manifest
service-worker.js       Precache of shell + CDN libs; cache-first; /api/ requests never cached
css/app.css
js/app.js               Boot, auth gate + session expiry, router (lazy-loaded modules), connection badge, SW updates
js/config.js            Login API base URL, support phone, app/schema/backup versions
js/core/                utils, settings (LocalStorage), UI helpers, shared views
js/db/                  IndexedDB wrapper (atomic multi-store transactions) + schema
js/services/            auth, catalog (in-memory search index), posting engine, backup
js/modules/             dashboard, pos (sale + purchase), documents, products, stock, parties, vouchers, accounts, settings, backup
js/reports/             reports
js/printer/             ESC/POS encoder, receipt builder, Bluetooth/RawBT/browser printing
js/scanner/             camera scanning + keyboard-wedge scanner detection
```

### Storage

| Where | What |
|---|---|
| IndexedDB `saleapp_pos` | All business data: products, categories, customers, suppliers, accounts, sales + items, purchases + items, returns, vouchers, **ledger entries**, **stock moves**, adjustments, held sales, audit log, counters |
| LocalStorage | Settings (business profile, tax, prefixes, printer, theme), device preferences, `minipos.session` (`{ token, expiresAt, username }`), `minipos.deviceId`, POS cart drafts |

**Data integrity.** Each operation (sale, purchase, return, voucher, adjustment, edit, void) runs in **one IndexedDB transaction**. That transaction writes:

- the document and its lines
- stock moves and the cached product stock
- balanced double-entry ledger entries (the transaction is refused if they don't balance)
- the invoice counter
- the audit record

Any failure aborts everything. Document IDs are generated when the cart is created, so a double tap or a retry after a refresh is detected as a duplicate instead of saving twice. Invoice numbers (`SALE-000001`…) come from a counter inside the same transaction, backed by a unique index. Failed transactions don't consume numbers.

**Balances and reports are always derived from records.** Customer, supplier and account balances come from ledger entries. Stock-as-of-date comes from stock moves. The cached `product.stock` is updated in the same transaction and can be checked or rebuilt under *Settings → App & data*.

### Authentication

Login uses the eposwala API (`CONFIG.AUTH_API_BASE`, default `https://eposwala.com/api`):

```
POST /api/login   Content-Type: application/json
{ "username": "...", "password": "...", "deviceId": "..." }
2xx  → { "token": "...", "expiresAt": <unix ms>, "username": "..." }
!2xx → { "error": "missing_fields" | "invalid_credentials" | "device_mismatch" | "account_disabled" }
```

- **Login requires internet.** Each error code is shown as a specific message; anything else shows "Login failed. Try again."
- **One device per account.** `deviceId` is a UUID created once per browser and stored in `localStorage["minipos.deviceId"]`. The server binds the account to it, and logging out does not remove the binding. Moving to another phone goes through support (`CONFIG.SUPPORT_PHONE`).
- **Session.** `{ token, expiresAt, username }` is stored verbatim in `localStorage["minipos.session"]`. The POS works offline, including across restarts, until `expiresAt`. When it passes, the app returns to the login screen, both at startup and during use (checked every minute and on every navigation). Passwords are never stored.
- **Logout** only clears the local session; the API has no logout endpoint.
- **Permissions.** The logged-in account is the shop owner and gets every POS function. If the server ever adds a `role` field (`manager` / `cashier`) to the login response, the app's role permissions apply automatically.

### Offline behaviour

- The service worker precaches the shell, every module, icons, CDN libraries and the icon fonts. The app loads with no network at all.
- All POS work (sales, purchases, stock, payments, ledgers, reports, printing, scanning, backup) runs entirely on local data.
- The status badge shows **Online / Offline**.
- The app asks the browser for **persistent storage** so data is not evicted.

## Setup

### 1. Login API

Set `AUTH_API_BASE` and `SUPPORT_PHONE` in `js/config.js` if they differ from the defaults.

**CORS:** `https://eposwala.com/api/login` currently sends no CORS headers. Browsers can therefore only call it from pages served by **https://eposwala.com** itself. To run the app from another origin, including `localhost`, the API must return `Access-Control-Allow-Origin` for that origin and answer the `OPTIONS` preflight with `Access-Control-Allow-Headers: content-type`.

### 2. Run locally

The app needs to be served over HTTP (ES modules and service worker). `localhost` counts as a secure context. Login from `localhost` only works once the API allows that origin (see CORS above).

```bash
python -m http.server 8765
```

Then open http://localhost:8765.

### 3. Deploy

**GitHub Pages:** this repository is served from branch `main`, folder `/ (root)` (*Settings → Pages*), at https://designer-haxxan.github.io/DistERP/. All paths are relative, so the app works from that sub-path. `.nojekyll` makes Pages serve the files unchanged. Login from `github.io` only works once the eposwala API allows the origin `https://designer-haxxan.github.io` (see CORS above).


Host the folder on **https://eposwala.com** (e.g. an IIS site or virtual directory next to `/api`), or on any other HTTPS host once the API allows that origin. **HTTPS is required** for the service worker, camera and Web Bluetooth.

When you change any file, bump `VERSION` in `service-worker.js`. Installed clients will then show an "Update" prompt.

## Backup & restore

- **Export** downloads one JSON file:
  ```json
  { "format", "backupVersion", "appVersion", "schemaVersion", "createdAt", "createdBy", "counts", "checksum", "settings", "data": { ... } }
  ```
  `data` holds every collection. `checksum` is a SHA-256 of the data. No credentials are included.
- **Import** validates everything before any data changes:
  - JSON structure
  - format and backup/schema versions
  - IDs and required fields for each record
  - duplicate records or document numbers
  - record counts against the header (detects truncation)
  - checksum (detects corruption or tampering)
  - ledger balance
  
  You then see the backup date and record counts. You can optionally download a safety backup first, then choose:
  - **Replace**: erases local data and loads the backup. You must type `REPLACE` to confirm. It runs in one transaction, so a failure leaves the existing data untouched.
  - **Merge**: adds missing records and updates records that are newer in the backup. Documents are merged together with their lines, ledger entries and stock moves, so edited documents are never double-counted. Document-number conflicts are skipped and listed. Stock caches are recomputed afterwards.

## Printing & scanning support

| Capability | Where it works | Notes |
|---|---|---|
| Web Bluetooth ESC/POS (58/80 mm) | Chrome/Edge on Android, Windows, macOS, Linux, ChromeOS (HTTPS) | Only **BLE** printers; most cheap "classic Bluetooth SPP" printers are not reachable from browsers. Not available in Safari, Firefox or any iOS browser. Known printer channels are tried first (18F0/2AF1, E781…/BEF8…, ISSC 4953…, FF00/FF02, AE30/AE01, FFE0/FFE1, FEE7/FEC7), then blind discovery. Data goes out in 20-byte chunks by default, with acknowledged writes when the printer supports them (Settings → Transfer speed: 20/100/180 bytes). Connecting retries 3×. The printer reconnects silently via `getDevices()` / `watchAdvertisements()` where supported. Print jobs are queued. |
| RawBT | Android | Free RawBT app bridges ESC/POS data to classic Bluetooth, USB and network printers. |
| Browser print | Everywhere | Uses 58/80 mm receipt CSS; works with AirPrint, system print services and PDF. Also used automatically as a fallback. |
| Urdu receipts | All print methods | Urdu/Arabic text (shop name, products, customers, footer…) is drawn with **Jameel Noori Nastaleeq** (`fonts/`, loaded only for Urdu characters via `unicode-range`). For ESC/POS (Bluetooth/RawBT), only lines that contain Urdu are rasterised and sent as `GS v 0` bitmaps; Latin lines stay as fast printer text. The printer must support `GS v 0` raster images (almost all ESC/POS printers do). Font: "Free of charge for Urdu lovers" (embedding: preview & print). |
| Camera scanning | HTTPS on Android/iOS/desktop | Uses the native `BarcodeDetector` when available (Chrome Android), otherwise lazy-loads `html5-qrcode`. Camera permission errors show guidance and a manual-entry field. |
| Hardware scanners | Everywhere | USB/Bluetooth HID "keyboard wedge" scanners work in the search field and anywhere on the POS screen (fast keystrokes + Enter). |

## Known limitations

- **Data lives on the device.** There is no multi-device cloud sync of POS data. Use backups regularly; the dashboard reminds you after 7 days. To combine data from several devices, give each device different number prefixes (*Settings*) and use **Merge**.
- **Anyone with physical access can read local data.** The offline session gate is client-side. A person with the device and developer tools can read IndexedDB. Use device lock screens.
- **No user management in the app.** Accounts, passwords, device resets and disabling are handled on the eposwala server side. The API has no endpoints for them.
- **Cost of goods sold uses the last purchase price** recorded on each sale line, not FIFO or weighted average.
- **iOS has no Web Bluetooth.** Print via AirPrint or the browser dialog instead.
