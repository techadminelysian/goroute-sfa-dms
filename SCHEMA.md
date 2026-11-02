# GoRoute Enterprise SFA-DMS: Entity Schema & Data Architecture Specification

> **Target Audience**: AI Agents (including Google Gemini), Software Architects, and Backend/Fullstack Engineers.  
> **Purpose**: Authoritative reference specification to replicate, scaffold, or migrate the complete domain schema, relationships, enums, constraints, and validation rules of the GoRoute FMCG Sales Force Automation (SFA) & Distribution Management System (DMS).

---

## 1. Domain Overview & Multi-Tenancy Architecture

GoRoute is an enterprise-grade multi-tenant B2B Distribution Management System designed for Indian Fast-Moving Consumer Goods (FMCG) distribution networks. It operates across three distributor operating models:
- **C&F (Carrying & Forwarding Agent)**: Warehousing, consignment handling, and stock replenishment.
- **SS (Super Stockist)**: Regional redistribution to sub-stockists and rural distributors.
- **TCD (Traditional Town / City Distributor)**: Urban beat distribution to General Trade (GT), Modern Trade (MT), and Institutions.

### Multi-Tenant Isolation Model
Every database entity (except global system metadata) is strictly scoped to a `tenant_id` foreign key. All reads, mutations, aggregates, and security rules must enforce `where("tenant_id", "==", activeTenantId)`.

```
Tenant (Distributor) [1]
  ├── TenantSettings [1:1]
  ├── Companies (Principals / Manufacturers) [1:N]
  │     └── TradeSchemes [1:N]
  ├── DispatchPoints (Depots / Hubs) [1:N]
  ├── Users & Roles [1:N]
  ├── SKUs (Products & Returnable Crates) [1:N]
  ├── Beats (Sales Routes) [1:N]
  ├── Retailers & Direct Institutions [1:N]
  ├── Orders [1:N]
  │     └── OrderLines [1:N]
  ├── PrinciplePurchaseOrders [1:N]
  │     └── PrinciplePOItems [1:N]
  ├── StockLedgerEntries [1:N]
  ├── Invoices [1:N]
  ├── Payments [1:N]
  │     └── PaymentAllocations [1:N]
  ├── Claims & ClaimsLedgerEntries [1:N]
  ├── ReturnableAssetLedgerEntries [1:N]
  └── WorkflowNotifications [1:N]
```

---

## 2. Global Enums & Value Scales

### 2.1 Tenant & Organization Enums
```typescript
export type TenantType = 'CF' | 'SUPER_STOCKIST' | 'TCD';

export type AccountingSystem = 'ZOHO' | 'TALLY' | 'SAP' | 'CUSTOM' | 'NONE';

export type CompanyRelationship = 'CF' | 'SS' | 'TCD';

export type UserRole = 
  | 'ADMIN'                 // Full system owner & master manager
  | 'SUB_ADMIN'             // Secondary administrative authority
  | 'BILLING'               // Billing Executive (BE) verifying orders & invoicing
  | 'ORDER_PUNCHER'         // Back-office data-entry operator
  | 'DISPATCHER'            // Warehouse / Depot stock manager
  | 'ACCOUNTANT'            // Ledger & payments reconciliation
  | 'COMMISSION_AGENT'      // Commission Agent (CA / CFS) field salesperson
  | 'SALES_EXECUTIVE'       // Sales Executive (SE) field sales representative
  | 'DISTRIBUTOR'           // Direct commercial distributor user account
  | 'DELIVERY_VAN_EXECUTIVE'; // Delivery van logistics executive
```

### 2.2 Channels & Retailer Status
```typescript
export type RetailerChannel = 
  | 'GT'             // General Trade (Kirana, Mom & Pop stores)
  | 'MT'             // Modern Trade (Supermarket chains)
  | 'INSTITUTIONAL'  // Canteens, hotels, hospitals
  | 'ECOMMERCE'      // Online delivery dark stores
  | 'DIRECT'         // Direct consumer / office sales
  | 'DISTRIBUTOR';   // Sub-distributor redistribution

export type RetailerPhaseStatus = 'LEAD' | 'VERIFIED' | 'ACTIVE' | 'BLOCKED';

export type OrderChannel = RetailerChannel;
```

### 2.3 Order Lifecycle & Invoicing
```typescript
export type OrderStatus =
  | 'PENDING_VERIFICATION' // Initial state upon mobile punch
  | 'PUNCHED'              // Verified by agent or office operator
  | 'VERIFIED'             // Passed initial checks
  | 'VERIFIED_BY_BILLING'  // Approved by Billing Executive (BE)
  | 'PO_GENERATED'         // Principal Purchase Order grouped
  | 'PUNCHED_TO_PRINCIPAL' // Transmitted to manufacturer
  | 'PRINCIPAL_DISPATCHED' // In transit from manufacturer
  | 'CLEARED'              // Inwarded & ready for pick-pack
  | 'FLAGGED'              // Held (e.g. credit limit or price gap)
  | 'APPROVED'             // Released from hold
  | 'DISPATCHED'           // Handed over to delivery van
  | 'DELIVERED'            // Store drop completed
  | 'INVOICED'             // Final tax invoice rendered
  | 'CANCELLED';           // Voided

export type OrderInvoicingType = 
  | 'UNREGISTERED_CASH'    // Non-GST cash memo
  | 'REGISTERED_GST';      // Formal B2B Tax Invoice with GSTIN
```

### 2.4 Principle Purchase Order (PO) Status
```typescript
export type POStatus =
  | 'DRAFT'
  | 'RATES_VERIFIED'
  | 'SUBMITTED_TO_PRINCIPLE'
  | 'DISPATCHED_BY_PRINCIPLE'
  | 'INWARDED_AT_DEPOT'
  | 'CANCELLED';
```

### 2.5 Stock Ledger & Dispatch Enums
```typescript
export type StockEntryType = 
  | 'INWARD'               // Depot stock receipt from Principal / Supplier
  | 'DISPATCH_OUT'         // Loading onto delivery vehicle
  | 'ADJUSTMENT_DAMAGE'    // Breakage, leakage, expired stock write-off
  | 'RETURN';              // Store drop rejection returned to depot

export type RecipientType = 
  | 'SUB_DISTRIBUTOR'
  | 'INSTITUTION'
  | 'COMMISSION_AGENT'
  | 'FIELD_SALES_REP'
  | 'DELIVERY_VAN'
  | 'DELIVERY_EXECUTIVE'
  | 'PRINCIPAL_SUPPLIER';

export type AckStatus = 'PENDING' | 'RECEIVED' | 'DISPUTED';

export type AckType = 
  | 'DIGITAL_SIGNATURE' 
  | 'OTP_PIN' 
  | 'PAPER_PHOTO' 
  | 'APP_CONFIRM';
```

