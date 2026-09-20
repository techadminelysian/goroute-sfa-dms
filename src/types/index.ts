export type TenantType = 'CF' | 'SUPER_STOCKIST' | 'TCD';

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

export type AccountingSystem = 'ZOHO' | 'TALLY' | 'SAP' | 'CUSTOM' | 'NONE';

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

export type CompanyRelationship = 'CF' | 'SS' | 'TCD';

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
}

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

export type SKUType = 'SELLABLE' | 'RETURNABLE_ASSET';

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
  pts?: number; // Price to Stockist / Distributor Purchase Price
  ptr?: number; // Price to Retailer / Base Selling Price
  below_cost_flag: boolean;
  expected_claim_per_unit: number;
  pack_size: string;
  tax_rate: number; // 0, 5, 12, 18
  is_claim_eligible?: boolean;
  claim_scheme_id?: string | null;
  effective_from?: string;
  effective_to?: string | null;
  sku_type?: SKUType;
  is_returnable_asset?: boolean;
  asset_deposit_value?: number;
}

/**
 * SKU Master entity interface with pricing and trade claim eligibility
 */
export interface SKUMaster {
  skuId: string; // UUID primary key
  productName: string;
  pts: number; // Price to Stockist / Distributor Purchase Price
  ptr: number; // Price to Retailer / Base Selling Price
  isClaimEligible: boolean; // Flag to determine claim participation
  claimSchemeId?: string | null; // Foreign key referencing trade scheme
  effectiveFrom: string; // ISO 8601 Date / Timestamp (e.g. 'YYYY-MM-DD')
  effectiveTo?: string | null; // ISO 8601 Date / Timestamp or null if active indefinitely
}

/**
 * Trade Scheme Types for FMCG Distributor Claims Calculation
 */
export type TradeSchemeType = 'PRICE_DIFF' | 'TRADE_DISCOUNT' | 'QPS' | 'FOC';

export type TradeSchemeStatus = 'ACTIVE' | 'INACTIVE';

/**
 * Calculation parameters specific to the scheme type
 */
export interface SchemeCalculationLogic {
  priceDifferenceMargin?: number; // Margin rate or flat difference for PRICE_DIFF
  tradeDiscountPercent?: number; // Discount percentage (e.g. 5 for 5%)
  tradeDiscountFlat?: number; // Flat discount per unit in currency (e.g. ₹10)
  quantityBonus?: number; // QPS bonus amount per unit (e.g. ₹5/unit on bulk slab)
  buyQuantity?: number; // Threshold quantity for QPS or FOC (e.g. Buy 10)
  freeQuantity?: number; // Free units given for FOC (e.g. Get 1 Free)
}

/**
 * Trade Scheme Configuration Master
 */
export interface TradeScheme {
  schemeId: string; // UUID primary key
  schemeName: string; // Scheme title (e.g. "Summer QPS Oil Bonanza")
  companyId: string; // Foreign key referencing company/manufacturer
  schemeType: TradeSchemeType; // Enum: PRICE_DIFF | TRADE_DISCOUNT | QPS | FOC
  calculationLogic: SchemeCalculationLogic; // Type-specific calculation variables
  validFrom: string; // ISO 8601 Date string (YYYY-MM-DD)
  validTo: string; // ISO 8601 Date string (YYYY-MM-DD)
  status: TradeSchemeStatus; // Enum: ACTIVE | INACTIVE
}

/**
 * Claims Ledger Lifecycle Status
 */
export type ClaimsLedgerStatus =
  | 'ACCUMULATING'
  | 'CLAIM_FILED'
  | 'APPROVED'
  | 'SETTLED'
  | 'REJECTED';

