# Field User Principal Company & SKU Access Matrix

A role-based governance matrix enabling Organization Admins and Sub-Admins to configure and enforce granular Principal Company SKU access for field personnel (Commission Agents / CFS, Sales Executives, and Distributors) during order generation and catalog browsing.

## User Clarifications & Android Mobile Integration Confirmation

> [!IMPORTANT]
> ### Direct Answer to Client Question: Database Storage & Android App Reflection
> **Yes, absolutely.** All access permissions (`company_scope: string[]`) are stored directly in the centralized persistent database (both **Google Cloud Firestore** under `users/{userId}` and the **Backend Database / REST API**).
> 
> Because the Android mobile app connects to the same backend database via Firestore SDK and REST auth endpoints (`/api/auth/login`, `/api/auth/me`), any permission assigned or revoked by the Admin in the Web Matrix is **immediately reflected on the field agents' Android mobile devices**.

### Confirmed Architectural Decisions:
- **Access Granularity**: Access is granted at the **Principal Company level**, automatically providing access to all SKUs belonging to the assigned company.
- **Default Security Posture**: **Strict Restriction by Default (Zero-Trust)**. Newly created field users or users with unconfigured scopes cannot access any Principal Company SKUs until explicitly granted by an Admin.
- **Interface Placement**: Positioned as a **dedicated primary tab** within the **Master Config — Users & Roles** section (`Field SKU Access Matrix`), harmonized with the existing User Roster, Raiser-to-BE Mapping Matrix, and BE Absence Failover sub-views.
- **Database Persistence & Mobile Sync**: Database-first persistence ensuring Android field agents, web terminals, and backend order validations all operate against the same authoritative source of truth.

---

## 1. Overview & Core Concept

### What It Does
Provides Admin and Sub-Admin users with an intuitive, multi-dimensional matrix interface to assign and revoke field users' access to Principal Companies. Field users (Commission Agents / CFS, Sales Executives, and Distributors) will strictly see, search, and book orders for SKUs belonging exclusively to their assigned Principal Companies.

### Target Audience & Personas
- **Organization Admins & Sub-Admins**: Need quick matrix toggles, bulk actions, and audit visibility across all field reps and partner manufacturers.
- **Commission Agents (CFS)**: Book general trade retail orders on Android mobile terminals strictly for contracted brands.
- **Sales Executives (SE)**: Field representatives operating in assigned territories booking orders for specific manufacturers via Android app / Web.
- **Distributors & Institutional Buyers**: Punch primary orders directly via desktop/mobile portals strictly for their authorized principal brands.

### Key Value Delivered
Eliminates cross-company ordering errors, enforces contractual brand boundaries for multi-tenant and agency field forces, and prevents unauthorized distribution across competing principal manufacturers.

---

## 2. Database Persistence & Android Mobile App Synchronization