### 2.6 Pricing, Schemes & Claims
```typescript
export type SKUType = 'SELLABLE' | 'RETURNABLE_ASSET';

export type TradeSchemeType = 
  | 'PRICE_DIFF'          // Price to Stockist vs Price to Retailer difference
  | 'TRADE_DISCOUNT'      // Flat or percentage discount funded by company
  | 'QPS'                 // Quantity Purchase Scheme (slab bonuses)
  | 'FOC';                // Free of Cost (Buy X Get Y Free)

export type TradeSchemeStatus = 'ACTIVE' | 'INACTIVE';

export type ClaimsLedgerStatus =
  | 'ACCUMULATING'        // Scheme period active; transactions accruing
  | 'CLAIM_FILED'         // Formal statement sent to company
  | 'APPROVED'            // Company auditor accepted figure
  | 'SETTLED'             // Credit note issued or deducted from payment
  | 'REJECTED';           // Claim repudiated by manufacturer

export type ClaimType = 
  | 'SCHEME_MARGIN' 
  | 'DAMAGE_EXPIRY' 
  | 'PRICE_DIFFERENCE' 
  | 'PROMOTIONAL';

export type ClaimStatus = 
  | 'RAISED' 
  | 'SUBMITTED' 
  | 'UNDER_REVIEW' 
  | 'SETTLED' 
  | 'REJECTED';
```

### 2.7 Invoicing, Payments & Returnable Assets
```typescript
export type InvoiceType = 'REGISTERED_GST' | 'CASH_NON_GST';
export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export type PaymentMode = 'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'CASH';

export type AssetMovementType = 'ISSUED' | 'RETURNED' | 'AUDIT_ADJUSTMENT';
export type AssetHolderType = 'AGENT' | 'RETAILER' | 'DISPATCH_POINT';
```

---

## 3. Comprehensive Entity Schema Specifications

### 3.1 `Tenant` (`tenants`)
Represents an independent distribution house / organization.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Unique Tenant ID (PK) | e.g. `tenant_ms_enterprises` |
| `name` | `string` | Yes | Distributor Legal / Trade Name | Minimum 3 characters |
| `type` | `TenantType` | Yes | Distribution business model | `'CF'` \| `'SUPER_STOCKIST'` \| `'TCD'` |
| `logo_url` | `string` | No | Brand logo image URI | Valid URL or path |
| `accent_color`| `string` | Yes | UI accent hex color | e.g. `#1e3a8a` |
| `gstin` | `string` | Yes | 15-character Indian GSTIN | Validated via `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` |
| `address` | `string` | Yes | Principal place of business | Minimum 5 characters |
| `phone` | `string` | Yes | 10-digit Indian Mobile | Validated via `^[6-9]\d{9}$` |
| `email` | `string` | Yes | Official billing email | Valid email format |
| `created_at` | `string` | Yes | ISO 8601 Timestamp | e.g. `2025-01-01T00:00:00.000Z` |

```typescript
export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  logo_url?: string;
  accent_color: string;
  gstin: string;
  address: string;
  phone: string;
  email: string;
  created_at: string;
}
```

---

### 3.2 `TenantSettings` (`tenant_settings`)
System configuration parameters, credit rules, and integration adapters per distributor.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `tenant_id` | `string` | Yes | Foreign key to `Tenant.id` (PK) | 1:1 relationship with Tenant |
| `credit_limit_default` | `number` | Yes | Default credit limit for new stores | Currency in INR (e.g. `50000`) |
| `credit_days_threshold`| `number` | Yes | Max days before invoices are overdue | Integer days (e.g. `14` or `21`) |
| `claim_recoverable_days`| `number`| Yes | Window to file claims with principal| Integer days (e.g. `45` or `60`) |
| `stock_count_frequency` | `string` | Yes | Cycle count audit frequency | `'DAILY'` \| `'WEEKLY'` \| `'BIWEEKLY'` \| `'MONTHLY'` |
| `accounting_integration`| `AccountingSystem`| Yes | Target ERP adapter | `'ZOHO'` \| `'TALLY'` \| `'SAP'` \| `'CUSTOM'` \| `'NONE'` |
| `accounting_sync_status` | `string` | Yes | State of accounting bridge | `'SYNCED'` \| `'PENDING'` \| `'DISCONNECTED'` |
| `enabled_channels` | `OrderChannel[]`| Yes | Channels enabled for ordering | Array of channels |
| `require_stock_gate` | `boolean` | Yes | Hard block order dispatch if 0 stock | Enforces stock ledger validation |

```typescript
export interface TenantSettings {
  tenant_id: string;
  credit_limit_default: number;
  credit_days_threshold: number;
  claim_recoverable_days: number;
  stock_count_frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  accounting_integration: AccountingSystem;
  accounting_sync_status: 'SYNCED' | 'PENDING' | 'DISCONNECTED';
  enabled_channels: OrderChannel[];
  require_stock_gate: boolean;
}
```

---

### 3.3 `Company` (`companies`)
The FMCG Brand / Principal Manufacturer that supplies inventory (e.g. Britannia, Nestle, Parle, Amul).

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key (e.g. `comp_brit`) | Unique string |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `name` | `string` | Yes | Manufacturer Legal Name | e.g. `"Britannia Industries Ltd"` |
| `code` | `string` | Yes | Short alphanumeric code | e.g. `"BRIT"`, `"NEST"`, `"AMUL"` |
| `relationship_type` | `CompanyRelationship` | Yes | Type of dealership | `'CF'` \| `'SS'` \| `'TCD'` |
| `gstin` | `string` | Yes | Company Tax ID | 15-char Indian GSTIN |
| `contact_person`| `string` | Yes | Key account manager | e.g. `"Rajesh Sharma"` |
| `email` | `string` | Yes | Company order submission email | Valid email |
| `phone` | `string` | Yes | Contact phone | 10-digit mobile |
| `dispatch_point_id` | `string` | Yes | FK -> `DispatchPoint.id` | Mandatory assigned warehouse depot (Editable by Admin/Sub-Admin only) |
| `dispatch_point_name` | `string` | No | Cached Dispatch Point Name | e.g. `"Central Warehouse"` |

```typescript
export interface Company {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  relationship_type: CompanyRelationship;
  gstin: string;
  contact_person: string;
  email: string;
  phone: string;
  dispatch_point_id: string; // Mandatory foreign key referencing DispatchPoint
  dispatch_point_name?: string;
}
```

---

### 3.4 `DispatchPoint` (`dispatch_points`)
Physical warehouse, godown, or distribution hub.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key | e.g. `dp_central` |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `name` | `string` | Yes | Depot / Warehouse Name | e.g. `"Central Depot - Okhla"` |
| `code` | `string` | Yes | Short identifier | e.g. `"OKH-01"` |
| `address` | `string` | Yes | Physical location | Full postal address |
| `supervisor_name` | `string` | Yes | Warehouse Manager Name | e.g. `"Suresh Kumar"` |
| `phone` | `string` | Yes | Depot Contact Number | 10-digit phone |
| `dispatcher_user_id`| `string`| No | FK -> `User.id` (Dispatcher) | Maps dispatch supervisor |

```typescript
export interface DispatchPoint {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address: string;
  supervisor_name: string;
  phone: string;
  dispatcher_user_id?: string;
}
```

---