/**
 * Claims Ledger Collection Document Interface
 *
 * Tracks expected vs. claimed vs. settled claims per SKU, per company, per distributor across a specific period.
 * Claims accrue during the active scheme period and are settled via company credit note.
 *
 * Relationships:
 * - companyId -> companies collection document ID
 * - distributorId -> tenants / distributors collection document ID
 * - skuId -> SKUMaster (sku_master) document ID
 * - schemeId -> TradeScheme (trade_schemes) document ID
 *
 * Recommended Firestore Composite Indexes:
 * - (companyId ASC, distributorId ASC, periodStart ASC, periodEnd ASC) -> for company period queries
 * - (distributorId ASC, status ASC, periodStart DESC) -> for distributor claims overview
 * - (schemeId ASC, status ASC) -> for scheme-level reconciliation
 */
export interface ClaimsLedgerEntry {
  ledgerId: string; // Primary key (UUID / string)
  companyId: string; // Foreign key referencing Company
  distributorId: string; // Foreign key referencing Distributor / Tenant
  skuId: string; // Foreign key referencing SKU Master
  schemeId: string; // Foreign key referencing Trade Scheme
  periodStart: string; // Scheme billing period start date (ISO 8601: YYYY-MM-DD)
  periodEnd: string; // Scheme billing period end date (ISO 8601: YYYY-MM-DD)
  unitsSold: number; // Cumulative eligible units sold to retailers in the period
  expectedClaimPerUnit: number; // Claim rate per unit derived from scheme & rate gap
  totalExpectedClaim: number; // unitsSold * expectedClaimPerUnit
  claimedAmount: number; // Total amount officially filed in claim submission
  settledAmount: number; // Total amount approved & settled by company
  status: ClaimsLedgerStatus; // Current lifecycle status
  creditNoteNumber?: string | null; // Optional credit note issued by principal company upon settlement
  createdAt?: string; // Document creation timestamp (ISO 8601)
  updatedAt?: string; // Last update timestamp (ISO 8601)
}

/**
 * Type alias for ClaimsLedger
 */
export type ClaimsLedger = ClaimsLedgerEntry;

/**
 * Summary metrics of claims grouped by FMCG manufacturer / company
 */
export interface CompanyClaimSummary {
  companyId: string;
  companyName?: string;
  totalExpected: number; // Sum of all totalExpectedClaim
  totalClaimed: number; // Sum of all claimedAmount
  totalSettled: number; // Sum of all settledAmount
  pendingAmount: number; // totalExpected - totalSettled (or claimedAmount - settledAmount based on status)
  unclaimedAccrual?: number; // totalExpected - claimedAmount
  activeClaimCount?: number; // Number of open/unsettled claims
}

/**
 * Single item in an aging report breakdown
 */
export interface ClaimAgingBucketItem {
  companyId: string;
  companyName?: string;
  bucket: string; // e.g. "0-30 Days", "31-60 Days", "61-90 Days", "90+ Days"
  amount: number; // Outstanding pending claim amount in this age bracket
  claimCount?: number; // Number of claims falling in this bucket
}

/**
 * Line item in a Sales Invoice processed for claims accrual
 */
export interface InvoiceLineItemInput {
  skuId: string; // Foreign key referencing SKU Master
  quantity: number; // Quantity billed to retailer
  unitPrice: number; // Selling rate billed on invoice
}

/**
 * Sales Invoice input payload for distributor claim processing
 */
export interface SalesInvoice {
  invoiceId: string; // Unique Invoice identifier
  distributorId: string; // Distributor / Tenant ID raising the invoice
  lineItems: InvoiceLineItemInput[]; // Array of billed products
  invoiceDate: string; // ISO 8601 date string (e.g. 'YYYY-MM-DD')
  companyId?: string; // Optional principal company ID
}

/**
 * Result details for a single line item evaluated during invoice processing
 */
export interface AccruedLineItemResult {
  skuId: string;
  productName?: string;
  quantity: number;
  isClaimEligible: boolean;
  schemeId?: string | null;
  schemeName?: string;
  schemeType?: TradeSchemeType;
  priceDifference: number; // max(0, pts - ptr)
  activeDiscount: number; // Discount component per unit
  expectedClaimPerUnit: number; // (pts - ptr) + activeDiscount
  totalLineClaim: number; // quantity * expectedClaimPerUnit
  ledgerId?: string; // Claims ledger entry ID updated/inserted
  reason?: string; // e.g. "Eligible - Accrued to active period", "Skipped - Normal SKU"
}