### Authoritative Database Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│               Admin / Sub-Admin Web Console (Matrix UI)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Updates User Company Scope
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        CENTRALIZED DATABASE LAYER                       │
│                                                                        │
│  1. Google Cloud Firestore:                                            │
│     Collection: `users`                                                │
│     Document: `users/{userId}`                                         │
│     Fields: {                                                          │
│       id: string,                                                      │
│       name: string,                                                    │
│       role: "COMMISSION_AGENT" | "SALES_EXECUTIVE" | "DISTRIBUTOR",   │
│       company_scope: ["comp_brit", "comp_amul"], // Array of Comp IDs  │
│       updated_at: ISOString                                            │
│     }                                                                  │
│                                                                        │
│  2. Backend REST Service (server.ts & dbService.ts):                   │
│     - PATCH /api/users/:id/company-scope                               │
│     - POST /api/users/batch-company-scope                              │
│     - POST /api/auth/login & GET /api/auth/me (returns company_scope)  │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼ Real-Time Snapshot Listener     ▼ REST API Sync
┌────────────────────────────────────────┐  ┌────────────────────────────┐
│      Android Mobile Field App          │  │ Web Client / Field Portals │
│                                        │  │                            │
│  - Receives live Firestore snapshot    │  │ - Instant reactive state   │
│  - Restricts catalog by company_scope  │  │ - Immediate UI update      │
│  - Zero-Trust: 0 scope = Block punch   │  │ - Zero-Trust enforcement   │
└────────────────────────────────────────┘  └────────────────────────────┘
```

### How Android Mobile App Reflects the Database Values
1. **On Login / Token Verification**:
   - The Android mobile app calls `POST /api/auth/login` or `GET /api/auth/me`.
   - The backend reads the user document from the persistent database and returns:
     ```json
     {
       "success": true,
       "user": {
         "id": "usr_cfs_1",
         "name": "Ramesh Kumar (CFS)",
         "role": "COMMISSION_AGENT",
         "company_scope": ["comp_brit", "comp_amul"]
       }
     }
     ```
   - The Android app stores `company_scope` in local secure session/room storage.
2. **Real-Time Live Updates via Firestore (No Re-login Needed)**:
   - In the Android Kotlin app, a Firestore document snapshot listener:
     ```kotlin
     db.collection("users").document(currentUserId)
       .addSnapshotListener { snapshot, error ->
           if (snapshot != null && snapshot.exists()) {
               val companyScope = snapshot.get("company_scope") as? List<String> ?: emptyList()
               agentSessionManager.updateCompanyScope(companyScope)
               catalogViewModel.filterSkusByCompanies(companyScope)
           }
       }
     ```
   - When the Admin clicks a toggle switch in the Web Matrix, the document is updated in Firestore. The Android device immediately detects the change within milliseconds, updating the SKU catalog in real time without the field agent needing to log out.
3. **Android Order Punch Enforcement**:
   - If `company_scope.isEmpty()`: The Android app renders an access restriction screen: *"No Principal Company SKUs Assigned. Please contact your Organization Admin."* Order placement buttons are completely disabled.
   - If `company_scope` has entries: The SKU catalog and company filters strictly query SKUs matching `sku.company_id IN (company_scope)`.

---

## 3. User Experience & Visual Design (Web Matrix)

### Key User Flows

#### A. Admin Matrix Configuration Flow
1. Admin navigates to **Master Config** $\rightarrow$ **Users & Roles**.
2. Selects the new sub-tab: **Field SKU Access Matrix**.
3. Views the interactive matrix table:
   - **Rows**: All field-tier users (Commission Agents / CFS, Sales Executives, and Distributors) with role badges, mobile numbers, and active beat/territory info.
   - **Columns**: Every registered Principal Company (e.g., Britannia, Amul, Nestle, Paras) with brand codes.
   - **Cells**: Single-click toggle switches with immediate visual feedback (active emerald vs. inactive muted slate).
   - **Quick Action Bar**: "Select All", "Clear All", and batch company grant controls.
4. Changes automatically persist to both the local store and the persistent database (`users` collection in Firestore & `/api/users/:id/company-scope`).

#### B. Field User Order Booking & Catalog Flow (Mobile / Web)
1. When a Commission Agent, Sales Executive, or Distributor enters **Order Booking / Order Capture**:
2. The system checks `user.company_scope`:
   - **Zero Companies Assigned**: Displays a clear, polite restricted-access banner: *"No Principal Company SKUs Assigned. Please contact your Organization Admin to grant SKU catalog access."* The SKU picker and company selectors remain disabled.
   - **Assigned Companies**: Company dropdowns, SKU search bars, category filters, and quick-punch tables strictly filter out all non-assigned manufacturer SKUs.
3. Order validation prevents any manual payload tampering, ensuring only authorized company SKUs can be submitted.

### Visual Identity & Theme
- **Layout Rhythm**: Dense, high-scannability tabular matrix respecting the enterprise dark slate aesthetic (`bg-slate-950` canvas, `bg-slate-900` surfaces, hairline `border-slate-800`).
- **Color Discipline**:
  - Emerald (`text-emerald-400`, `bg-emerald-500/20`, `border-emerald-500/40`) for active company access.
  - Slate / Rose (`text-slate-500`, `bg-slate-800/40`) for restricted/unassigned state.
  - Purple / Blue / Amber badges for user role distinction (`CFS`, `SE`, `Distributor`).
- **Zero-Pill Discipline**: Status counts and metrics use clean, unboxed text with typographic separators (`8 Field Users · 4 Principal Companies · Strict Zero-Trust Enforced`).
- **Tabular Numerals**: Mono figures (`tabular-nums font-mono`) for counts, phone numbers, and company codes.

---

## 4. Key Product Decisions & Trade-Offs

### Decision 1: Company-Level Granularity vs Individual SKU Matrix
- **Chosen Approach**: Company-level assignment (`company_scope: string[]` containing company IDs).
- **Why**: FMCG brand representation in distribution agencies is almost universally contracted at the principal company level. Managing thousands of individual SKU checkboxes creates operational fatigue and high error rates, whereas company-level grants dynamically inherit new SKUs added under that company.
- **Trade-Off**: If a client ever needs to restrict 1 specific SKU out of 50 from Britannia, they would require SKU-level rules later. (Designed with extensibility to support `excluded_sku_ids` if needed in the future).

### Decision 2: Strict Zero-Trust Default vs Permissive Fallback
- **Chosen Approach**: Strict restriction by default (zero companies accessible until explicitly granted).
- **Why**: Confirmed directly by client requirements. Prevents newly onboarded field agents from accidentally booking unvetted products or placing orders for competitor product lines before formal territory orientation.

### Decision 3: Centralized Multi-Target DB Synchronization
- **Chosen Approach**: Dual persistence to Firestore and backend REST server DB.
- **Why**: Ensures native Android mobile apps (using Firestore SDK or REST API), Web portals, and backend verification services always read synchronized access rules.

---

## 5. Technical Implementation Details

### Data Model (`src/types/index.ts`)
```typescript
export interface User {
  // Existing fields...
  role: UserRole;
  company_scope: string[]; // List of Principal Company IDs (comp_brit, comp_amul, etc.)
  // If empty and role is field raiser (COMMISSION_AGENT, SALES_EXECUTIVE, DISTRIBUTOR),
  // user has ZERO SKU access by strict policy.
}
```

### Store Actions & DB Sync (`src/data/store.ts`)
```typescript
updateUserCompanyScope: (userId: string, companyIds: string[]) => {
  // 1. Update in-memory state
  memoryStore.users = memoryStore.users.map(u => 
    u.id === userId ? { ...u, company_scope: companyIds } : u
  );
  persist();

  // 2. Persist to Firestore database
  if (isFirebaseConfigured()) {
    saveRecordToFirestore(COLLECTIONS.USERS, userId, { company_scope: companyIds });
  }

  // 3. Persist to Backend REST API for Android & Web clients
  fetch(`/api/users/${userId}/company-scope`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_scope: companyIds })
  }).catch(err => console.warn('[DB SYNC] Failed to sync company_scope:', err));
}
```

### Backend Endpoints (`server.ts` & `server/dbService.ts`)
- Add `PATCH /api/users/:id/company-scope` to update `company_scope` in persistent JSON database.
- Add `POST /api/users/batch-company-scope` for multi-user matrix saving.
- Include `company_scope` in user authentication and session verification payloads.

### Enforcement Across Order Views
1. **`MobileAgentView.tsx`**:
   - `allowedCompanies = companies.filter(c => (activeAgent.company_scope || []).includes(c.id))`
   - `allowedSkus = skus.filter(s => (activeAgent.company_scope || []).includes(s.company_id))`
   - Render zero-access warning card if `allowedCompanies.length === 0`.
2. **`BEDistributorOrderPunchModal.tsx` & `BEDistributorOrdersView.tsx`**:
   - For distributor users, constrain client company selectors and SKU catalogs to `currentUser.company_scope`.
3. **`OrderCapture.tsx`**:
   - Ensure manual booking by field sales executives adheres to the logged-in user's `company_scope`.

---

## 6. Implementation Steps & Verification Plan

1. **Backend & Data Store Layer**:
   - Add `PATCH /api/users/:id/company-scope` and batch endpoint to `server.ts` and `server/dbService.ts`.
   - Add `updateUserCompanyScope` and `bulkUpdateUserCompanyScopes` to `src/data/store.ts` with Firestore and API sync.
2. **Matrix Component (`CompanySKUAccessMatrix.tsx`)**:
   - Build high-density table grid with sticky headers, role filters, search bar, toggle switches, and "Select All / Deselect All" helpers.
   - Embed into `MasterConfigViews.tsx` as the 4th tab under `type === 'USERS'`.
3. **Enforcement in Field Order Booking**:
   - Update `MobileAgentView.tsx` to filter companies and SKUs against `activeAgent.company_scope`.
   - Update `BEDistributorOrderPunchModal.tsx` to filter by field user's authorized companies.
4. **Verification**:
   - Verify updates persist in Firestore and the backend DB.
   - Test login / session payload returning updated `company_scope`.
   - Test field agent zero-state (0 companies $\rightarrow$ blocked catalog).
   - Test assigning companies $\rightarrow$ immediate unblocking with strictly filtered SKUs.
   - Run `compile_applet` to confirm 0 compilation errors.