### 3.5 `SKU` (`skus`)
Stock Keeping Unit Master for both Sellable inventory and Returnable transport assets.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | SKU Primary Key | e.g. `sku_goodday_butter_100g` |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `company_id` | `string` | Yes | FK -> `Company.id` | Principal manufacturer |
| `code` | `string` | Yes | Unique SKU code / Barcode | e.g. `"BRIT-GD-001"` |
| `name` | `string` | Yes | Product Description | e.g. `"Good Day Butter Cookies 100g"` |
| `category` | `string` | Yes | Product Category | e.g. `"Biscuits & Bakery"`, `"Beverages"` |
| `hsn_code` | `string` | Yes | Harmonized System of Nomenclature | 4, 6, or 8 digits (e.g. `"1905"`) |
| `mrp` | `number` | Yes | Maximum Retail Price | Currency in INR (e.g. `30`) |
| `landing_price` | `number` | Yes | Purchase Landing Cost / PTS | Price to Stockist (e.g. `23.50`) |
| `selling_price` | `number` | Yes | Base Selling Price / PTR | Price to Retailer (e.g. `26.00`) |
| `pts` | `number` | No | Explicit PTS rate | Defaults to `landing_price` |
| `ptr` | `number` | No | Explicit PTR rate | Defaults to `selling_price` |
| `below_cost_flag`| `boolean`| Yes | Flagged if selling_price < landing_price | Triggers company claim accrual |
| `expected_claim_per_unit` | `number` | Yes | Expected claim value per unit | Derived from PTS - PTR + active scheme |
| `pack_size` | `string` | Yes | Units per corrugated box / case | e.g. `"72 Packs/Case"` |
| `tax_rate` | `number` | Yes | GST Slab Percentage | `0`, `5`, `12`, or `18` |
| `is_claim_eligible` | `boolean` | No | Flag indicating scheme participation | `true` if principal funds trade margin |
| `claim_scheme_id` | `string` | No | FK -> `TradeScheme.schemeId` | Linked active promotional scheme |
| `effective_from` | `string` | No | Scheme start date | ISO 8601 Date (`YYYY-MM-DD`) |
| `effective_to` | `string` | No | Scheme expiration date | ISO 8601 Date (`YYYY-MM-DD`) |
| `sku_type` | `SKUType` | No | SKU Type | `'SELLABLE'` \| `'RETURNABLE_ASSET'` |
| `is_returnable_asset` | `boolean` | No | Set true for crates, pallets, carboys | Bypasses sales GST; tracks in asset ledger |
| `asset_deposit_value`| `number` | No | Security deposit per unit | e.g. `250` for standard milk/bread crate |

```typescript
export interface SKU {
  id: string;
  tenant_id: string;
  company_id: string;
  code: string;
  name: string;
  category: string;
  hsn_code: string;
  mrp: number;
  landing_price: number;
  selling_price: number;
  pts?: number;
  ptr?: number;
  below_cost_flag: boolean;
  expected_claim_per_unit: number;
  pack_size: string;
  tax_rate: number;
  is_claim_eligible?: boolean;
  claim_scheme_id?: string | null;
  effective_from?: string;
  effective_to?: string | null;
  sku_type?: SKUType;
  is_returnable_asset?: boolean;
  asset_deposit_value?: number;
}
```

---

### 3.6 `TradeScheme` (`trade_schemes`)
Promotional schemes funded by manufacturers that accrue trade claims for distributors.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `schemeId` | `string` | Yes | Scheme Primary Key (UUID) | Unique string |
| `schemeName` | `string` | Yes | Scheme Title | e.g. `"Diwali QPS Gold Slab"` |
| `companyId` | `string` | Yes | FK -> `Company.id` | Sponsoring company |
| `schemeType` | `TradeSchemeType` | Yes | Calculation algorithm | `'PRICE_DIFF'` \| `'TRADE_DISCOUNT'` \| `'QPS'` \| `'FOC'` |
| `calculationLogic` | `object` | Yes | Type-specific calculation variables | Detailed in table below |
| `validFrom` | `string` | Yes | Start date | ISO 8601 Date (`YYYY-MM-DD`) |
| `validTo` | `string` | Yes | End date | ISO 8601 Date (`YYYY-MM-DD`) |
| `status` | `TradeSchemeStatus` | Yes | Active status | `'ACTIVE'` \| `'INACTIVE'` |

#### `SchemeCalculationLogic` Sub-Schema
- `priceDifferenceMargin` (`number`): Flat gap compensation per unit.
- `tradeDiscountPercent` (`number`): Percentage discount on PTR (e.g. `5` for 5%).
- `tradeDiscountFlat` (`number`): Flat discount in currency (e.g. `₹2.50/unit`).
- `quantityBonus` (`number`): QPS slab incentive per unit (e.g. `₹5.00`).
- `buyQuantity` (`number`): Threshold required to qualify for FOC/QPS (e.g. `10`).
- `freeQuantity` (`number`): Complimentary units awarded on qualifying buy (e.g. `1`).

```typescript
export interface TradeScheme {
  schemeId: string;
  schemeName: string;
  companyId: string;
  schemeType: TradeSchemeType;
  calculationLogic: {
    priceDifferenceMargin?: number;
    tradeDiscountPercent?: number;
    tradeDiscountFlat?: number;
    quantityBonus?: number;
    buyQuantity?: number;
    freeQuantity?: number;
  };
  validFrom: string;
  validTo: string;
  status: TradeSchemeStatus;
}
```

---

### 3.7 `ClaimsLedgerEntry` (`claims_ledger`) & `Claim` (`claims`)
Accrual ledger document tracking units billed vs. claims owed by principal companies.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `ledgerId` | `string` | Yes | Primary Key (UUID) | Unique document ID |
| `companyId` | `string` | Yes | FK -> `Company.id` | Principal manufacturer owing claim |
| `distributorId` | `string` | Yes | FK -> `Tenant.id` | Claimant distributor |
| `skuId` | `string` | Yes | FK -> `SKU.id` | Product billed |
| `schemeId` | `string` | Yes | FK -> `TradeScheme.schemeId` | Scheme under which claim accrued |
| `periodStart` | `string` | Yes | Billing period start date | ISO 8601 (`YYYY-MM-DD`) |
| `periodEnd` | `string` | Yes | Billing period end date | ISO 8601 (`YYYY-MM-DD`) |
| `unitsSold` | `number` | Yes | Cumulative eligible units billed | Sum of invoice quantities |
| `expectedClaimPerUnit` | `number`| Yes | Rate per unit | Computed from scheme logic |
| `totalExpectedClaim` | `number` | Yes | Total accrued value | `unitsSold * expectedClaimPerUnit` |
| `claimedAmount` | `number` | Yes | Amount formally submitted | Submitted claim value |
| `settledAmount` | `number` | Yes | Amount credited by company | Settled through credit note |
| `status` | `ClaimsLedgerStatus`| Yes | Claims lifecycle status | `'ACCUMULATING'` \| `'CLAIM_FILED'` \| `'APPROVED'` \| `'SETTLED'` \| `'REJECTED'` |
| `creditNoteNumber`| `string` | No | Company Credit Note Identifier | Issued upon financial settlement |
| `createdAt` | `string` | No | Timestamp | ISO 8601 string |
| `updatedAt` | `string` | No | Timestamp | ISO 8601 string |