/**
 * Summary result returned by processSalesInvoice
 */
export interface ClaimAccrualResult {
  success: boolean;
  invoiceId: string;
  distributorId: string;
  totalEligibleUnits: number;
  totalAccruedAmount: number;
  accruedItemsCount: number;
  skippedItemsCount: number;
  processedItems: AccruedLineItemResult[];
  accruedLedgerEntries: ClaimsLedgerEntry[];
  message: string;
  error?: string;
}

export type RetailerChannel = 'GT' | 'MT' | 'INSTITUTIONAL' | 'ECOMMERCE' | 'DIRECT' | 'DISTRIBUTOR';
export type RetailerPhaseStatus = 'LEAD' | 'VERIFIED' | 'ACTIVE' | 'BLOCKED';
export type DistributorChannel = 'DISTRIBUTOR' | 'INSTITUTIONAL';

export interface DistributorInstitution {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  channel: DistributorChannel;
  beat_name?: string; // 'Direct / Institutional (No Beat)'
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
  created_at?: string;
  updated_at?: string;
  notes?: string | null;
}

export interface Beat {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description?: string;
  assigned_agent_id?: string;
  assigned_agent_name?: string;
  retailer_ids: string[]; // collection of retailers in this beat (1:1 enforced)
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Retailer {
  id: string; // nullable in orders if quick punch
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
  crate_custody_balance?: number; // Running balance of standard crates held
  last_crate_return_date?: string | null; // ISO 8601 or YYYY-MM-DD
  last_crate_issue_date?: string | null;
  created_at?: string;
}

export type OrderChannel = 'GT' | 'MT' | 'INSTITUTIONAL' | 'ECOMMERCE' | 'DIRECT' | 'DISTRIBUTOR';
export type OrderStatus =
  | 'PENDING_VERIFICATION'
  | 'PUNCHED'
  | 'VERIFIED'
  | 'VERIFIED_BY_BILLING'
  | 'PO_GENERATED'
  | 'PUNCHED_TO_PRINCIPAL'
  | 'PRINCIPAL_DISPATCHED'
  | 'CLEARED'
  | 'FLAGGED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'INVOICED'
  | 'CANCELLED';

export interface PrinciplePOItem {
  sku_id: string;
  sku_code: string;
  sku_name: string;
  pack_size: string;
  total_quantity: number;
  demanded_quantity?: number;
  purchase_price: number; // Master purchase price / landing price
  master_landing_price?: number;
  total_amount: number;
  verified_rate: boolean;
  is_rate_verified?: boolean;
}

export type POStatus =
  | 'DRAFT'
  | 'RATES_VERIFIED'
  | 'SUBMITTED_TO_PRINCIPLE'
  | 'DISPATCHED_BY_PRINCIPLE'
  | 'INWARDED_AT_DEPOT'
  | 'CANCELLED';

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
  source_order_ids?: string[];
  notes?: string;
  gate_verified_by?: string;
  transporter_lr_no?: string | null;
  vehicle_no?: string | null;
  depot_id?: string;
}

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
  target_user_id?: string; // Target specific CA / user for push alerts
  related_entity_id?: string;
  related_entity_type?: 'ORDER' | 'PURCHASE_ORDER' | 'STOCK_LEDGER';
  order_id?: string;
  order_number?: string;
  retailer_name?: string;
  company_name?: string;
  is_read?: boolean;
  metadata?: Record<string, any>;
}

export interface OrderLine {
  id: string;
  tenant_id: string;
  order_id: string;
  sku_id: string;
  sku_name: string;
  quantity: number; // Ordered quantity by CA
  verified_quantity?: number; // Quantity verified / amended by Billing Executive
  is_amended?: boolean; // Flag set if verified_quantity < quantity
  unit_price: number;
  landing_price: number;
  total: number;
  discount_percentage?: number;
  discount_amount?: number;
  principal_discount_slab?: string;
  is_below_cost: boolean;
  expected_claim_total: number;
  company_id?: string;
  company_name?: string;
}

