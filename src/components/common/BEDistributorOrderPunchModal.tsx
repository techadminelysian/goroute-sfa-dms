import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../data/store';
import { Company, SKU, Retailer, DistributorInstitution, Order, OrderLine, OrderInvoicingType } from '../../types';
import {
  Building2,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Search,
  ShoppingCart,
  Plus,
  Trash2,
  Percent,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  DollarSign,
  Tag,
  Coins,
  FileSpreadsheet,
} from 'lucide-react';

interface BEDistributorOrderPunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClientId?: string;
  onOpenOnboarding?: () => void;
  onOrderGenerated?: (order: Order) => void;
}

interface DraftLine {
  id: string;
  sku_id: string;
  quantity: number | string;
  unit_price: number | string; // Editable by BE
  discount_percentage: number | string;
}

export const BEDistributorOrderPunchModal: React.FC<BEDistributorOrderPunchModalProps> = ({
  isOpen,
  onClose,
  initialClientId,
  onOpenOnboarding,
  onOrderGenerated,
}) => {
  const {
    activeTenant,
    companies,
    skus,
    retailers,
    distributors,
    dispatchPoints,
    orders,
    currentUser,
    addOrder,
    activeRole
  } = useAppStore();

  // Load clients: First from distributors collection, and fallback to any existing institutional/distributor accounts
  const directClients = useMemo(() => {
    const list: Array<DistributorInstitution | Retailer> = [
      ...(distributors || []),
      ...(retailers || []).filter(
        (r) =>
          r.channel === 'DISTRIBUTOR' ||
          r.channel === 'INSTITUTIONAL' ||
          (!r.beat_id && (r.beat_name?.toLowerCase().includes('institutional') || r.beat_name?.toLowerCase().includes('direct')))
      ),
    ];
    const seen = new Set<string>();
    return list.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [distributors, retailers]);

  const [selectedClientId, setSelectedClientId] = useState<string>(
    initialClientId || directClients[0]?.id || ''
  );
  const [selectedDispatchPointId, setSelectedDispatchPointId] = useState<string>(
    dispatchPoints[0]?.id || ''
  );
  const [deliveryDate, setDeliveryDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [orderReference, setOrderReference] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Principal Company-wise Special Discount Slabs State: { [companyId]: { slab_name: string; discount_percent: number | string } }
  const [companyDiscountSlabs, setCompanyDiscountSlabs] = useState<
    Record<string, { slab_name: string; discount_percent: number | string }>
  >({});

  // Line items
  const [draftLines, setDraftLines] = useState<DraftLine[]>(() => {
    const firstSku = skus[0];
    return [
      {
        id: `line_${Date.now()}_1`,
        sku_id: firstSku?.id || '',
        quantity: 50,
        unit_price: firstSku?.selling_price || 0,
        discount_percentage: 0,
      },
    ];
  });

  // Principal Company filter & SKU Search
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('ALL');
  const [skuSearchTerm, setSkuSearchTerm] = useState('');
  const [isSearchingSku, setIsSearchingSku] = useState(false);

  // UI Error Message State (rendered directly on UI)
  const [uiError, setUiError] = useState<string | null>(null);

  // Invoicing Classification (Mandatory for order generation)
  const [orderInvoicingType, setOrderInvoicingType] = useState<OrderInvoicingType>('REGISTERED_GST');

  // Submission result
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);

  // Reset all modal state whenever the modal opens so stale completion cards never show
  useEffect(() => {
    if (isOpen) {
      setSubmittedOrder(null);
      setUiError(null);
      setOrderNotes('');
      setOrderReference('');
      setSelectedCompanyFilter('ALL');
      setSkuSearchTerm('');
      setIsSearchingSku(false);
      setCompanyDiscountSlabs({});
      if (initialClientId) {
        setSelectedClientId(initialClientId);
      } else if (directClients.length > 0) {
        setSelectedClientId(directClients[0].id);
      }
      const firstSku = skus[0];
      setDraftLines(
        firstSku
          ? [
              {
                id: `line_${Date.now()}_1`,
                sku_id: firstSku.id,
                quantity: 50,
                unit_price: firstSku.selling_price || 0,
                discount_percentage: 0,
              },
            ]
          : []
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Clean close handler that resets state
  const handleModalClose = () => {
    setSubmittedOrder(null);
    setUiError(null);
    onClose();
  };

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId]);

  const selectedClient = useMemo(() => {
    return directClients.find((r) => r.id === selectedClientId) || directClients[0];
  }, [directClients, selectedClientId]);

  // Auto-set Invoicing Type based on client GSTIN registration
  useEffect(() => {
    if (selectedClient?.gstin) {
      setOrderInvoicingType('REGISTERED_GST');
    } else {
      setOrderInvoicingType('UNREGISTERED_CASH');
    }
  }, [selectedClient]);

  // Set default dispatch point if client has one (stabilized via primitive id)
  const clientDispatchPointId = selectedClient?.dispatch_point_id;
  useEffect(() => {
    if (clientDispatchPointId) {
      setSelectedDispatchPointId((prev) =>
        prev === clientDispatchPointId ? prev : clientDispatchPointId
      );
    }
  }, [clientDispatchPointId]);

  // Companies involved in the current order
  const involvedCompanies = useMemo(() => {
    const compMap = new Map<string, Company>();
    draftLines.forEach((l) => {
      const skuObj = skus.find((s) => s.id === l.sku_id);
      if (skuObj) {
        const comp = companies.find((c) => c.id === skuObj.company_id);
        if (comp) compMap.set(comp.id, comp);
      }
    });
    return Array.from(compMap.values());
  }, [draftLines, skus, companies]);

  const tenantCompanies = useMemo(() => {
    const tid = activeTenant?.id || 'tenant_ms_enterprises';
    return (companies || []).filter((c) => !c.tenant_id || c.tenant_id === tid);
  }, [companies, activeTenant]);

  // SKUs filtered by the selected Principal Company
  const companySkus = useMemo(() => {
    if (selectedCompanyFilter === 'ALL') return skus;
    return skus.filter((s) => s.company_id === selectedCompanyFilter);
  }, [skus, selectedCompanyFilter]);

  // Filtered SKUs for search within selected company
  const filteredSkus = useMemo(() => {
    if (!skuSearchTerm.trim()) return companySkus;
    const term = skuSearchTerm.toLowerCase();
    return companySkus.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.code.toLowerCase().includes(term) ||
        s.category.toLowerCase().includes(term) ||
        (s.pack_size && s.pack_size.toLowerCase().includes(term))
    );
  }, [companySkus, skuSearchTerm]);

  // Add a new product line using the next available SKU from catalog
  const handleAddProductLine = () => {
    const addedSkuIds = new Set(draftLines.map((l) => l.sku_id));
    const nextSku = filteredSkus.find((s) => !addedSkuIds.has(s.id)) || filteredSkus[0] || skus[0];
    if (!nextSku) {
      setUiError('No products available under the selected Principal Company filter.');
      return;
    }

    handleAddSku(nextSku);
  };

  // Change SKU on a specific row
  const handleLineSkuChange = (lineId: string, newSkuId: string) => {
    const targetSku = skus.find((s) => s.id === newSkuId);
    if (!targetSku) return;

    const companySlab = companyDiscountSlabs[targetSku.company_id];
    const defaultDisc = companySlab ? companySlab.discount_percent : 0;

    setDraftLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          sku_id: newSkuId,
          unit_price: targetSku.selling_price || 0,
          discount_percentage: defaultDisc,
        };
      })
    );
    if (uiError) setUiError(null);
  };

  // Handle SKU addition via quick search or selection
  const handleAddSku = (sku: SKU) => {
    // If already in lines, increase quantity
    const existingIndex = draftLines.findIndex((l) => l.sku_id === sku.id);
    if (existingIndex >= 0) {
      setDraftLines((prev) =>
        prev.map((line, idx) =>
          idx === existingIndex
            ? { ...line, quantity: (Number(line.quantity) || 0) + 10 }
            : line
        )
      );
    } else {
      const companySlab = companyDiscountSlabs[sku.company_id];
      const defaultDisc = companySlab ? companySlab.discount_percent : 0;
      setDraftLines((prev) => [
        ...prev,
        {
          id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          sku_id: sku.id,
          quantity: 25,
          unit_price: sku.selling_price || 0,
          discount_percentage: defaultDisc,
        },
      ]);
    }
    setSkuSearchTerm('');
    setIsSearchingSku(false);
    setUiError(null);
  };

  // Delete product action - smoothly removes line
  const handleRemoveLine = (lineId: string) => {
    setDraftLines((prev) => {
      const remaining = prev.filter((l) => l.id !== lineId);
      if (remaining.length === 0) {
        setUiError('Notice: All products removed. Please add at least one product before generating.');
      }
      return remaining;
    });
  };

  const handleUpdateLine = (lineId: string, updates: Partial<DraftLine>) => {
    setDraftLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, ...updates } : l))
    );
    if (uiError) setUiError(null);
  };

  // Company discount slab update
  const handleUpdateCompanySlab = (companyId: string, slabName: string, percent: number | string) => {
    setCompanyDiscountSlabs((prev) => ({
      ...prev,
      [companyId]: {
        slab_name: slabName,
        discount_percent: percent,
      },
    }));

    // Auto-update discount on existing lines belonging to this company if line discount was 0 or matched prev slab
    setDraftLines((prev) =>
      prev.map((line) => {
        const skuObj = skus.find((s) => s.id === line.sku_id);
        if (skuObj && skuObj.company_id === companyId) {
          return { ...line, discount_percentage: percent };
        }
        return line;
      })
    );
  };

  // Calculations
  const calculatedLines = useMemo(() => {
    return draftLines.map((line) => {
      const skuObj = skus.find((s) => s.id === line.sku_id);
      const comp = companies.find((c) => c.id === skuObj?.company_id);

      const qty = Math.max(0, Number(line.quantity) || 0);
      const rate = Math.max(0, Number(line.unit_price) || 0);
      const gross = qty * rate;

      const discPct = Math.min(100, Math.max(0, Number(line.discount_percentage) || 0));
      const discAmt = (gross * discPct) / 100;
      const netTotal = gross - discAmt;

      const isBelowCost = rate < (skuObj?.landing_price || 0);

      return {
        ...line,
        sku: skuObj,
        company: comp,
        gross,
        discAmt,
        netTotal,
        isBelowCost,
      };
    });
  }, [draftLines, skus, companies]);

  const totalGross = calculatedLines.reduce((sum, l) => sum + l.gross, 0);
  const totalDiscounts = calculatedLines.reduce((sum, l) => sum + l.discAmt, 0);
  const subtotalAfterDiscounts = totalGross - totalDiscounts;
  const estimatedTax = subtotalAfterDiscounts * 0.18; // Standard 18% GST estimate
  const finalGrandTotal = subtotalAfterDiscounts + estimatedTax;

  // Credit Limit Check
  const creditLimit = selectedClient?.credit_limit || 0;
  const currentOutstanding = selectedClient?.current_outstanding || 0;
  const projectedExposure = currentOutstanding + finalGrandTotal;
  const isCreditExceeded = creditLimit > 0 && projectedExposure > creditLimit;
  const creditVariance = projectedExposure - creditLimit;

  if (!isOpen) return null;

  const handleGenerateOrder = () => {
    if (!selectedClient) {
      setUiError('Please select or onboard a Distributor or Institution first.');
      return;
    }
    if (draftLines.length === 0) {
      setUiError('Cannot generate order: Please add at least one product SKU to the order.');
      return;
    }
    const totalQty = draftLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
    if (totalQty <= 0) {
      setUiError('Cannot generate order: Please ensure at least one product SKU has a quantity greater than 0.');
      return;
    }
    setUiError(null);

    const orderNumber = `ORD-DIR-${Math.floor(10000 + Math.random() * 90000)}`;
    const tenantId = activeTenant?.id || 'tenant_ms_enterprises';
    const primaryCompanyId = involvedCompanies[0]?.id || companies[0]?.id || '';
    const allCompanyIds = Array.from(new Set(involvedCompanies.map((c) => c.id)));

    const orderLines: OrderLine[] = calculatedLines.map((cl) => {
      const numQty = Math.max(0, Number(cl.quantity) || 0);
      const numRate = Math.max(0, Number(cl.unit_price) || 0);
      const landing = cl.sku?.landing_price || numRate * 0.85;
      return {
        id: `ord_line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: tenantId,
        order_id: orderNumber,
        sku_id: cl.sku_id,
        sku_name: cl.sku?.name || 'Item',
        quantity: numQty,
        verified_quantity: numQty, // Pre-verified by BE!
        unit_price: numRate, // BE customized rate
        landing_price: landing,
        total: cl.netTotal,
        discount_percentage: Math.min(100, Math.max(0, Number(cl.discount_percentage) || 0)),
        discount_amount: cl.discAmt,
        is_below_cost: cl.isBelowCost,
        expected_claim_total: cl.isBelowCost ? landing - numRate : 0,
        company_id: cl.sku?.company_id || primaryCompanyId,
        company_name: cl.company?.name || 'Principal Company',
      };
    });

    // Pre-structured company discount slabs metadata
    const slabRecord: Record<
      string,
      { company_id: string; company_name: string; slab_name: string; discount_percent: number }
    > = {};
    involvedCompanies.forEach((c) => {
      const slab = companyDiscountSlabs[c.id];
      if (slab) {
        slabRecord[c.id] = {
          company_id: c.id,
          company_name: c.name,
          slab_name: slab.slab_name,
          discount_percent: Number(slab.discount_percent) || 0,
        };
      }
    });

    // DIRECT VERIFIED STATUS: 'VERIFIED_BY_BILLING'
    const newOrder: Order = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: tenantId,
      order_number: orderNumber,
      channel: (selectedClient.channel as any) || 'DISTRIBUTOR',
      company_id: primaryCompanyId,
      company_ids: allCompanyIds,
      retailer_id: selectedClient.id,
      retailer_name_raw: selectedClient.name,
      beat_name: selectedClient.beat_name || 'Direct / Institutional (No Beat)',
      dispatch_point_id: selectedDispatchPointId || selectedClient.dispatch_point_id || dispatchPoints[0]?.id || '',
      billing_executive_id: currentUser?.id || 'usr_billing_1',
      created_by_user_id: currentUser?.id || 'usr_billing_1',
      commission_agent_id: null, // NO CA INVOLVED
      commission_agent_name: undefined,
      order_date: new Date().toISOString().split('T')[0],
      delivery_date: deliveryDate,
      status: 'VERIFIED_BY_BILLING', // Bypasses pending verification queue!
      order_invoicing_type: orderInvoicingType,
      total_amount: Math.round(finalGrandTotal),
      original_total_amount: Math.round(finalGrandTotal),
      tax_amount: Math.round(estimatedTax),
      lines: orderLines,
      has_below_cost_lines: orderLines.some((l) => l.is_below_cost),
      credit_limit_exceeded: isCreditExceeded,
      exposure_variance: isCreditExceeded ? creditVariance : 0,
      approved_credit_limit_snapshot: creditLimit,
      retailer_outstanding_snapshot: currentOutstanding,
      be_approval_reason: isCreditExceeded
        ? `Billing Executive Authorized: Credit variance of ₹${creditVariance.toLocaleString('en-IN')} approved under direct B2B institutional terms (${orderInvoicingType === 'REGISTERED_GST' ? 'Registered GST' : 'Unregistered Cash'}).`
        : `Direct BE Order Generation (Auto-Verified as ${orderInvoicingType === 'REGISTERED_GST' ? 'Registered GST' : 'Unregistered Cash'})`,
      verified_by_user_id: currentUser?.id || 'usr_billing_1',
      verified_at: new Date().toISOString(),
      is_locked: false,
      source_type: 'BE_DIRECT',
      is_direct_be_order: true,
      notes: orderNotes ? `Ref: ${orderReference} | Notes: ${orderNotes}` : orderReference,
      company_discount_slabs: slabRecord,
    };

    addOrder(newOrder);
    setSubmittedOrder(newOrder);
    if (onOrderGenerated) onOrderGenerated(newOrder);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-purple-800/60 rounded-2xl p-6 max-w-4xl w-full space-y-5 shadow-2xl animate-fadeIn my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950/90 border border-purple-700/80 text-purple-300 flex items-center justify-center shrink-0">
              <ShoppingCart size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  Generate Direct Order (Distributor / Institution)
                </h3>
                <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  Instant Auto-Verification
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Billing Executive Desk • Direct bypass of CA review • Free rate & special discount slab control
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {submittedOrder ? (
          /* Order Generation Success Screen */
          <div className="p-6 bg-slate-950 rounded-xl border border-emerald-700/60 text-center space-y-4 animate-fadeIn my-auto">
            <div className="w-14 h-14 bg-emerald-950 border border-emerald-600 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                Status: VERIFIED_BY_BILLING
              </span>
              <h4 className="text-base font-bold text-white mt-2">
                Order {submittedOrder.order_number} Generated Successfully!
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Direct order for <strong className="text-white">{selectedClient?.name}</strong> has been created in pre-verified state.
              </p>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-left text-xs space-y-2 max-w-lg mx-auto font-mono text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Order Reference:</span>
                <span className="text-amber-400 font-bold">{submittedOrder.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Invoiceable Amount:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  ₹{submittedOrder.total_amount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Verification Gate:</span>
                <span className="text-purple-300 font-semibold">Auto-Bypassed (BE Direct)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Next Action:</span>
                <span className="text-cyan-400">Ready for Invoicing & Dispatch</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Window
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubmittedOrder(null);
                  setDraftLines([
                    {
                      id: `line_${Date.now()}_1`,
                      sku_id: skus[0]?.id || '',
                      quantity: 50,
                      unit_price: skus[0]?.selling_price || 0,
                      discount_percentage: 0,
                    },
                  ]);
                }}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Punch Another Direct Order</span>
              </button>
            </div>
          </div>
        ) : (
          /* Main Order Form */
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Step 1: Select Distributor / Institution */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-purple-400 shrink-0" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Client: Distributor or Institution
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Select Onboarded Account
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                  >
                    {directClients.length === 0 ? (
                      <option value="">No Direct Clients Onboarded</option>
                    ) : (
                      directClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} ({client.channel} - {client.code})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Dispatch Point / Depot
                  </label>
                  <select
                    value={selectedDispatchPointId}
                    onChange={(e) => setSelectedDispatchPointId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-purple-500 rounded-lg px-3 py-2 text-xs text-white outline-none"
                  >
                    {dispatchPoints.map((dp) => (
                      <option key={dp.id} value={dp.id}>
                        {dp.name} ({dp.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Client Info & Credit Status Strip */}
              {selectedClient && (
                <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Segment & Code</span>
                    <span className="text-purple-300 font-semibold">
                      {selectedClient.channel} • {selectedClient.code}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">GSTIN</span>
                    <span className="font-mono text-slate-300">
                      {selectedClient.gstin || 'Unregistered'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Approved Credit Limit</span>
                    <span className="text-emerald-400 font-bold">
                      ₹{selectedClient.credit_limit.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Current Outstanding</span>
                    <span className="text-amber-400 font-semibold">
                      ₹{selectedClient.current_outstanding.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              {/* Order Invoicing Type Selector */}
              <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <FileText size={14} className="text-purple-400" />
                    Order Invoicing Classification <span className="text-rose-400 font-bold">*</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Mandatory for Order Verification & Invoicing</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setOrderInvoicingType('UNREGISTERED_CASH')}
                    className={`p-2.5 rounded-xl text-left border transition-all ${
                      orderInvoicingType === 'UNREGISTERED_CASH'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm ring-1 ring-amber-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Coins size={14} className={orderInvoicingType === 'UNREGISTERED_CASH' ? 'text-amber-400' : 'text-slate-500'} />
                      Unregistered Cash
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Cash retail or composite sale. Form-08 commercial bill without B2B GST tax credit.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderInvoicingType('REGISTERED_GST')}
                    className={`p-2.5 rounded-xl text-left border transition-all ${
                      orderInvoicingType === 'REGISTERED_GST'
                        ? 'bg-blue-500/20 border-blue-500 text-blue-200 shadow-sm ring-1 ring-blue-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <FileSpreadsheet size={14} className={orderInvoicingType === 'REGISTERED_GST' ? 'text-blue-400' : 'text-slate-500'} />
                      Registered GST
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Official B2B Tax Invoice with item-level 18% GST tax credit pass-through.
                    </div>
                  </button>
                </div>
              </div>

              {/* Advisory Credit Limit Warning (Non-blocking as requested) */}
              {isCreditExceeded && (
                <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-lg text-xs text-amber-200 flex items-start gap-2.5 animate-fadeIn">
                  <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-amber-300 flex items-center gap-2">
                      <span>Advisory Alert: Credit Threshold Exceeded by ₹{creditVariance.toLocaleString('en-IN')}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-900/60 text-amber-200 border border-amber-700/60 font-mono">
                        Non-Blocking
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      This order will bring total exposure to ₹{projectedExposure.toLocaleString('en-IN')} against the approved credit limit of ₹{creditLimit.toLocaleString('en-IN')}. As a Billing Executive, you may proceed with generating this verified order.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Principal Company-wise Special Discount Slabs */}
            {involvedCompanies.length > 0 && (
              <div className="bg-slate-950/70 border border-purple-900/50 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Percent size={15} className="text-purple-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Principal Company-wise Special Discount Slabs
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Auto-applies to items for selected company
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {involvedCompanies.map((comp) => {
                    const currentSlab = companyDiscountSlabs[comp.id] || {
                      slab_name: '',
                      discount_percent: '',
                    };

                    return (
                      <div
                        key={comp.id}
                        className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-300">{comp.name}</span>
                          <span className="text-[10px] font-mono text-slate-500">{comp.code}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              Discount Slab Name / Reason
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Super Stockist 5% or Institutional Bulk"
                              value={currentSlab.slab_name}
                              onChange={(e) =>
                                handleUpdateCompanySlab(
                                  comp.id,
                                  e.target.value,
                                  currentSlab.discount_percent
                                )
                              }
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded px-2 py-1 text-xs text-white outline-none placeholder:text-slate-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              Slab Disc %
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={currentSlab.discount_percent === '' ? '' : currentSlab.discount_percent}
                              placeholder="0"
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  handleUpdateCompanySlab(
                                    comp.id,
                                    currentSlab.slab_name,
                                    ''
                                  );
                                  return;
                                }
                                const num = parseFloat(raw);
                                if (!isNaN(num)) {
                                  const clamped = Math.min(100, Math.max(0, num));
                                  handleUpdateCompanySlab(
                                    comp.id,
                                    currentSlab.slab_name,
                                    clamped
                                  );
                                }
                              }}
                              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded px-2 py-1 text-xs text-purple-300 font-bold outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Product SKU Line Items Table (Freely Editable) */}
            <div
              className={`bg-slate-950/70 border ${
                uiError && draftLines.length === 0
                  ? 'border-rose-500/80 ring-2 ring-rose-500/30'
                  : 'border-slate-800'
              } rounded-xl p-3.5 space-y-3 transition-all`}
            >
              {/* Product Lines Section Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={15} className="text-purple-400" />
                    <span>Product Lines ({draftLines.length} Items)</span>
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Add products by Principal Company • Rates, quantities & discounts are editable
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {draftLines.length} SKU{draftLines.length === 1 ? '' : 's'} •{' '}
                    {draftLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)} Total Units
                  </span>
                </div>
              </div>

              {/* UI Error Message in Product Section (if any error) */}
              {uiError && (
                <div className="bg-rose-500/15 border border-rose-500/60 rounded-xl p-3 flex items-start gap-2.5 text-rose-200 text-xs shadow-md">
                  <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold text-rose-300 uppercase tracking-wider text-[10px] block">
                      Order Validation Alert
                    </span>
                    <p className="mt-0.5 font-medium text-rose-200">{uiError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUiError(null)}
                    className="text-rose-400 hover:text-rose-100 p-0.5 rounded cursor-pointer"
                    title="Dismiss alert"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Principal Company-Wise Product Addition Bar (Unified Single Add Product Experience) */}
              <div className="bg-slate-900/90 border border-purple-900/50 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-purple-300 flex items-center gap-1.5">
                    <Building2 size={13} className="text-purple-400" />
                    <span>Principal Company Product Catalog</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {companySkus.length} SKU{companySkus.length === 1 ? '' : 's'} available
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  {/* 1. Principal Company Selector */}
                  <div className="sm:col-span-4">
                    <label className="block text-[10px] text-slate-400 mb-1 font-medium">
                      1. Filter by Principal Company
                    </label>
                    <select
                      value={selectedCompanyFilter}
                      onChange={(e) => {
                        setSelectedCompanyFilter(e.target.value);
                        setSkuSearchTerm('');
                        setIsSearchingSku(false);
                        setUiError(null);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
                    >
                      <option value="ALL">🏢 All Companies ({skus.length} SKUs)</option>
                      {tenantCompanies.map((c) => {
                        const count = skus.filter((s) => s.company_id === c.id).length;
                        return (
                          <option key={c.id} value={c.id}>
                            🏢 {c.name} ({c.code}) — {count} SKUs
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* 2. Product SKU Search */}
                  <div className="sm:col-span-5 relative">
                    <label className="block text-[10px] text-slate-400 mb-1 font-medium">
                      2. Search Product (Name / Code / Pack)
                    </label>
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder={
                          selectedCompanyFilter !== 'ALL'
                            ? `Search ${(tenantCompanies.find((c) => c.id === selectedCompanyFilter)?.code || 'Company')} SKUs...`
                            : 'Search products by name, code...'
                        }
                        value={skuSearchTerm}
                        onChange={(e) => {
                          setSkuSearchTerm(e.target.value);
                          setIsSearchingSku(true);
                          setUiError(null);
                        }}
                        onFocus={() => setIsSearchingSku(true)}
                        className="w-full bg-slate-950 border border-slate-700 focus:border-purple-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white outline-none placeholder:text-slate-600"
                      />
                      {skuSearchTerm && (
                        <button
                          type="button"
                          onClick={() => {
                            setSkuSearchTerm('');
                            setIsSearchingSku(false);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* Instant Search Results Dropdown */}
                    {isSearchingSku && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-purple-800/80 rounded-xl shadow-2xl p-1.5 z-30 max-h-60 overflow-y-auto space-y-1">
                        <div className="flex items-center justify-between px-2 py-1 text-[10px] text-slate-400 border-b border-slate-800">
                          <span>
                            {filteredSkus.length} product{filteredSkus.length === 1 ? '' : 's'} available
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsSearchingSku(false)}
                            className="text-slate-400 hover:text-white text-[10px]"
                          >
                            Close ✕
                          </button>
                        </div>
                        {filteredSkus.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No matching products found in{' '}
                            {selectedCompanyFilter !== 'ALL'
                              ? tenantCompanies.find((c) => c.id === selectedCompanyFilter)?.name
                              : 'catalog'}
                          </div>
                        ) : (
                          filteredSkus.map((sku) => {
                            const comp = companies.find((c) => c.id === sku.company_id);
                            return (
                              <div
                                key={sku.id}
                                onClick={() => handleAddSku(sku)}
                                className="p-2 hover:bg-purple-950/70 rounded-lg cursor-pointer text-xs flex items-center justify-between transition-colors border border-transparent hover:border-purple-800/50"
                              >
                                <div>
                                  <div className="font-semibold text-white flex items-center gap-1.5">
                                    <span>{sku.name}</span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 border border-purple-800 text-purple-300 font-mono">
                                      {comp?.code || 'COMP'}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    {sku.code} • Pack: {sku.pack_size || 'Std'} • MRP ₹{sku.mrp}
                                  </div>
                                </div>
                                <div className="text-right pl-2">
                                  <div className="text-emerald-400 font-bold">₹{sku.selling_price}</div>
                                  <span className="text-[10px] text-purple-300 font-semibold inline-flex items-center gap-0.5">
                                    <Plus size={10} /> Add
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. Single Add Product Button */}
                  <div className="sm:col-span-3 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddProductLine}
                      className="w-full py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer h-[34px]"
                    >
                      <Plus size={14} />
                      <span>+ Add Product</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Items Table or Zero-State */}
              {draftLines.length === 0 ? (
                <div className="p-8 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-xl space-y-2">
                  <ShoppingCart size={32} className="mx-auto text-slate-600" />
                  <div>
                    <p className="text-xs font-bold text-slate-300">No products added to this order yet</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Select a Principal Company and click &quot;+ Add Product&quot; or search above to add items
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto space-y-2.5">
                  <table className="w-full text-left text-xs text-slate-200">
                    <thead className="bg-slate-900 text-slate-400 text-[11px] font-semibold uppercase">
                      <tr>
                        <th className="p-2.5 min-w-[220px]">SKU Product</th>
                        <th className="p-2.5 w-24 text-center">Quantity</th>
                        <th className="p-2.5 w-28 text-right">Unit Rate (₹)</th>
                        <th className="p-2.5 w-24 text-right">Disc %</th>
                        <th className="p-2.5 w-28 text-right">Net Total (₹)</th>
                        <th className="p-2.5 w-14 text-center">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {calculatedLines.map((line) => {
                        const companySkusForLine = skus.filter((s) => s.company_id === line.sku?.company_id);
                        return (
                          <tr key={line.id} className="hover:bg-slate-900/40">
                            <td className="p-2.5">
                              {/* Product Details Display */}
                              <div className="space-y-0.5">
                                <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
                                  <span>{line.sku?.name || 'Selected Product'}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950 border border-purple-800 text-purple-300 font-mono font-semibold">
                                    {line.company?.code || 'COMP'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-1.5 font-mono">
                                  <span>SKU: {line.sku?.code}</span>
                                  <span>•</span>
                                  <span>MRP: ₹{line.sku?.mrp}</span>
                                  <span>•</span>
                                  <span>Pack: {line.sku?.pack_size || 'Std'}</span>
                                  {line.isBelowCost && (
                                    <span className="text-rose-400 font-semibold">(Below Cost Warning)</span>
                                  )}
                                </div>

                                {/* Scoped variant change within same Principal Company (avoids 500-item dropdown) */}
                                {companySkusForLine.length > 1 && (
                                  <select
                                    value={line.sku_id}
                                    onChange={(e) => handleLineSkuChange(line.id, e.target.value)}
                                    className="mt-1 w-full bg-slate-950 border border-slate-700/80 focus:border-purple-500 rounded px-1.5 py-0.5 text-[11px] text-slate-300 outline-none cursor-pointer"
                                    title="Switch SKU variant for this company"
                                  >
                                    {companySkusForLine.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.name} ({s.pack_size || 'Std'}) • MRP ₹{s.mrp}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>

                            <td className="p-2.5 text-center">
                              <input
                                type="number"
                                min={1}
                                value={line.quantity === '' ? '' : line.quantity}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  handleUpdateLine(line.id, {
                                    quantity: raw === '' ? '' : Math.max(1, Number(raw) || 1),
                                  });
                                }}
                                className="w-20 bg-slate-900 border border-slate-700 focus:border-purple-500 rounded px-2 py-1 text-center text-xs text-white font-bold outline-none"
                              />
                            </td>

                            <td className="p-2.5 text-right">
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                value={line.unit_price === '' ? '' : line.unit_price}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  handleUpdateLine(line.id, {
                                    unit_price: raw === '' ? '' : Math.max(0, Number(raw) || 0),
                                  });
                                }}
                                className="w-24 bg-slate-900 border border-slate-700 focus:border-purple-500 rounded px-2 py-1 text-right text-xs text-emerald-400 font-bold outline-none"
                                title="Editable by Billing Executive"
                              />
                            </td>

                            <td className="p-2.5 text-right">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={line.discount_percentage === '' ? '' : line.discount_percentage}
                                placeholder="0"
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    handleUpdateLine(line.id, {
                                      discount_percentage: '',
                                    });
                                    return;
                                  }
                                  const num = parseFloat(raw);
                                  if (!isNaN(num)) {
                                    handleUpdateLine(line.id, {
                                      discount_percentage: Math.min(100, Math.max(0, num)),
                                    });
                                  }
                                }}
                                className="w-16 bg-slate-900 border border-slate-700 focus:border-purple-500 rounded px-2 py-1 text-right text-xs text-purple-300 font-bold outline-none"
                              />
                            </td>

                            <td className="p-2.5 text-right font-mono font-bold text-white">
                              ₹{Math.round(line.netTotal).toLocaleString('en-IN')}
                            </td>

                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(line.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Delete product from order"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Summary Counter at bottom (duplicate Add button removed) */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400">
                      Total items in order: <strong className="text-white">{draftLines.length}</strong>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {draftLines.length} SKU{draftLines.length === 1 ? '' : 's'} •{' '}
                      {draftLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)} Total Units
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Step 4: Commercial Summary & Reference */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <span className="text-xs font-bold text-white uppercase tracking-wider block">
                  Logistics & Order Notes
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      Expected Delivery Date
                    </label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">
                      Client PO / Ref Number
                    </label>
                    <input
                      type="text"
                      placeholder="PO/2026/088"
                      value={orderReference}
                      onChange={(e) => setOrderReference(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    Order Remarks / Special Delivery Instructions
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Direct godown delivery via 14ft container; verified with purchase officer."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-purple-500 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-slate-600 resize-none"
                  />
                </div>
              </div>

              {/* Financial Calculation Box */}
              <div className="bg-purple-950/30 border border-purple-900/60 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                <span className="text-xs font-bold text-purple-300 uppercase tracking-wider block font-sans">
                  Financial Settlement Breakdown
                </span>

                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400 font-sans">Gross Order Total:</span>
                  <span>₹{Math.round(totalGross).toLocaleString('en-IN')}</span>
                </div>

                <div className="flex justify-between text-purple-300">
                  <span className="text-slate-400 font-sans">Special Slabs & Line Discounts:</span>
                  <span>- ₹{Math.round(totalDiscounts).toLocaleString('en-IN')}</span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400 font-sans">Subtotal (Excl. Tax):</span>
                  <span>₹{Math.round(subtotalAfterDiscounts).toLocaleString('en-IN')}</span>
                </div>

                <div className="flex justify-between text-slate-400">
                  <span className="text-slate-500 font-sans">Estimated GST (18%):</span>
                  <span>₹{Math.round(estimatedTax).toLocaleString('en-IN')}</span>
                </div>

                <div className="pt-2 border-t border-purple-800/80 flex justify-between text-white font-bold text-sm">
                  <span className="font-sans text-xs">Total Order Value:</span>
                  <span className="text-emerald-400">
                    ₹{Math.round(finalGrandTotal).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions Footer */}
        {!submittedOrder && (
          <div className="space-y-2 pt-3 border-t border-slate-800 shrink-0">
            {uiError && (
              <div className="bg-rose-500/15 border border-rose-500/60 rounded-xl p-2.5 px-3 flex items-center justify-between text-rose-200 text-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle size={15} className="text-rose-400 shrink-0" />
                  <span className="font-semibold text-rose-300">{uiError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUiError(null)}
                  className="text-rose-400 hover:text-rose-200 text-xs px-1"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                Generated by:{' '}
                <strong className="text-purple-300">{currentUser?.name || 'Billing Executive'}</strong>{' '}
                • Status:{' '}
                <span className="text-emerald-400 font-semibold font-mono">VERIFIED_BY_BILLING</span>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateOrder}
                  className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 size={14} />
                  <span>Generate Verified Order</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