```typescript
export interface ClaimsLedgerEntry {
  ledgerId: string;
  companyId: string;
  distributorId: string;
  skuId: string;
  schemeId: string;
  periodStart: string;
  periodEnd: string;
  unitsSold: number;
  expectedClaimPerUnit: number;
  totalExpectedClaim: number;
  claimedAmount: number;
  settledAmount: number;
  status: ClaimsLedgerStatus;
  creditNoteNumber?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
```

---

### 3.8 `Beat` (`beats`)
Geographical or route-based customer clustering assigned to a Commission Agent (CA).

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key | e.g. `beat_rohini_sec3` |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `name` | `string` | Yes | Route / Market Name | e.g. `"Rohini Sector 3 & 4 Market"` |
| `code` | `string` | Yes | Alphanumeric Beat Code | e.g. `"ROH-03"` |
| `description` | `string` | No | Narrative territory notes | e.g. `"Mon-Thu weekly cycle"` |
| `assigned_agent_id`| `string` | No | FK -> `User.id` (CA) | Assigned Commission Agent |
| `assigned_agent_name`| `string` | No | Cached Agent Name | e.g. `"Amit Kumar (CA-1)"` |
| `retailer_ids` | `string[]` | Yes | Array of FK -> `Retailer.id` | 1:1 store-to-beat enforcement |
| `is_active` | `boolean` | Yes | Operational status | Active for order booking |
| `created_at` | `string` | No | ISO 8601 string | Timestamp |
| `updated_at` | `string` | No | ISO 8601 string | Timestamp |

```typescript
export interface Beat {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description?: string;
  assigned_agent_id?: string;
  assigned_agent_name?: string;
  retailer_ids: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}
```

---

### 3.9 `Retailer` (`retailers`) & `DistributorInstitution` (`distributors`)
General Trade stores, supermarkets, and institutional buyers.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key | e.g. `ret_sharma_kirana` |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `name` | `string` | Yes | Shop / Enterprise Legal Name | e.g. `"Sharma Kirana Store"` |
| `code` | `string` | Yes | Customer Code | e.g. `"RET-9901"` |
| `channel` | `RetailerChannel`| Yes | Distribution tier | `'GT'` \| `'MT'` \| `'INSTITUTIONAL'` \| `'ECOMMERCE'` \| `'DIRECT'` \| `'DISTRIBUTOR'` |
| `beat_id` | `string` | No | FK -> `Beat.id` | Required for GT; optional for Direct/Institutional |
| `beat_name` | `string` | Yes | Cached Beat Name | e.g. `"Rohini Sector 3"`, `"Direct / Institutional"` |
| `gstin` | `string` | No | Retailer GSTIN | Optional for unorganized GT; validated if present |
| `pan_number` | `string` | No | Tax Identification Number | 10-char PAN |
| `fssai_license` | `string` | No | Food Safety License Number | 14-digit numeric license |
| `email` | `string` | No | Retailer Email | Optional |
| `address` | `string` | Yes | Physical Shop Address | Full street address |
| `city` | `string` | No | City | e.g. `"New Delhi"` |
| `state` | `string` | No | State | e.g. `"Delhi"` |
| `pincode` | `string` | No | 6-digit Indian PIN Code | `^\d{6}$` |
| `contact_person`| `string` | Yes | Proprietor / Store Manager | e.g. `"Ramakant Sharma"` |
| `phone` | `string` | Yes | 10-digit Indian Mobile | Validated via `^[6-9]\d{9}$` |
| `phase_status` | `RetailerPhaseStatus`| Yes | Approval stage | `'LEAD'` \| `'VERIFIED'` \| `'ACTIVE'` \| `'BLOCKED'` |
| `credit_limit` | `number` | Yes | Approved credit ceiling (INR) | e.g. `50000` |
| `credit_days` | `number` | No | Allowed payment credit period | e.g. `14` days |
| `current_outstanding` | `number` | Yes | Running balance owed (INR) | Updated on invoices & payments |
| `dispatch_point_id` | `string` | No | FK -> `DispatchPoint.id` | Preferred servicing depot |
| `crate_custody_balance` | `number` | No | Net crates held in store | Incremented on drop, decremented on return |
| `last_crate_return_date` | `string` | No | Date of last crate pickup | ISO 8601 Date (`YYYY-MM-DD`) |
| `last_crate_issue_date` | `string` | No | Date of last crate delivery | ISO 8601 Date (`YYYY-MM-DD`) |
| `onboarded_by_role` | `string` | No | Role of onboarding user | `'COMMISSION_AGENT'` \| `'BILLING'` \| `'ADMIN'` |
| `onboarded_by_user_id` | `string` | No | FK -> `User.id` | User who onboarded store |
| `created_at` | `string` | No | ISO 8601 timestamp | Document creation date |

```typescript
export interface Retailer {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  channel: RetailerChannel;
  beat_name: string;
  beat_id?: string;
  gstin?: string | null;
  pan_number?: string | null;
  fssai_license?: string | null;
  email?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  contact_person: string;
  phone: string;
  phase_status: RetailerPhaseStatus;
  credit_limit: number;
  credit_days?: number | null;
  dispatch_point_id?: string | null;
  current_outstanding: number;
  onboarded_by_role?: string | null;
  onboarded_by_user_id?: string | null;
  crate_custody_balance?: number;
  last_crate_return_date?: string | null;
  last_crate_issue_date?: string | null;
  created_at?: string;
}
```

---

### 3.10 `Order` & `OrderLine` (`orders`)
Primary commercial transaction entity in the system.

#### `OrderLine` Sub-Entity
| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Line Item Primary Key | Unique string |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `order_id` | `string` | Yes | FK -> `Order.id` | Parent order reference |
| `sku_id` | `string` | Yes | FK -> `SKU.id` | Product reference |
| `sku_name` | `string` | Yes | Cached Product Name | e.g. `"Good Day Butter 100g"` |
| `quantity` | `number` | Yes | Demanded Quantity by CA | Integer units (e.g. `24`) |
| `verified_quantity` | `number` | No | Quantity confirmed by Billing | Set by BE during verification |
| `is_amended` | `boolean` | No | Flag indicating cut in qty | True if `verified_quantity < quantity` |
| `unit_price` | `number` | Yes | Selling Price per Unit (PTR) | Billed rate |
| `landing_price` | `number` | Yes | Cost price per Unit (PTS) | Inventory purchase cost |
| `total` | `number` | Yes | Line gross total | `(verified_quantity ?? quantity) * unit_price` |
| `discount_percentage` | `number` | No | Slab trade discount % | e.g. `2.5` |
| `discount_amount` | `number` | No | Absolute line discount | Subtracted from gross |
| `is_below_cost` | `boolean` | Yes | True if unit_price < landing_price | Triggers leakage alert / claim |
| `expected_claim_total` | `number`| Yes | Claim accrual for this line | `max(0, landing_price - unit_price) * qty` |
| `company_id` | `string` | No | FK -> `Company.id` | Sponsoring company |
| `company_name` | `string` | No | Cached Company Name | e.g. `"Britannia"` |