export type OrderInvoicingType = 'UNREGISTERED_CASH' | 'REGISTERED_GST';

export interface Order {
  id: string;
  tenant_id: string;
  order_number: string;
  channel: OrderChannel;
  company_id: string;
  company_ids?: string[];
  retailer_id: string | null; // Nullable for quick unverified punch
  retailer_name_raw: string;
  beat_id?: string;
  beat_name: string;
  dispatch_point_id: string; // Mapped DP ID (Fixed assignment from CA)
  billing_executive_id?: string | null; // Mapped BE ID (Fixed assignment from CA)
  created_by_user_id: string;
  commission_agent_id?: string | null;
  commission_agent_name?: string;
  order_date: string;
  delivery_date: string;
  status: OrderStatus;
  total_amount: number;
  original_total_amount?: number; // Pre-amendment total amount
  tax_amount: number;
  lines: OrderLine[];
  has_below_cost_lines: boolean;
  
  // Credit limit validation & BE verification
  credit_limit_exceeded?: boolean; // True if (Current Outstanding + New Order Gross) > Retailer Credit Limit
  exposure_variance?: number; // Amount exceeded beyond approved credit limit
  approved_credit_limit_snapshot?: number;
  retailer_outstanding_snapshot?: number;
  be_approval_reason?: string | null; // e.g. "Post-dated cheque received #88192"
  verified_by_user_id?: string | null;
  verified_at?: string | null;
  cancelled_reason?: string | null;
  is_locked?: boolean; // Locked once verified by BE, preventing CA edits or deletions

  // Order invoicing classification marked by BE upon verification
  order_invoicing_type?: OrderInvoicingType | null;

  exception_flag?: string | null;
  exception_comment?: string | null;
  source_type?: 'GT_AGENT' | 'OFFICE_STAFF' | 'APP_DIRECT_IMPORT' | 'BE_DIRECT';
  notes?: string;
  is_direct_be_order?: boolean;
  company_discount_slabs?: Record<string, { company_id: string; company_name: string; slab_name: string; discount_percent: number }>;
  crates_issued?: number;
  crates_returned?: number;
}

export type StockEntryType = 'INWARD' | 'DISPATCH_OUT' | 'ADJUSTMENT_DAMAGE' | 'RETURN';
export type RecipientType = 'SUB_DISTRIBUTOR' | 'INSTITUTION' | 'COMMISSION_AGENT' | 'FIELD_SALES_REP' | 'DELIVERY_VAN' | 'DELIVERY_EXECUTIVE' | 'PRINCIPAL_SUPPLIER';
export type AckStatus = 'PENDING' | 'RECEIVED' | 'DISPUTED';
export type AckType = 'DIGITAL_SIGNATURE' | 'OTP_PIN' | 'PAPER_PHOTO' | 'APP_CONFIRM';

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

export type InvoiceType = 'REGISTERED_GST' | 'CASH_NON_GST';
export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

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

export type ClaimType = 'SCHEME_MARGIN' | 'DAMAGE_EXPIRY' | 'PRICE_DIFFERENCE' | 'PROMOTIONAL';
export type ClaimStatus = 'RAISED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'SETTLED' | 'REJECTED';

export interface Claim {
  id: string;
  tenant_id: string;
  claim_number: string;
  company_id: string;
  company_name: string;
  sku_id: string;
  sku_name: string;
  invoice_id: string;
  claim_type: ClaimType;
  quantity: number;
  rate_per_unit: number;
  claim_amount: number;
  status: ClaimStatus;
  raised_date: string;
  submitted_date: string | null;
  settled_date: string | null;
  is_leakage_flagged: boolean; // Auto flagged if selling price < landing price with no matching claim within window
}

export type PaymentMode = 'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'CASH';

export interface PaymentAllocation {
  invoice_id: string;
  invoice_number: string;
  amount: number;
}