#### `Order` Entity Header
| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key | e.g. `ord_174000123` |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `order_number` | `string` | Yes | Formatted Human Order # | e.g. `"SO-2025-0891"` |
| `channel` | `OrderChannel` | Yes | Order distribution channel | GT, MT, Institutional |
| `company_id` | `string` | Yes | Primary Principal Company ID | FK -> `Company.id` |
| `company_ids` | `string[]` | No | Multi-company orders | Array of Company IDs |
| `retailer_id` | `string` | Yes | FK -> `Retailer.id` | Customer ID (nullable only during quick draft) |
| `retailer_name_raw` | `string` | Yes | Store name snapshot | e.g. `"Sharma Kirana Store"` |
| `beat_id` | `string` | No | FK -> `Beat.id` | Route under which order was taken |
| `beat_name` | `string` | Yes | Route name snapshot | e.g. `"Rohini Sector 3"` |
| `dispatch_point_id` | `string` | Yes | FK -> `DispatchPoint.id` | Fulfillment depot assigned via Principal Company (`Company.dispatch_point_id`) |
| `billing_executive_id`| `string` | No | FK -> `User.id` (BE) | Verification desk assigned via Many-to-One mapping from Order Raiser (CFS / SE / Distributor) |
| `order_source_role` | `string` | No | Raiser role category | `'COMMISSION_AGENT'` \| `'SALES_EXECUTIVE'` \| `'DISTRIBUTOR'` \| `'BE_DIRECT'` |
| `order_raiser_name` | `string` | No | Cached name of raiser | e.g. `"Vikram Mehta (SE)"`, `"Apex Distributors"` |
| `created_by_user_id`| `string` | Yes | FK -> `User.id` (Raiser/Puncher)| User who placed/punched order |
| `commission_agent_id`| `string`| No | FK -> `User.id` (CA) | Commission Agent credited (null for SE/Distributor direct orders) |
| `commission_agent_name`| `string`| No | Cached Agent Name | e.g. `"Amit Kumar (CA-1)"` |
| `order_date` | `string` | Yes | Date order was placed | ISO 8601 (`YYYY-MM-DD`) |
| `delivery_date` | `string` | Yes | Scheduled delivery date | ISO 8601 (`YYYY-MM-DD`) |
| `status` | `OrderStatus` | Yes | Order lifecycle state | State machine governed |
| `total_amount` | `number` | Yes | Net payable order amount | Post-amendment total with tax |
| `original_total_amount`| `number`| No | Pre-amendment total amount | Original value before BE edit |
| `tax_amount` | `number` | Yes | Total GST amount (CGST+SGST/IGST)| Calculated from line GST rates |
| `lines` | `OrderLine[]` | Yes | Array of ordered line items | At least 1 item required |
| `has_below_cost_lines`| `boolean`| Yes | Flag set if any line below cost| Requires supervisor sign-off |
| `credit_limit_exceeded`| `boolean`| No | True if exposure > limit | `(outstanding + total) > credit_limit` |
| `exposure_variance` | `number` | No | Amount over approved limit | e.g. `₹4,250 over limit` |
| `approved_credit_limit_snapshot` | `number` | No | Limit at time of validation | Audit snapshot |
| `retailer_outstanding_snapshot` | `number` | No | Outstanding at time of punch | Audit snapshot |
| `be_approval_reason`| `string` | No | Justification for credit override| e.g. `"Cheque #9921 deposited in bank"` |
| `verified_by_user_id`| `string` | No | FK -> `User.id` (BE) | Billing Executive who approved |
| `verified_at` | `string` | No | Timestamp of verification | ISO 8601 string |
| `is_locked` | `boolean` | No | Edit lock flag | Locked once verified by BE |
| `order_invoicing_type`| `OrderInvoicingType`| No | Tax vs Cash memo classification| Set by BE upon approval |
| `crates_issued` | `number` | No | Number of delivery crates dispatched | Increments asset ledger |
| `crates_returned` | `number` | No | Empty crates retrieved from retailer | Decrements asset ledger |

```typescript
export interface Order {
  id: string;
  tenant_id: string;
  order_number: string;
  channel: OrderChannel;
  company_id: string;
  company_ids?: string[];
  retailer_id: string | null;
  retailer_name_raw: string;
  beat_id?: string;
  beat_name: string;
  dispatch_point_id: string;
  billing_executive_id?: string | null;
  order_source_role?: 'COMMISSION_AGENT' | 'SALES_EXECUTIVE' | 'DISTRIBUTOR' | 'BE_DIRECT' | string;
  order_raiser_name?: string;
  created_by_user_id: string;
  commission_agent_id?: string | null;
  commission_agent_name?: string;
  order_date: string;
  delivery_date: string;
  status: OrderStatus;
  total_amount: number;
  original_total_amount?: number;
  tax_amount: number;
  lines: OrderLine[];
  has_below_cost_lines: boolean;
  credit_limit_exceeded?: boolean;
  exposure_variance?: number;
  approved_credit_limit_snapshot?: number;
  retailer_outstanding_snapshot?: number;
  be_approval_reason?: string | null;
  verified_by_user_id?: string | null;
  verified_at?: string | null;
  cancelled_reason?: string | null;
  is_locked?: boolean;
  order_invoicing_type?: OrderInvoicingType | null;
  crates_issued?: number;
  crates_returned?: number;
}
```

---

### 3.11 `PrinciplePurchaseOrder` & `PrinciplePOItem` (`purchase_orders`)
Consolidated bulk replenishment order placed by Distributor to Principal Manufacturer.

```typescript
export interface PrinciplePOItem {
  sku_id: string;
  sku_code: string;
  sku_name: string;
  pack_size: string;
  total_quantity: number;
  demanded_quantity?: number;
  purchase_price: number;
  total_amount: number;
  verified_rate: boolean;
  is_rate_verified?: boolean;
}

export interface PrinciplePurchaseOrder {
  id: string;
  po_number: string;
  tenant_id: string;
  company_id: string;
  company_name: string;
  company_code: string;
  status: POStatus;
  created_at: string;
  submitted_at?: string | null;
  dispatched_at?: string | null;
  inwarded_at?: string | null;
  items: PrinciplePOItem[];
  total_quantity: number;
  total_amount: number;
  linked_order_ids: string[];
  transporter_lr_no?: string | null;
  vehicle_no?: string | null;
  depot_id?: string;
}
```

---