export interface Payment {
  id: string;
  tenant_id: string;
  payment_number: string;
  retailer_id: string | null;
  retailer_name: string;
  amount: number;
  payment_mode: PaymentMode;
  reference_number: string; // UTR / UPI Ref / Cheque # / Cash Receipt #
  payment_date: string;
  matched_invoice_id: string | null;
  allocations?: PaymentAllocation[];
  status: 'VERIFIED' | 'PENDING' | 'FLAGGED' | 'REJECTED';
  collector_name?: string; // e.g. 'Agent Amit Kumar', 'Institutional Direct', 'Office Staff'
  proof_url?: string; // e.g. 'UPI_Screenshot_Ref_90123.png'
  flag_reason?: string | null;
  bank_name?: string | null;
  cash_status?: 'IN_SAFE' | 'BANKED';
  notes?: string;
}

export type UserRole = 'ADMIN' | 'BILLING' | 'ORDER_PUNCHER' | 'DISPATCHER' | 'ACCOUNTANT' | 'AGENT';

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  mobile_number?: string;
  password_hash?: string;
  salt?: string;
  role: UserRole;
  company_scope: string[]; // empty means all companies
  dispatch_point_id: string | null;
  beat_id?: string | null; // Primary assigned FMCG Beat
  beat_name?: string | null;
  assigned_beat_ids?: string[]; // Multiple beats assigned (1 CA -> N Beats)
  billing_executive_id?: string | null; // Fixed mapping: CA -> Billing Executive (Many-to-One)
  platform: 'WEB' | 'MOBILE';
  is_active?: boolean;
  crate_custody_balance?: number; // Running balance of standard crates held in transit/van
  last_crate_return_date?: string | null;
  last_crate_issue_date?: string | null;
  last_login_at?: string;
}

export interface AuthSession {
  token: string;
  user: User;
  expires_at: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: User;
  error?: string;
  locked_until?: string;
}

export interface PasswordResetRequestResponse {
  success: boolean;
  message: string;
  sms_sent: boolean;
  masked_mobile?: string;
  dev_sms_token?: string; // Provided in dev preview for ease of testing
}

export interface PasswordResetConfirmResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface AdminResetUserPasswordResponse {
  success: boolean;
  message?: string;
  new_password?: string;
  user?: Partial<User>;
  error?: string;
}

/**
 * Returnable Asset (Crate / Empties) Ledger Model
 * Tracks physical custody independently of sales revenue & GST
 */
export type AssetMovementType = 'ISSUED' | 'RETURNED' | 'AUDIT_ADJUSTMENT';
export type AssetHolderType = 'AGENT' | 'RETAILER' | 'DISPATCH_POINT';

export interface ReturnableAssetLedgerEntry {
  id: string; // ledger_entry_id (PK)
  tenant_id: string;
  asset_sku_id: string; // FK -> SKU
  asset_name: string; // Default: 'Standard Crate'
  holder_type: AssetHolderType; // 'AGENT' (Commission Agent) | 'RETAILER' | 'DISPATCH_POINT'
  holder_id: string; // FK -> User.id or Retailer.id or DispatchPoint.id
  holder_name: string;
  movement_type: AssetMovementType; // 'ISSUED' (debit custody) | 'RETURNED' (credit custody)
  quantity: number;
  dispatch_point_id?: string | null; // FK -> DispatchPoint
  linked_order_id?: string | null; // FK -> Order (when issued/returned during delivery)
  linked_order_number?: string | null;
  timestamp: string; // ISO 8601
  recorded_by_user_id: string;
  recorded_by_user_name?: string;
  running_balance: number; // Snapshot balance after this entry
  notes?: string;
}

// Business Rules & Aging Thresholds for Crates
export const CRATE_AGING_WARNING_DAYS = 10;
export const CRATE_AGING_CRITICAL_DAYS = 15;
export const CRATE_HIGH_DEFICIT_THRESHOLD = 30;
export const DEFAULT_CRATE_DEPOSIT_VALUE = 250; // ₹250 standard nominal value per crate

// Application UI Theme Type
export type AppTheme = 'light' | 'dark';

// Mobile UI Language Type
export type AppLanguage = 'en' | 'hi';