### 3.12 `StockLedgerEntry` (`stock_ledger`)
Immutable inventory transaction ledger ensuring full physical accountability and zero leakage.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key (UUID) | Unique string |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `dispatch_point_id` | `string` | Yes | FK -> `DispatchPoint.id` | Depot where stock physically moved |
| `company_id` | `string` | No | FK -> `Company.id` | Sponsoring company |
| `sku_id` | `string` | Yes | FK -> `SKU.id` | Product moved |
| `entry_type` | `StockEntryType`| Yes | Direction of movement | `'INWARD'` \| `'DISPATCH_OUT'` \| `'ADJUSTMENT_DAMAGE'` \| `'RETURN'` |
| `quantity` | `number` | Yes | Quantity moved | Positive integer |
| `expected_quantity` | `number` | No | Inward challan expected qty | Compared against actual to flag variance |
| `variance_quantity` | `number` | No | Difference between actual & expected | Shortage or excess |
| `variance_reason` | `string` | No | Physical inspection notes | e.g. `"Carton torn during transit"` |
| `reference_doc_type`| `string` | Yes | Source transaction voucher | `'ORDER'` \| `'INWARD_CHALLAN'` \| `'AUDIT'` \| `'GATE_PASS'` |
| `reference_doc_id` | `string` | Yes | Document identifier | e.g. `"SO-2025-0891"` or `"LR-99120"` |
| `vehicle_number` | `string` | No | Delivery vehicle registration | e.g. `"DL 1L AA 4092"` |
| `recipient_type` | `RecipientType` | No | Entity receiving stock | E.g. `'COMMISSION_AGENT'`, `'DELIVERY_VAN'` |
| `recipient_id` | `string` | No | Identifier of receiver | FK -> `User.id` or `Retailer.id` |
| `recipient_name` | `string` | No | Name of receiver | e.g. `"Amit Kumar (CA-1)"` |
| `linked_order_id` | `string` | No | FK -> `Order.id` | Linked commercial order |
| `timestamp` | `string` | Yes | Event timestamp | ISO 8601 string |
| `performed_by_user_id`| `string`| Yes | FK -> `User.id` (Dispatcher)| User posting transaction |
| `dispatcher_name` | `string` | No | Cached Dispatcher Name | e.g. `"Suresh Kumar"` |
| `notes` | `string` | Yes | Audit remarks | Free text |
| `ack_status` | `AckStatus` | No | Digital proof confirmation status | `'PENDING'` \| `'RECEIVED'` \| `'DISPUTED'` |
| `ack_type` | `AckType` | No | Method of handover proof | `'DIGITAL_SIGNATURE'` \| `'OTP_PIN'` \| `'PAPER_PHOTO'` \| `'APP_CONFIRM'` |
| `ack_by_user_name` | `string` | No | Name of person acknowledging | e.g. `"Ramakant Sharma (Proprietor)"` |
| `ack_timestamp` | `string` | No | Handover timestamp | ISO 8601 string |
| `proof_image_url` | `string` | No | URI of stamped challan photo | Stored document image |
| `signature_svg` | `string` | No | Vector SVG string of signature | Touchpad digital signature |
| `dispute_reason` | `string` | No | Receiver dispute explanation | e.g. `"2 packs damaged"` |

```typescript
export interface StockLedgerEntry {
  id: string;
  tenant_id: string;
  dispatch_point_id: string;
  company_id?: string;
  sku_id: string;
  entry_type: StockEntryType;
  quantity: number;
  expected_quantity?: number;
  variance_quantity?: number;
  variance_reason?: string;
  reference_doc_type: 'ORDER' | 'INWARD_CHALLAN' | 'AUDIT' | 'TRANSFER_NOTE' | 'GATE_PASS';
  reference_doc_id: string;
  vehicle_number?: string;
  recipient_type?: RecipientType;
  recipient_id?: string;
  recipient_name?: string;
  linked_order_id?: string;
  timestamp: string;
  performed_by_user_id: string;
  dispatcher_name?: string;
  notes: string;
  ack_status?: AckStatus;
  ack_type?: AckType;
  ack_by_user_name?: string;
  ack_timestamp?: string;
  proof_image_url?: string;
  signature_svg?: string;
  dispute_reason?: string;
}
```

---

### 3.13 `Invoice` (`invoices`)
Legal tax invoice generated from verified sales orders.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key | e.g. `inv_2025_001` |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `invoice_number` | `string` | Yes | Legal GST Invoice Series # | e.g. `"INV-2025-0812"` |
| `invoice_type` | `InvoiceType` | Yes | Tax document classification | `'REGISTERED_GST'` \| `'CASH_NON_GST'` |
| `order_id` | `string` | Yes | FK -> `Order.id` | Source order (1:1 relationship) |
| `company_id` | `string` | Yes | FK -> `Company.id` | Principal brand supplier |
| `retailer_id` | `string` | Yes | FK -> `Retailer.id` | Bill-to customer |
| `retailer_name` | `string` | Yes | Customer name snapshot | e.g. `"Sharma Kirana Store"` |
| `dispatch_point_id` | `string` | Yes | FK -> `DispatchPoint.id` | Servicing depot |
| `subtotal` | `number` | Yes | Taxable base amount (INR) | Sum of line taxable values |
| `cgst` | `number` | Yes | Central GST amount | 50% of GST on intra-state sales |
| `sgst` | `number` | Yes | State GST amount | 50% of GST on intra-state sales |
| `igst` | `number` | Yes | Integrated GST amount | Full GST on inter-state sales |
| `total_amount` | `number` | Yes | Final invoice payable total | `subtotal + cgst + sgst + igst` |
| `paid_amount` | `number` | Yes | Cumulative amount settled | Updated by matched payments |
| `status` | `InvoiceStatus` | Yes | Receivables status | `'UNPAID'` \| `'PARTIAL'` \| `'PAID'` \| `'OVERDUE'` |
| `invoice_date` | `string` | Yes | Invoice generation date | ISO 8601 (`YYYY-MM-DD`) |
| `due_date` | `string` | Yes | Credit payment deadline | `invoice_date + credit_days` |
| `is_locked` | `boolean` | No | Finalized lock | Cannot be altered once synced |
| `e_way_bill_no` | `string` | No | Government E-Way Bill Number | Required if value > ₹50,000 |
| `irn_no` | `string` | No | E-Invoice Invoice Reference Number | 64-char hash for B2B e-invoicing |
| `zoho_synced` | `boolean` | No | Synchronized with accounting | Synced flag |

```typescript
export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  order_id: string;
  company_id: string;
  retailer_id: string | null;
  retailer_name: string;
  dispatch_point_id: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_amount: number;
  paid_amount: number;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string;
  is_locked?: boolean;
  verified_by?: string;
  verified_at?: string;
  e_way_bill_no?: string;
  irn_no?: string;
  zoho_synced?: boolean;
}
```

---

### 3.14 `Payment` & `PaymentAllocation` (`payments`)
Cash and digital payment collections applied against outstanding retailer invoices.

```typescript
export interface PaymentAllocation {
  invoice_id: string;       // FK -> Invoice.id
  invoice_number: string;   // e.g. "INV-2025-0812"
  amount: number;           // Amount allocated against this invoice
}

export interface Payment {
  id: string;
  tenant_id: string;
  payment_number: string;   // e.g. "PAY-2025-0491"
  retailer_id: string | null;
  retailer_name: string;
  amount: number;
  payment_mode: PaymentMode; // 'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'CASH'
  reference_number: string;  // UTR / UPI Ref / Cheque # / Cash Memo #
  payment_date: string;      // ISO 8601 Date
  matched_invoice_id: string | null;
  allocations?: PaymentAllocation[];
  status: 'VERIFIED' | 'PENDING' | 'FLAGGED' | 'REJECTED';
  collector_name?: string;   // e.g. "Agent Amit Kumar"
  proof_url?: string;        // Payment screenshot / deposit slip
  flag_reason?: string | null;
  bank_name?: string | null;
  cash_status?: 'IN_SAFE' | 'BANKED';
  notes?: string;
}
```

---

### 3.15 `ReturnableAssetLedgerEntry` (`returnable_asset_ledger`)
Custody tracking for physical transport assets (bread crates, beverage crates, milk tubs, pallets).

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key | e.g. `asset_log_001` |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `asset_sku_id` | `string` | Yes | FK -> `SKU.id` | Returnable asset SKU |
| `asset_name` | `string` | Yes | Item Description | e.g. `"Standard Plastic Crate"` |
| `holder_type` | `AssetHolderType`| Yes | Entity holding asset | `'AGENT'` \| `'RETAILER'` \| `'DISPATCH_POINT'` |
| `holder_id` | `string` | Yes | FK -> `User.id` or `Retailer.id` | ID of custodian |
| `holder_name` | `string` | Yes | Name of custodian | e.g. `"Sharma Kirana Store"` |
| `movement_type` | `AssetMovementType`| Yes| Direction of custody | `'ISSUED'` (debit) \| `'RETURNED'` (credit) \| `'AUDIT_ADJUSTMENT'` |
| `quantity` | `number` | Yes | Number of crates | Integer quantity |
| `dispatch_point_id` | `string` | No | FK -> `DispatchPoint.id` | Originating depot |
| `linked_order_id` | `string` | No | FK -> `Order.id` | Order during which crates were exchanged |
| `linked_order_number`| `string` | No | Order Human # | e.g. `"SO-2025-0891"` |
| `timestamp` | `string` | Yes | Movement timestamp | ISO 8601 string |
| `recorded_by_user_id`| `string`| Yes | FK -> `User.id` | Operator who logged custody |
| `running_balance` | `number` | Yes | Net crates in custody post-event | Calculated running total |
| `notes` | `string` | No | Remarks | Audit notes |

#### Returnable Asset Business Constants
```typescript
export const CRATE_AGING_WARNING_DAYS = 10;   // Amber alert if crates held > 10 days
export const CRATE_AGING_CRITICAL_DAYS = 15;  // Red alert if crates held > 15 days
export const CRATE_HIGH_DEFICIT_THRESHOLD = 30; // Max unreturned crate threshold
export const DEFAULT_CRATE_DEPOSIT_VALUE = 250; // ₹250 refundable deposit value
```

---

### 3.16 `User` (`users`) & `AuthSession` (`auth_sessions`)
Internal team members, field agents, dispatchers, and billing executives.

| Field | Type | Required | Description | Constraints & Business Rules |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Primary Key | e.g. `usr_admin_prashant` |
| `tenant_id` | `string` | Yes | FK -> `Tenant.id` | Multi-tenant isolation |
| `name` | `string` | Yes | Full Name | e.g. `"Yash Sharma"`, `"Prashant Vasu"` |
| `email` | `string` | No | Work Email | Valid email address |
| `mobile_number` | `string` | Yes | 10-digit Indian Mobile (Login ID)| Primary login identifier (`^[6-9]\d{9}$`) |
| `password_hash` | `string` | Yes | SHA-256 / PBKDF2 hash | Salted password hash |
| `salt` | `string` | Yes | Cryptographic salt | Unique per user |
| `role` | `UserRole` | Yes | System Role | `'ADMIN'` \| `'SUB_ADMIN'` \| `'BILLING'` \| `'ORDER_PUNCHER'` \| `'DISPATCHER'` \| `'ACCOUNTANT'` \| `'COMMISSION_AGENT'` \| `'SALES_EXECUTIVE'` \| `'DISTRIBUTOR'` \| `'DELIVERY_VAN_EXECUTIVE'` |
| `company_scope` | `string[]` | Yes | Allowed Company IDs | Empty array `[]` implies unrestricted access |
| `dispatch_point_id` | `string` | No | FK -> `DispatchPoint.id` | Depot assignment for DISPATCHER only; `null` for COMMISSION_AGENT (Commission Agents have zero Dispatch Point association) |
| `beat_id` | `string` | No | FK -> `Beat.id` | Primary assigned beat for CA |
| `assigned_beat_ids` | `string[]` | No | Array of Beat IDs | 1 CA -> N Beats relationship |
| `billing_executive_id`| `string`| No | FK -> `User.id` (BE) | Fixed Many:1 Order Raiser to BE mapping. Applies to Commission Agents (CFS), Sales Executives, and Distributors |
| `platform` | `string` | Yes | Primary client interface | `'WEB'` (Desktop) \| `'MOBILE'` (Field handheld) |
| `is_active` | `boolean` | Yes | Employment status | Inactive accounts cannot authenticate |
| `crate_custody_balance`| `number`| No | Crates in van custody | Tracked for delivery van agents |
| `last_login_at` | `string` | No | Timestamp | ISO 8601 string |

```typescript
export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  mobile_number?: string;
  password_hash?: string;
  salt?: string;
  role: UserRole;
  company_scope: string[];
  dispatch_point_id: string | null;
  beat_id?: string | null;
  beat_name?: string | null;
  assigned_beat_ids?: string[];
  billing_executive_id?: string | null;
  platform: 'WEB' | 'MOBILE';
  is_active?: boolean;
  crate_custody_balance?: number;
  last_crate_return_date?: string | null;
  last_crate_issue_date?: string | null;
  last_login_at?: string;
}

export interface AuthSession {
  token: string;
  user: User;
  expires_at: string;
}
```

---

### 3.17 `WorkflowNotification` (`workflow_notifications`)
Real-time operational alerts for credit blocks, order cuts, PO dispatches, and warehouse receipts.

```typescript
export type NotificationType =
  | 'VERIFIED_PARALLEL_ALERT'
  | 'PO_SUBMITTED'
  | 'PRINCIPLE_DISPATCH'
  | 'INWARD_COMPLETED'
  | 'OUTWARD_ALLOCATED'
  | 'ORDER_CANCELLED_CREDIT_LIMIT'
  | 'ORDER_AMENDED_PARTIAL_APPROVAL'
  | 'ORDER_VERIFIED_LOCKED';

export interface WorkflowNotification {
  id: string;
  timestamp: string;
  created_at?: string;
  tenant_id?: string;
  title: string;
  message: string;
  type: NotificationType;
  target_roles: (UserRole | 'ALL')[];
  target_user_id?: string;
  related_entity_id?: string;
  related_entity_type?: 'ORDER' | 'PURCHASE_ORDER' | 'STOCK_LEDGER';
  order_id?: string;
  order_number?: string;
  retailer_name?: string;
  company_name?: string;
  is_read?: boolean;
  metadata?: Record<string, any>;
}
```

---

## 4. Entity Relationship Reference Matrix

| Source Entity | Foreign Key Field | Target Entity | Cardinality | Business Constraint / Invariant |
| :--- | :--- | :--- | :--- | :--- |
| `TenantSettings` | `tenant_id` | `Tenant.id` | 1:1 | Strict 1:1; initialized upon tenant creation |
| `Company` | `tenant_id` | `Tenant.id` | N:1 | Company masters are isolated per distributor tenant |
| `DispatchPoint` | `tenant_id` | `Tenant.id` | N:1 | Depots belong to a tenant |
| `SKU` | `tenant_id` | `Tenant.id` | N:1 | Product masters belong to a tenant |
| `SKU` | `company_id` | `Company.id` | N:1 | Every SKU is produced by exactly one company |
| `SKU` | `claim_scheme_id`| `TradeScheme.schemeId`| N:1 | Optional active promotional scheme |
| `TradeScheme` | `companyId` | `Company.id` | N:1 | Schemes are sponsored and settled by a manufacturer |
| `ClaimsLedgerEntry`| `companyId` | `Company.id` | N:1 | Accruals aggregate against sponsoring manufacturer |
| `ClaimsLedgerEntry`| `skuId` | `SKU.id` | N:1 | Rate gaps calculated from product master |
| `Beat` | `tenant_id` | `Tenant.id` | N:1 | Beats are isolated per distributor |
| `Beat` | `assigned_agent_id`| `User.id` | N:1 | 1 CA handles 1 to N beats |
| `Retailer` | `beat_id` | `Beat.id` | N:1 | In General Trade, 1 store belongs to strictly 1 beat |
| `User / Distributor` | `billing_executive_id`| `User.id (BE)` | Many:1 | Order raisers (Commission Agents, Sales Executives, Distributors) map Many-to-One to a designated Billing Executive for order verification |
| `Order` | `retailer_id` | `Retailer.id` | N:1 | Order updates retailer's running outstanding balance |
| `Order` | `dispatch_point_id` | `DispatchPoint.id`| N:1 | Fixed fulfillment depot assigned via Principal Company (`Company.dispatch_point_id`) |
| `OrderLine` | `order_id` | `Order.id` | N:1 | Cascade deletes with parent order |
| `OrderLine` | `sku_id` | `SKU.id` | N:1 | Prices validated against landing & selling prices |
| `StockLedgerEntry` | `sku_id` | `SKU.id` | N:1 | Depletes or increments physical depot balance |
| `StockLedgerEntry` | `linked_order_id` | `Order.id` | N:1 | Tied to dispatch gate pass |
| `Invoice` | `order_id` | `Order.id` | 1:1 | Billed upon BE verification & warehouse clearance |
| `PaymentAllocation`| `invoice_id` | `Invoice.id` | N:1 | Decrements invoice's remaining `unpaid_amount` |
| `ReturnableAsset` | `holder_id` | `Retailer.id` / `User.id`| N:1 | Independent custody ledger outside sales revenue |

---

## 5. Critical Domain Invariants & Calculation Rules

### 5.1 Hard Credit Limit Check Formula
When an order is punched:
```
Projected Exposure = Current Retailer Outstanding + New Order Gross Total
If Projected Exposure > Approved Credit Limit:
  Order.status = 'FLAGGED'
  Order.credit_limit_exceeded = true
  Order.exposure_variance = Projected Exposure - Approved Credit Limit
  Action: Requires explicit BE reason string (e.g. PDC Cheque Received) before verification.
```

### 5.2 Below-Cost Selling & Claim Accrual Rule
```
Base Margin Gap = Landing Price (PTS) - Selling Price (PTR)
If Selling Price < Landing Price OR SKU.is_claim_eligible == true:
  Line.is_below_cost = true
  Line.expected_claim_total = Base Margin Gap * Verified Quantity
  ClaimsLedgerEntry.unitsSold += Verified Quantity
  ClaimsLedgerEntry.totalExpectedClaim += Line.expected_claim_total
```

### 5.3 Returnable Crate Custody Invariant
```
Crate Net Balance = Sum(ISSUED) - Sum(RETURNED)
Warning Trigger: Crate unreturned for >= 10 Days
Critical Trigger: Crate unreturned for >= 15 Days
Valuation: Default Deposit of ₹250 / crate applied if lost or unreturned.
```

---

## 6. Seed Record Example Payload (Ready for AI Model Ingestion)

```json
{
  "tenant": {
    "id": "tenant_ms_enterprises",
    "name": "MS Enterprises (Delhi Hub)",
    "type": "TCD",
    "gstin": "07AAAAA0000A1Z5",
    "phone": "9810012345",
    "email": "admin@msenterprises.in",
    "accent_color": "#1e3a8a",
    "address": "B-42, Industrial Area Phase II, Okhla, New Delhi - 110020",
    "created_at": "2025-01-01T00:00:00.000Z"
  },
  "company": {
    "id": "comp_brit",
    "tenant_id": "tenant_ms_enterprises",
    "name": "Britannia Industries Ltd",
    "code": "BRIT",
    "relationship_type": "CF",
    "gstin": "07AAACB1234A1Z1",
    "contact_person": "Rajesh Sharma",
    "email": "orders.delhi@britannia.com",
    "phone": "9810123456"
  },
  "sku": {
    "id": "sku_brit_gd_100",
    "tenant_id": "tenant_ms_enterprises",
    "company_id": "comp_brit",
    "code": "BRIT-GD-001",
    "name": "Good Day Butter Cookies 100g",
    "category": "Biscuits & Bakery",
    "hsn_code": "1905",
    "mrp": 30.00,
    "landing_price": 23.50,
    "selling_price": 26.00,
    "pts": 23.50,
    "ptr": 26.00,
    "below_cost_flag": false,
    "expected_claim_per_unit": 0.00,
    "pack_size": "72 Packs/Case",
    "tax_rate": 18,
    "is_claim_eligible": false,
    "sku_type": "SELLABLE"
  },
  "retailer": {
    "id": "ret_sharma",
    "tenant_id": "tenant_ms_enterprises",
    "name": "Sharma Kirana Store",
    "code": "RET-001",
    "channel": "GT",
    "beat_name": "Rohini Sector 3",
    "beat_id": "beat_rohini_sec3",
    "gstin": "07AAAAA1111A1Z1",
    "address": "Shop 12, Main Market, Sector 3, Rohini",
    "city": "New Delhi",
    "pincode": "110085",
    "contact_person": "Ramakant Sharma",
    "phone": "9810011111",
    "phase_status": "ACTIVE",
    "credit_limit": 50000,
    "credit_days": 14,
    "current_outstanding": 12450,
    "crate_custody_balance": 4
  },
  "user": {
    "id": "usr_admin_yash",
    "tenant_id": "tenant_ms_enterprises",
    "name": "Yash Sharma",
    "email": "yashsharma@msenterprises.in",
    "mobile_number": "9810099888",
    "role": "ADMIN",
    "platform": "WEB",
    "is_active": true
  }
}
```

---

## 7. Migration & Code Generation Prompt Template for Gemini

To replicate this schema in another framework or database, pass this file to the AI Agent with the following directive:

> *"Generate the [PostgreSQL DDL / Prisma Schema / Drizzle Schema / Firestore Security Rules] corresponding to the exact models, primary keys, foreign key constraints, enums, and validation invariants defined in `SCHEMA.md`."*
