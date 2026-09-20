import React, { useState } from 'react';
import { useAppStore } from '../../data/store';
import { Order, OrderChannel, OrderLine, OrderStatus, Retailer } from '../../types';
import { KPICard } from '../common/KPICard';
import { StoreOnboardSuccessModal } from '../common/StoreOnboardSuccessModal';
import { BEDistributorOrdersView } from './BEDistributorOrdersView';
import { getOrderFinancialSummary } from '../../utils/caRoutingLogic';
import {
  validateGSTIN,
  validatePhoneNumber,
  validateStoreName,
  validateBeatRoute
} from '../../utils/validators';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Building,
  Building2,
  UserCheck,
  Tag,
  Download,
  FileSpreadsheet,
  FileText,
  Layers,
  Edit3,
  Eye,
  CheckSquare,
  AlertOctagon,
  Copy,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Share2,
  AlertCircle,
  ShieldCheck,
  Truck,
  Lock
} from 'lucide-react';

interface AuditBatchLog {
  id: string;
  timestamp: string;
  company_name: string;
  company_code: string;
  order_count: number;
  sku_count: number;
  total_quantity: number;
  total_value: number;
  exported_by: string;
  file_name: string;
}

export const OrderCapture: React.FC = () => {
  const {
    activeTenant,
    activeTenantSettings,
    companies,
    dispatchPoints,
    skus,
    retailers,
    beats,
    orders,
    purchaseOrders,
    workflowNotifications,
    users,
    addOrder,
    updateOrder,
    updateOrderStatus,
    addPurchaseOrder,
    updatePurchaseOrderStatus,
    verifyPORates,
    markNotificationAsRead,
    addRetailer,
    activeRole
  } = useAppStore();

  // Active Sub-Tab
  const [activeTab, setActiveTab] = useState<'REVIEW_QUEUE' | 'COMPANY_COMPILATION' | 'PRINCIPLE_POS' | 'AUDIT_LOGS' | 'MANUAL_ENTRY' | 'DISTRIBUTORS_INSTITUTIONS'>(
    activeRole === 'BILLING' ? 'DISTRIBUTORS_INSTITUTIONS' : 'COMPANY_COMPILATION'
  );

  // Rate & Quantity Verification Gate Modal State
  const [rateVerifyModal, setRateVerifyModal] = useState<{
    company: any;
    orders: Order[];
    items: {
      sku_id: string;
      sku_code: string;
      sku_name: string;
      pack_size: string;
      total_quantity: number;
      master_landing_price: number;
      store_avg_price: number;
      total_landing_amount: number;
      verified: boolean;
    }[];
  } | null>(null);

  const [poStatusFilter, setPoStatusFilter] = useState<string>('ALL');

  // Compilation Scope Filter for Order Punchers (Verified by Billing / Cleared / All)
  const [compilationStatusScope, setCompilationStatusScope] = useState<'VERIFIED_ONLY' | 'ALL_CLEARED' | 'ALL_INCL_PUNCHED'>('VERIFIED_ONLY');

  // Expanded Company Accordion State
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);

  // Filters
  const [filterChannel, setFilterChannel] = useState<string>('ALL');
  const [filterCompany, setFilterCompany] = useState<string>('ALL');
  const [filterAgent, setFilterAgent] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [compilationDate, setCompilationDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Modal States
  const [isAddRetailerOpen, setIsAddRetailerOpen] = useState(false);
  const [flaggingOrder, setFlaggingOrder] = useState<Order | null>(null);
  const [flagReason, setFlagReason] = useState('');

  // Selected Order for Detail / Edit
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editLines, setEditLines] = useState<{ sku_id: string; quantity: number; unit_price: number }[]>([]);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditBatchLog[]>([
    {
      id: 'log_101',
      timestamp: '2026-08-09 15:30',
      company_name: 'Britannia Industries Ltd',
      company_code: 'BRIT',
      order_count: 8,
      sku_count: 14,
      total_quantity: 1250,
      total_value: 385000,
      exported_by: 'Order Puncher (Rahul S.)',
      file_name: 'Britannia_Verified_Primary_PO_2026-08-09.csv',
    },
    {
      id: 'log_102',
      timestamp: '2026-08-08 17:15',
      company_name: 'Marico Ltd',
      company_code: 'MARI',
      order_count: 5,
      sku_count: 8,
      total_quantity: 620,
      total_value: 194000,
      exported_by: 'Order Puncher (Rahul S.)',
      file_name: 'Marico_Verified_Primary_PO_2026-08-08.csv',
    },
  ]);

  // New Retailer Form State
  const [onboardedStoreSuccess, setOnboardedStoreSuccess] = useState<Retailer | null>(null);
  const [duplicateAlertInfo, setDuplicateAlertInfo] = useState<{
    cleanPhone: string;
    existingStore: Retailer;
  } | null>(null);
  const [newRetName, setNewRetName] = useState('');
  const [newRetBeatId, setNewRetBeatId] = useState<string>(beats[0]?.id || '');
  const [newRetPhone, setNewRetPhone] = useState('');
  const [newRetGstin, setNewRetGstin] = useState('');
  const [newRetOwner, setNewRetOwner] = useState('');
  const [newRetChannel, setNewRetChannel] = useState<OrderChannel>('GT');

  // Helper to find company for an SKU
  const getCompanyForSku = (skuId: string) => {
    const targetSku = skus.find((s) => s.id === skuId);
    if (!targetSku) return null;
    return companies.find((c) => c.id === targetSku.company_id);
  };

  const handleOpenOrderDetail = (ord: Order) => {
    setSelectedOrderForDetail(ord);
    setIsEditMode(false);
    setEditLines(
      (ord.lines || []).map((l) => ({
        sku_id: l.sku_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
      }))
    );
  };

  // Helper to filter orders for Company Compilation
  const getCompanyCompilationOrders = (comp: typeof companies[0]) => {
    return orders.filter((o) => {
      const matchesCompany =
        o.company_id === comp.id ||
        (o.company_ids && o.company_ids.includes(comp.id)) ||
        (o.lines && o.lines.some((l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id));

      if (!matchesCompany) return false;

      if (compilationStatusScope === 'VERIFIED_ONLY') {
        return (
          o.status === 'VERIFIED_BY_BILLING' ||
          o.status === 'APPROVED' ||
          o.status === 'INVOICED' ||
          o.status === 'CLEARED'
        );
      } else if (compilationStatusScope === 'ALL_CLEARED') {
        return (
          o.status === 'VERIFIED_BY_BILLING' ||
          o.status === 'APPROVED' ||
          o.status === 'CLEARED' ||
          o.status === 'INVOICED'
        );
      } else {
        return o.status !== 'FLAGGED' && o.status !== 'CANCELLED';
      }
    });
  };

  // Filtered Orders Queue for Tab 1
  const filteredOrders = orders.filter((o) => {
    if (filterChannel !== 'ALL' && o.channel !== filterChannel) return false;
    if (filterCompany !== 'ALL') {
      const matchesComp =
        o.company_id === filterCompany ||
        (o.company_ids && o.company_ids.includes(filterCompany)) ||
        (o.lines && o.lines.some((l) => l.company_id === filterCompany || getCompanyForSku(l.sku_id)?.id === filterCompany));
      if (!matchesComp) return false;
    }
    if (filterAgent !== 'ALL') {
      const matchesAgent =
        o.commission_agent_id === filterAgent ||
        o.created_by_user_id === filterAgent ||
        (o.commission_agent_name && o.commission_agent_name.toLowerCase().includes(filterAgent.toLowerCase()));
      if (!matchesAgent) return false;
    }
    if (filterStatus !== 'ALL' && o.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.retailer_name_raw.toLowerCase().includes(q) ||
        o.beat_name.toLowerCase().includes(q) ||
        (o.commission_agent_name && o.commission_agent_name.toLowerCase().includes(q)) ||
        (o.exception_comment && o.exception_comment.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // KPI Calculations
  const totalCapturedCount = orders.length;
  const pendingReviewCount = orders.filter((o) => o.status === 'PUNCHED' || o.status === 'PENDING_VERIFICATION').length;
  const verifiedByBillingCount = orders.filter(
    (o) => o.status === 'VERIFIED_BY_BILLING' || o.status === 'INVOICED' || o.status === 'APPROVED'
  ).length;
  const clearedCount = orders.filter((o) => o.status === 'CLEARED' || o.status === 'APPROVED' || o.status === 'VERIFIED_BY_BILLING').length;
  const flaggedCount = orders.filter((o) => o.status === 'FLAGGED' || o.has_below_cost_lines).length;
  const distributorOrdersCount = orders.filter(
    (o) =>
      o.is_direct_be_order ||
      o.channel === 'DISTRIBUTOR' ||
      o.channel === 'INSTITUTIONAL' ||
      !o.commission_agent_id
  ).length;
  const totalValueSum = orders.reduce((sum, o) => sum + o.total_amount, 0);

  // Filtered Value (calculating filtered company portion if specific company filter is applied)
  const filteredValueSum = filteredOrders.reduce((sum, o) => {
    if (filterCompany !== 'ALL') {
      const compLines = (o.lines || []).filter(
        (l) => l.company_id === filterCompany || getCompanyForSku(l.sku_id)?.id === filterCompany
      );
      return sum + compLines.reduce((s, l) => s + l.total, 0);
    }
    return sum + o.total_amount;
  }, 0);

  // Quick Action Handlers
  const handleMarkCleared = (orderId: string) => {
    updateOrderStatus(orderId, 'CLEARED');
  };

  const handleSaveFlag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flaggingOrder) return;
    updateOrder(flaggingOrder.id, {
      status: 'FLAGGED',
      exception_flag: 'SANITY_EXCEPTION',
      exception_comment: flagReason || 'Order flagged during sanity check by Order Puncher.',
    });
    setFlaggingOrder(null);
    setFlagReason('');
  };

  // 1. EXPORT CONSOLIDATED SKU PRIMARY PO CSV FOR A COMPANY
  const handleExportCompanyCsv = (comp: typeof companies[0], companyOrders: Order[]) => {
    if (companyOrders.length === 0) {
      alert(`No verified orders available to export for ${comp.name}`);
      return;
    }

    // Aggregate SKU wise
    const skuMap: Record<
      string,
      { code: string; name: string; pack: string; quantity: number; unit_price: number; total: number }
    > = {};

    companyOrders.forEach((o) => {
      const compLines = (o.lines || []).filter(
        (l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id
      );
      compLines.forEach((l) => {
        const skuObj = skus.find((s) => s.id === l.sku_id);
        if (!skuMap[l.sku_id]) {
          skuMap[l.sku_id] = {
            code: skuObj?.code || 'SKU-00',
            name: l.sku_name,
            pack: skuObj?.pack_size || '1x12',
            quantity: 0,
            unit_price: l.unit_price,
            total: 0,
          };
        }
        skuMap[l.sku_id].quantity += l.quantity;
        skuMap[l.sku_id].total += l.total;
      });
    });

    const rows = Object.values(skuMap);
    const totalQtySum = rows.reduce((s, r) => s + r.quantity, 0);
    const totalValSum = rows.reduce((s, r) => s + r.total, 0);

    const headers = [
      'Company Code',
      'Company Name',
      'SKU Code',
      'Product Description',
      'Pack Size',
      'Consolidated Qty (Pcs)',
      'Unit Rate (INR)',
      'Total Gross Value (INR)',
      'Batch Date',
      'Billing Status'
    ];

    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          `"${comp.code}"`,
          `"${comp.name.replace(/"/g, '""')}"`,
          `"${r.code}"`,
          `"${r.name.replace(/"/g, '""')}"`,
          `"${r.pack}"`,
          r.quantity,
          r.unit_price,
          r.total,
          `"${compilationDate}"`,
          '"VERIFIED_BY_BILLING"'
        ].join(',')
      ),
    ];

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `${comp.code}_Verified_Primary_PO_${compilationDate}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Record Audit Log
    const newLog: AuditBatchLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      company_name: comp.name,
      company_code: comp.code,
      order_count: companyOrders.length,
      sku_count: rows.length,
      total_quantity: totalQtySum,
      total_value: totalValSum,
      exported_by: 'Order Puncher (Verified PO Export)',
      file_name: filename,
    };
    setAuditLogs([newLog, ...auditLogs]);

    // Update status to PUNCHED_TO_PRINCIPAL
    companyOrders.forEach((o) => {
      updateOrderStatus(o.id, 'PUNCHED_TO_PRINCIPAL');
    });

    alert(`Successfully generated and downloaded ${filename} (${companyOrders.length} verified store orders) for ${comp.name} portal upload!\nAll ${companyOrders.length} orders updated to "PUNCHED TO PRINCIPAL COMPANY".`);
  };

  // 2. EXPORT STORE-WISE ITEMIZED LINES CSV FOR A COMPANY
  const handleExportStoreWiseCsv = (comp: typeof companies[0], companyOrders: Order[]) => {
    if (companyOrders.length === 0) {
      alert(`No verified store orders available to export for ${comp.name}`);
      return;
    }

    const headers = [
      'Company Code',
      'Company Name',
      'Order Number',
      'Order Date',
      'Order Status',
      'Channel',
      'Beat Name',
      'Retailer Outlet Name',
      'Retailer GSTIN',
      'SKU Code',
      'SKU Description',
      'Quantity',
      'Unit Price (INR)',
      'Line Total (INR)',
      'Below Cost Scheme'
    ];

    const rows: string[] = [];

    companyOrders.forEach((o) => {
      const ret = retailers.find((r) => r.id === o.retailer_id);
      const gstin = ret?.gstin || 'URP';
      const compLines = (o.lines || []).filter(
        (l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id
      );
      compLines.forEach((l) => {
        const skuObj = skus.find((s) => s.id === l.sku_id);
        rows.push(
          [
            `"${comp.code}"`,
            `"${comp.name.replace(/"/g, '""')}"`,
            `"${o.order_number}"`,
            `"${o.order_date}"`,
            `"${o.status}"`,
            `"${o.channel}"`,
            `"${o.beat_name.replace(/"/g, '""')}"`,
            `"${o.retailer_name_raw.replace(/"/g, '""')}"`,
            `"${gstin}"`,
            `"${skuObj?.code || 'SKU-00'}"`,
            `"${l.sku_name.replace(/"/g, '""')}"`,
            l.quantity,
            l.unit_price,
            l.total,
            `"${l.is_below_cost ? 'YES' : 'NO'}"`
          ].join(',')
        );
      });
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `${comp.code}_Detailed_Store_Orders_${compilationDate}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`Exported itemized store orders file ${filename} for ${comp.name}!`);
  };

  // 3. EXPORT ALL COMPANIES MASTER CONSOLIDATED SUMMARY PO CSV
  const handleExportAllCompaniesMasterCsv = () => {
    const allVerifiedOrders = orders.filter((o) =>
      o.status === 'VERIFIED_BY_BILLING' || o.status === 'APPROVED' || o.status === 'CLEARED' || o.status === 'INVOICED'
    );

    if (allVerifiedOrders.length === 0) {
      alert('No verified orders found across any principal company.');
      return;
    }

    const headers = [
      'Principal Company Code',
      'Principal Company Name',
      'SKU Code',
      'Product Description',
      'Pack Size',
      'Consolidated Qty (Pcs)',
      'Unit Rate (INR)',
      'Total Value (INR)',
      'Verified Store Orders Count'
    ];

    const masterRows: string[] = [];

    companies.forEach((comp) => {
      const compOrders = allVerifiedOrders.filter((o) =>
        o.company_id === comp.id ||
        (o.company_ids && o.company_ids.includes(comp.id)) ||
        (o.lines && o.lines.some((l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id))
      );
      if (compOrders.length === 0) return;

      const skuMap: Record<
        string,
        { code: string; name: string; pack: string; quantity: number; unit_price: number; total: number }
      > = {};

      compOrders.forEach((o) => {
        const compLines = (o.lines || []).filter(
          (l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id
        );
        compLines.forEach((l) => {
          const skuObj = skus.find((s) => s.id === l.sku_id);
          if (!skuMap[l.sku_id]) {
            skuMap[l.sku_id] = {
              code: skuObj?.code || 'SKU-00',
              name: l.sku_name,
              pack: skuObj?.pack_size || '1x12',
              quantity: 0,
              unit_price: l.unit_price,
              total: 0,
            };
          }
          skuMap[l.sku_id].quantity += l.quantity;
          skuMap[l.sku_id].total += l.total;
        });
      });

      Object.values(skuMap).forEach((r) => {
        masterRows.push(
          [
            `"${comp.code}"`,
            `"${comp.name.replace(/"/g, '""')}"`,
            `"${r.code}"`,
            `"${r.name.replace(/"/g, '""')}"`,
            `"${r.pack}"`,
            r.quantity,
            r.unit_price,
            r.total,
            compOrders.length
          ].join(',')
        );
      });
    });

    const csvContent = [headers.join(','), ...masterRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `ALL_PRINCIPAL_COMPANIES_VERIFIED_PRIMARY_PO_${compilationDate}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`Master All-Companies Verified Orders PO (${filename}) generated successfully!`);
  };

  // 4. EXPORT ALL COMPANIES MASTER DETAILED STORE LINES CSV
  const handleExportAllCompaniesDetailedCsv = () => {
    const allVerifiedOrders = orders.filter((o) =>
      o.status === 'VERIFIED_BY_BILLING' || o.status === 'APPROVED' || o.status === 'CLEARED' || o.status === 'INVOICED'
    );

    if (allVerifiedOrders.length === 0) {
      alert('No verified store orders found across any principal company.');
      return;
    }

    const headers = [
      'Company Code',
      'Company Name',
      'Order Number',
      'Order Date',
      'Status',
      'Channel',
      'Beat Name',
      'Retailer Outlet Name',
      'Retailer GSTIN',
      'SKU Code',
      'SKU Description',
      'Quantity',
      'Unit Price (INR)',
      'Total (INR)'
    ];

    const masterRows: string[] = [];

    allVerifiedOrders.forEach((o) => {
      const ret = retailers.find((r) => r.id === o.retailer_id);
      const gstin = ret?.gstin || 'URP';

      (o.lines || []).forEach((l) => {
        const skuObj = skus.find((s) => s.id === l.sku_id);
        const comp = companies.find((c) => c.id === l.company_id) || getCompanyForSku(l.sku_id) || companies.find((c) => c.id === o.company_id);
        const compCode = comp?.code || 'COMP';
        const compName = comp?.name || 'Company';

        masterRows.push(
          [
            `"${compCode}"`,
            `"${compName.replace(/"/g, '""')}"`,
            `"${o.order_number}"`,
            `"${o.order_date}"`,
            `"${o.status}"`,
            `"${o.channel}"`,
            `"${o.beat_name.replace(/"/g, '""')}"`,
            `"${o.retailer_name_raw.replace(/"/g, '""')}"`,
            `"${gstin}"`,
            `"${skuObj?.code || 'SKU-00'}"`,
            `"${l.sku_name.replace(/"/g, '""')}"`,
            l.quantity,
            l.unit_price,
            l.total
          ].join(',')
        );
      });
    });

    const csvContent = [headers.join(','), ...masterRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `ALL_COMPANIES_STORE_WISE_VERIFIED_LINES_${compilationDate}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`Exported Master Store-Wise Verified Lines CSV (${filename}) successfully!`);
  };

  // 6. DIRECTLY MARK ORDERS AS PUNCHED TO PRINCIPAL COMPANY (BATCH / COMPILED LEVEL)
  const handleMarkAsPunchedToPrincipal = (comp: typeof companies[0], companyOrders: Order[]) => {
    if (companyOrders.length === 0) {
      alert(`No compiled orders available to mark as punched for ${comp.name}`);
      return;
    }

    const targetOrders = companyOrders.filter((o) => o.status !== 'PUNCHED_TO_PRINCIPAL');
    const ordersToUpdate = targetOrders.length > 0 ? targetOrders : companyOrders;

    ordersToUpdate.forEach((o) => {
      updateOrderStatus(o.id, 'PUNCHED_TO_PRINCIPAL');
    });

    // Record Audit Log
    const newLog: AuditBatchLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      company_name: comp.name,
      company_code: comp.code,
      order_count: ordersToUpdate.length,
      sku_count: 0,
      total_quantity: ordersToUpdate.reduce((s, o) => {
        const compLines = (o.lines || []).filter((l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id);
        return s + compLines.reduce((q, l) => q + l.quantity, 0);
      }, 0),
      total_value: ordersToUpdate.reduce((s, o) => {
        const compLines = (o.lines || []).filter((l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id);
        return s + compLines.reduce((q, l) => q + l.total, 0);
      }, 0),
      exported_by: 'Order Puncher / Sub-Admin (Company Batch Punch)',
      file_name: 'Status Marked: PUNCHED_TO_PRINCIPAL',
    };
    setAuditLogs([newLog, ...auditLogs]);

    alert(`Marked compiled batch of ${ordersToUpdate.length} store order(s) for ${comp.name} as "PUNCHED TO PRINCIPAL COMPANY".\n\nAll underlying Commission Agent and Sub-Distributor store orders have automatically updated to "Punched to Principal".`);
  };

  // 7. BATCH PUNCH ALL VERIFIED ORDERS ACROSS ALL PRINCIPAL COMPANIES AT ONCE
  const handlePunchAllCompaniesBatch = () => {
    let totalPunched = 0;
    companies.forEach((comp) => {
      const companyOrders = getCompanyCompilationOrders(comp).filter(
        (o) => o.status !== 'PUNCHED_TO_PRINCIPAL' && o.status !== 'CANCELLED' && o.status !== 'FLAGGED'
      );
      if (companyOrders.length > 0) {
        companyOrders.forEach((o) => {
          updateOrderStatus(o.id, 'PUNCHED_TO_PRINCIPAL');
          totalPunched++;
        });

        const newLog: AuditBatchLog = {
          id: `log_${Date.now()}_${comp.code}`,
          timestamp: new Date().toLocaleString(),
          company_name: comp.name,
          company_code: comp.code,
          order_count: companyOrders.length,
          sku_count: 0,
          total_quantity: companyOrders.reduce((s, o) => {
            const compLines = (o.lines || []).filter((l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id);
            return s + compLines.reduce((q, l) => q + l.quantity, 0);
          }, 0),
          total_value: companyOrders.reduce((s, o) => {
            const compLines = (o.lines || []).filter((l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id);
            return s + compLines.reduce((q, l) => q + l.total, 0);
          }, 0),
          exported_by: 'Order Puncher / Sub-Admin (All-Company Batch Punch)',
          file_name: 'Status Marked: PUNCHED_TO_PRINCIPAL',
        };
        setAuditLogs((prev) => [newLog, ...prev]);
      }
    });

    if (totalPunched === 0) {
      alert('No pending verified orders found to punch across any principal company.');
    } else {
      alert(`Successfully punched ${totalPunched} compiled order(s) across all Principal Companies to the Principal Portal!\n\nAll Commission Agents and Sub-Distributors will now see their orders marked as "PUNCHED TO PRINCIPAL".`);
    }
  };

  // 5. COPY SUMMARY TEXT TO CLIPBOARD FOR QUICK PORTAL PASTE
  const handleCopyCompanySummaryText = (comp: typeof companies[0], companyOrders: Order[]) => {
    if (companyOrders.length === 0) {
      alert(`No verified orders to copy for ${comp.name}`);
      return;
    }

    const skuMap: Record<string, { code: string; name: string; quantity: number; unit_price: number; total: number }> = {};
    companyOrders.forEach((o) => {
      const compLines = (o.lines || []).filter(
        (l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id
      );
      compLines.forEach((l) => {
        const skuObj = skus.find((s) => s.id === l.sku_id);
        if (!skuMap[l.sku_id]) {
          skuMap[l.sku_id] = {
            code: skuObj?.code || 'SKU-00',
            name: l.sku_name,
            quantity: 0,
            unit_price: l.unit_price,
            total: 0,
          };
        }
        skuMap[l.sku_id].quantity += l.quantity;
        skuMap[l.sku_id].total += l.total;
      });
    });

    const linesText = Object.values(skuMap)
      .map((r) => `${r.code} | ${r.name} | Qty: ${r.quantity} pcs | Rate: ₹${r.unit_price} | Total: ₹${r.total}`)
      .join('\n');

    const totalQty = Object.values(skuMap).reduce((s, r) => s + r.quantity, 0);
    const totalVal = Object.values(skuMap).reduce((s, r) => s + r.total, 0);

    const fullText = `=== PRINCIPAL PURCHASE ORDER FOR ${comp.name.toUpperCase()} (${comp.code}) ===\nDate: ${compilationDate}\nGSTIN: ${comp.gstin}\nVerified Store Orders Included: ${companyOrders.length}\n------------------------------------------------\n${linesText}\n------------------------------------------------\nTOTAL CONSOLIDATED QUANTITY: ${totalQty} pcs\nTOTAL PRIMARY PO GROSS VALUE: ₹${totalVal.toLocaleString('en-IN')}\n================================================`;

    navigator.clipboard.writeText(fullText);
    alert(`Copied ${comp.name} primary purchase order summary text to clipboard!\nYou can paste this directly into the ${comp.name} portal.`);
  };

  const handleCreateRetailer = (e: React.FormEvent) => {
    e.preventDefault();

    const nameVal = validateStoreName(newRetName);
    if (!nameVal.isValid) {
      alert(`Outlet Name Error:\n\n${nameVal.error}`);
      return;
    }

    const phoneVal = validatePhoneNumber(newRetPhone);
    if (!phoneVal.isValid) {
      alert(`Contact Number Error:\n\n${phoneVal.error}`);
      return;
    }

    const cleanPhone = phoneVal.formatted!;
    // Check unique identifier (Phone number)
    const existing = retailers.find((r) => r.phone.trim().replace(/\D/g, '') === cleanPhone);
    if (existing) {
      setDuplicateAlertInfo({ cleanPhone, existingStore: existing });
      return;
    }

    const selectedBeatObj = beats.find((b) => b.id === newRetBeatId) || beats[0];
    const cleanBeat = selectedBeatObj ? selectedBeatObj.name : 'Central GT Beat';

    const gstinVal = validateGSTIN(newRetGstin, false);
    if (!gstinVal.isValid) {
      alert(
        `GSTIN Validation Error:\n\n${gstinVal.error}\n\n• If this retailer is unregistered under GST or is a composition dealer, please leave the GSTIN field empty.\n• If registered, enter the complete 15-character GSTIN (e.g., 27AAAAA0000A1Z5).`
      );
      return;
    }

    const cleanName = nameVal.formatted!;
    const cleanGstin = gstinVal.formatted || null;

    const newRet = {
      id: `ret_${Date.now()}`,
      tenant_id: activeTenant.id,
      name: cleanName,
      code: `RET-${Math.floor(100 + Math.random() * 900)}`,
      channel: newRetChannel,
      beat_name: cleanBeat,
      beat_id: selectedBeatObj?.id,
      gstin: cleanGstin,
      address: `${cleanBeat} Market Route`,
      contact_person: newRetOwner.trim() || 'Store Owner',
      phone: cleanPhone,
      phase_status: 'ACTIVE' as const,
      credit_limit: activeTenantSettings.credit_limit_default || 50000,
      current_outstanding: 0,
    };

    addRetailer(newRet);

    // Reset Form
    setNewRetName('');
    setNewRetPhone('');
    setNewRetGstin('');
    setNewRetOwner('');
    setIsAddRetailerOpen(false);

    // Display rich store onboarding success modal
    setOnboardedStoreSuccess(newRet);
  };

  return (
    <div className="space-y-6">
      {/* Role Banner Callout */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <ShoppingCart size={16} /> Order Puncher Control Hub — Sanity Check & Principal Portal Compilation
          </div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            Order Review, Sanity-Check & Company-Wise Portal Compilation
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">
            Order Puncher owns review and exception-handling for all system-captured orders across General Trade (Agents), MT/HoReCa, Institutional, and 5 PM App Direct Imports. Export clean, company-wise SKU files for principal portal upload without re-typing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddRetailerOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
            title="Onboard new retailer / sub-distributor outlet"
          >
            <UserCheck size={15} /> Onboard New Store
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Consolidated Queue"
          value={totalCapturedCount}
          delta={{ value: '100% Captured', isPositive: true, label: 'omnichannel' }}
          icon={ShoppingCart}
          subtext="Total orders in queue"
        />
        <KPICard
          title="Pending Sanity Check"
          value={pendingReviewCount}
          delta={{ value: `${pendingReviewCount} orders`, isPositive: false, label: 'needs review' }}
          icon={Clock}
          subtext="Punched status"
          accentColor="#f59e0b"
        />
        <KPICard
          title="Cleared for Compilation"
          value={clearedCount}
          delta={{ value: 'Sanity Passed', isPositive: true, label: 'ready for export' }}
          icon={CheckCircle2}
          subtext="Cleared / Approved"
          accentColor="#10b981"
        />
        <KPICard
          title="Exception / Flagged"
          value={flaggedCount}
          delta={{ value: 'Sanity Exceptions', isPositive: false, label: 'requires action' }}
          icon={AlertOctagon}
          subtext="Flagged or below cost"
          accentColor="#f43f5e"
        />
      </div>

      {/* Parallel Notifications Banner for Order Puncher */}
      {workflowNotifications && workflowNotifications.filter((n) => !n.is_read && n.target_roles.includes('ORDER_PUNCHER')).length > 0 && (
        <div className="bg-indigo-950/60 border border-indigo-500/40 p-3.5 rounded-2xl space-y-2 shadow-md">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <AlertCircle size={15} className="text-indigo-400" />
              Parallel Alerts Feed: Verified Orders & Principal Shipments
            </span>
            <span className="text-[11px] text-indigo-400 font-mono">
              {workflowNotifications.filter((n) => !n.is_read && n.target_roles.includes('ORDER_PUNCHER')).length} Active Alert(s)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {workflowNotifications
              .filter((n) => !n.is_read && n.target_roles.includes('ORDER_PUNCHER'))
              .slice(0, 4)
              .map((notif) => (
                <div key={notif.id} className="bg-slate-950/80 border border-indigo-900/60 p-2.5 rounded-xl flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-white text-[11px] flex items-center gap-1.5">
                      <span className="px-1.5 py-0.2 rounded bg-indigo-600/30 text-indigo-300 text-[9px] border border-indigo-500/30 font-mono">
                        {notif.type}
                      </span>
                      {notif.title}
                    </div>
                    <p className="text-slate-300 text-[11px] mt-0.5">{notif.message}</p>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">{new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <button
                    onClick={() => markNotificationAsRead(notif.id)}
                    className="text-[10px] text-indigo-400 hover:text-white px-2 py-1 rounded bg-indigo-900/40 border border-indigo-700/40 shrink-0 font-medium"
                  >
                    Acknowledge
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Primary Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('DISTRIBUTORS_INSTITUTIONS')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'DISTRIBUTORS_INSTITUTIONS'
              ? 'bg-purple-600 text-white font-bold'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Building2 size={15} />
          {activeRole === 'BILLING' ? '★ ' : ''}Distributors & Institutions ({distributorOrdersCount})
        </button>

        <button
          onClick={() => setActiveTab('REVIEW_QUEUE')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'REVIEW_QUEUE'
              ? 'bg-blue-600 text-white font-bold'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Layers size={15} />
          1. Consolidated Review Queue ({filteredOrders.length})
        </button>

        <button
          onClick={() => setActiveTab('COMPANY_COMPILATION')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'COMPANY_COMPILATION'
              ? 'bg-blue-600 text-white font-bold'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileSpreadsheet size={15} />
          2. SKU-Wise Principle PO Consolidation
        </button>

        <button
          onClick={() => setActiveTab('PRINCIPLE_POS')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'PRINCIPLE_POS'
              ? 'bg-blue-600 text-white font-bold'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Building size={15} />
          3. Principle Purchase Orders (POs) ({purchaseOrders.length})
        </button>

        <button
          onClick={() => setActiveTab('AUDIT_LOGS')}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'AUDIT_LOGS'
              ? 'bg-blue-600 text-white font-bold'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileText size={15} />
          4. Portal History ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: CONSOLIDATED ORDER REVIEW QUEUE */}
      {activeTab === 'REVIEW_QUEUE' && (
        <div className="space-y-4">
          {/* Filters & Search Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Channel Filter */}
              <div className="flex items-center gap-1.5">
                <Filter size={14} className="text-slate-400" />
                <span className="text-slate-400 font-medium">Channel:</span>
                <select
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white"
                >
                  <option value="ALL">All Channels (GT, MT, Inst, Dist, App)</option>
                  <option value="DISTRIBUTOR">Distributor / Super Stockist</option>
                  <option value="INSTITUTIONAL">Institutional</option>
                  <option value="GT">GT (Agent Field Orders)</option>
                  <option value="MT">MT / HoReCa Direct</option>
                  <option value="DIRECT">Direct Office</option>
                </select>
              </div>

              {/* Company Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Principal Company:</span>
                <select
                  value={filterCompany}
                  onChange={(e) => setFilterCompany(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white"
                >
                  <option value="ALL">All Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Commission Agent / Puncher Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Agent / Creator:</span>
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white"
                >
                  <option value="ALL">All Agents / Punchers</option>
                  {users
                    .filter((u) => u.tenant_id === activeTenant?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Sanity Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-semibold"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING_VERIFICATION">PENDING_VERIFICATION (Agent Punched)</option>
                  <option value="PUNCHED">PUNCHED (Awaiting Review)</option>
                  <option value="VERIFIED_BY_BILLING">VERIFIED_BY_BILLING</option>
                  <option value="CLEARED">CLEARED (Sanity Passed)</option>
                  <option value="FLAGGED">FLAGGED (Sanity Exception)</option>
                  <option value="APPROVED">APPROVED (Compiled & Exported)</option>
                  <option value="PUNCHED_TO_PRINCIPAL">PUNCHED TO PRINCIPAL</option>
                  <option value="DELIVERED">DELIVERED</option>
                </select>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search order #, retailer, beat, agent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Active Filter Criteria Summary Bar */}
          {(filterCompany !== 'ALL' || filterAgent !== 'ALL' || filterChannel !== 'ALL' || filterStatus !== 'ALL') && (
            <div className="bg-blue-950/40 border border-blue-800/60 px-4 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="text-blue-400 font-bold">Filtered View:</span>
                <span>
                  Showing <strong className="text-white">{filteredOrders.length}</strong> of {orders.length} orders
                </span>
                {filterCompany !== 'ALL' && (
                  <span className="bg-blue-900/60 text-blue-200 px-2 py-0.5 rounded text-[11px] border border-blue-700/50">
                    Company: {companies.find((c) => c.id === filterCompany)?.name || filterCompany} (Portion: ₹{filteredValueSum.toLocaleString('en-IN')})
                  </span>
                )}
                {filterAgent !== 'ALL' && (
                  <span className="bg-indigo-900/60 text-indigo-200 px-2 py-0.5 rounded text-[11px] border border-indigo-700/50">
                    Agent: {users.find((u) => u.id === filterAgent)?.name || filterAgent}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setFilterCompany('ALL');
                  setFilterAgent('ALL');
                  setFilterChannel('ALL');
                  setFilterStatus('ALL');
                  setSearchQuery('');
                }}
                className="text-xs text-blue-400 hover:text-blue-300 underline font-semibold"
              >
                Reset Filters
              </button>
            </div>
          )}

          {/* Review Queue Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Order # & Source</th>
                    <th className="py-3 px-4">Agent / Creator</th>
                    <th className="py-3 px-4">Channel & Beat</th>
                    <th className="py-3 px-4">Retailer / Buyer</th>
                    <th className="py-3 px-4">Principal Companies</th>
                    <th className="py-3 px-4 text-right">Order Value (₹)</th>
                    <th className="py-3 px-4 text-center">Below Cost</th>
                    <th className="py-3 px-4">Sanity Status</th>
                    <th className="py-3 px-4 text-right">Sanity Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No orders match the selected filters in tenant "{activeTenant?.name || 'Active Tenant'}".
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => {
                      const isFlagged = o.status === 'FLAGGED' || Boolean(o.exception_comment);

                      // Distinct companies in this order
                      const distinctCompIds = Array.from(
                        new Set([
                          ...(o.company_ids || []),
                          ...(o.company_id ? [o.company_id] : []),
                          ...(o.lines || []).map((l) => l.company_id || getCompanyForSku(l.sku_id)?.id).filter(Boolean),
                        ])
                      ) as string[];
                      const distinctComps = distinctCompIds.map((cid) => companies.find((c) => c.id === cid)).filter(Boolean);

                      // Filtered company share if company filter is active
                      const compShare =
                        filterCompany !== 'ALL'
                          ? (o.lines || [])
                              .filter((l) => l.company_id === filterCompany || getCompanyForSku(l.sku_id)?.id === filterCompany)
                              .reduce((s, l) => s + l.total, 0)
                          : null;

                      // Agent name
                      const agentName =
                        o.commission_agent_name ||
                        users.find((u) => u.id === o.commission_agent_id || u.id === o.created_by_user_id)?.name ||
                        'Direct Office';

                      return (
                        <tr
                          key={o.id}
                          className={`hover:bg-slate-800/60 transition-colors ${
                            isFlagged ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-semibold text-white">
                            <div className="flex items-center gap-1.5">
                              {o.order_number}
                              {o.source_type === 'APP_DIRECT_IMPORT' && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                                  APP 5PM
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-sans">{o.order_date}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{agentName}</div>
                            <div className="text-[10px] text-slate-500">{o.source_type || 'Commission Agent'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-300">{o.channel}</span>
                            <div className="text-[10px] text-slate-500">{o.beat_name}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-200">
                            {o.retailer_name_raw}
                            {o.retailer_id ? (
                              <span className="ml-1 text-[9px] text-emerald-400 font-mono">(Verified)</span>
                            ) : (
                              <span className="ml-1 text-[9px] text-amber-400 font-mono">(Unverified)</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {distinctComps.length > 1 ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold text-[10px]">
                                    Multi ({distinctComps.length})
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {distinctComps.map((c) => (
                                    <span
                                      key={c.id}
                                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                                        filterCompany === c.id
                                          ? 'bg-blue-600 text-white border-blue-500'
                                          : 'bg-slate-800 text-slate-300 border-slate-700'
                                      }`}
                                    >
                                      {c.code}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-slate-300 font-bold">
                                {distinctComps[0]?.code || 'N/A'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            ₹{o.total_amount.toLocaleString('en-IN')}
                            {compShare !== null && compShare !== o.total_amount && (
                              <div className="text-[10px] text-amber-300 font-sans font-medium">
                                Filtered: ₹{compShare.toLocaleString('en-IN')}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {o.has_below_cost_lines ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[10px]">
                                YES
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">NO</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-block w-max ${
                                  o.status === 'PUNCHED_TO_PRINCIPAL'
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    : o.status === 'VERIFIED_BY_BILLING'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : o.status === 'CLEARED'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : o.status === 'FLAGGED'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : o.status === 'APPROVED'
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {o.status === 'PUNCHED_TO_PRINCIPAL'
                                  ? 'PUNCHED TO PRINCIPAL'
                                  : o.status === 'PUNCHED'
                                  ? 'Awaiting Sanity Check'
                                  : o.status}
                              </span>
                              {o.exception_comment && (
                                <span className="text-[10px] text-rose-400 italic max-w-xs truncate">
                                  {o.exception_comment}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right space-x-1">
                            <button
                              onClick={() => handleOpenOrderDetail(o)}
                              className="px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:text-white text-[10px] font-semibold"
                            >
                              View/Edit
                            </button>

                            {/* Delivery Action depending on verification status */}
                            {o.status === 'DELIVERED' ? (
                              <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] inline-flex items-center gap-1">
                                <CheckCircle2 size={11} className="text-emerald-400" /> Delivered
                              </span>
                            ) : o.status === 'PENDING_VERIFICATION' || o.status === 'PUNCHED' ? (
                              <span
                                title="Delivery Locked: Billing Executive must verify this order before Commission Agent can mark delivered"
                                className="px-2 py-1 rounded bg-slate-800/80 text-slate-500 border border-slate-700 text-[10px] font-semibold cursor-not-allowed inline-flex items-center gap-1"
                              >
                                <Lock size={10} /> Pending Verification
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  updateOrderStatus(o.id, 'DELIVERED');
                                  alert(`Order ${o.order_number} marked as DELIVERED!\nRetailer outstanding balance updated.`);
                                }}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-sm inline-flex items-center gap-1"
                                title="Click to mark order delivered to retailer outlet"
                              >
                                <Truck size={10} /> Mark Delivered
                              </button>
                            )}

                            {o.status === 'PUNCHED_TO_PRINCIPAL' ? (
                              <span className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold text-[10px] inline-flex items-center gap-1">
                                <CheckCircle2 size={11} className="text-indigo-400" /> Punched in Batch
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setActiveTab('COMPANY_COMPILATION');
                                  setExpandedCompanyId(distinctCompIds[0] || o.company_id);
                                }}
                                className="px-2 py-1 rounded bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-200 border border-indigo-700/50 text-[10px] font-bold"
                                title="Punching is done at the compiled Principal Company level. Click to open Company Batch compilation."
                              >
                                Company Batch Punch →
                              </button>
                            )}

                            {o.status === 'PUNCHED' && (
                              <>
                                <button
                                  onClick={() => handleMarkCleared(o.id)}
                                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold"
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => setFlaggingOrder(o)}
                                  className="px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700 text-[10px] font-semibold"
                                >
                                  Flag
                                </button>
                              </>
                            )}

                            {o.status === 'FLAGGED' && (
                              <button
                                onClick={() => updateOrderStatus(o.id, 'CLEARED')}
                                className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold"
                              >
                                Resolve
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COMPANY-WISE ORDER COMPILATION & PORTAL EXPORT */}
      {activeTab === 'COMPANY_COMPILATION' && (
        <div className="space-y-6">
          {/* Top Operational Workflow Callout Banner */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3 max-w-3xl">
              <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30 mt-0.5">
                <FileCheck size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-blue-400">
                  Principal Company Portal Export Engine
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Company-Wise Order Compilation for Manual Principal Portal Upload
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Orders verified by billing executives or cleared by sanity checks are aggregated SKU-wise for each principal company (e.g., Britannia, Marico, Parle, ITC, Dabur). Export consolidated primary PO CSVs or copy formatted order text to manually place orders on principal portals without re-keying data.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handlePunchAllCompaniesBatch}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-900/40"
                title="Mark ALL compiled store orders across ALL principal companies as PUNCHED TO PRINCIPAL COMPANY in one click"
              >
                <CheckSquare size={15} /> Punch ALL Compiled Orders to Principal
              </button>
              <button
                onClick={handleExportAllCompaniesMasterCsv}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-900/30"
                title="Export single CSV containing primary POs for all companies & update statuses"
              >
                <Download size={14} /> Export All Companies Master PO (CSV)
              </button>
              <button
                onClick={handleExportAllCompaniesDetailedCsv}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-1.5"
                title="Export itemized store-level line items for all companies"
              >
                <FileSpreadsheet size={14} /> Export Master Store Lines (CSV)
              </button>
            </div>
          </div>

          {/* Compilation Scope Controls & Date Picker Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-slate-400 font-semibold flex items-center gap-1">
                <Filter size={13} className="text-blue-400" /> Filter Scope:
              </span>
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setCompilationStatusScope('VERIFIED_ONLY')}
                  className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors flex items-center gap-1 ${
                    compilationStatusScope === 'VERIFIED_ONLY'
                      ? 'bg-blue-600 text-white shadow-sm font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  Verified by Billing Executives ({verifiedByBillingCount})
                </button>
                <button
                  onClick={() => setCompilationStatusScope('ALL_CLEARED')}
                  className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors ${
                    compilationStatusScope === 'ALL_CLEARED'
                      ? 'bg-blue-600 text-white shadow-sm font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Cleared & Invoiced Orders ({clearedCount})
                </button>
                <button
                  onClick={() => setCompilationStatusScope('ALL_INCL_PUNCHED')}
                  className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors ${
                    compilationStatusScope === 'ALL_INCL_PUNCHED'
                      ? 'bg-blue-600 text-white shadow-sm font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Non-Flagged System Orders ({orders.filter((o) => o.status !== 'FLAGGED').length})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Batch Date:</span>
              <input
                type="date"
                value={compilationDate}
                onChange={(e) => setCompilationDate(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {/* Principal Companies Aggregated Sections */}
          <div className="space-y-6">
            {companies.map((comp) => {
              const companyOrders = getCompanyCompilationOrders(comp);

              // Build SKU aggregation (strictly filtered for this company's lines)
              const skuAggMap: Record<
                string,
                { code: string; name: string; pack: string; quantity: number; unit_price: number; total: number }
              > = {};

              companyOrders.forEach((o) => {
                const compLines = (o.lines || []).filter(
                  (l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id
                );
                compLines.forEach((l) => {
                  const skuObj = skus.find((s) => s.id === l.sku_id);
                  if (!skuAggMap[l.sku_id]) {
                    skuAggMap[l.sku_id] = {
                      code: skuObj?.code || 'SKU-00',
                      name: l.sku_name,
                      pack: skuObj?.pack_size || '1x12',
                      quantity: 0,
                      unit_price: l.unit_price,
                      total: 0,
                    };
                  }
                  skuAggMap[l.sku_id].quantity += l.quantity;
                  skuAggMap[l.sku_id].total += l.total;
                });
              });

              const skuList = Object.values(skuAggMap);
              const totalCompanyQty = skuList.reduce((sum, r) => sum + r.quantity, 0);
              const totalCompanyVal = skuList.reduce((sum, r) => sum + r.total, 0);
              const isExpanded = expandedCompanyId === comp.id;

              return (
                <div key={comp.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
                  {/* Company Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 font-mono font-bold text-sm border border-blue-500/30">
                        {comp.code}
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          {comp.name}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            GST: {comp.gstin}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          <span className="text-emerald-400 font-bold">{companyOrders.length} Verified Store Orders</span> | {skuList.length} Unique SKUs | Total PO Gross Value: <span className="text-white font-semibold">₹{totalCompanyVal.toLocaleString('en-IN')}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          const items = skuList.map((item) => {
                            const skuObj = skus.find((s) => s.name === item.name || s.code === item.code);
                            const landing = skuObj?.landing_price || item.unit_price * 0.85;
                            return {
                              sku_id: skuObj?.id || item.code,
                              sku_code: item.code,
                              sku_name: item.name,
                              pack_size: item.pack,
                              total_quantity: item.quantity,
                              master_landing_price: landing,
                              store_avg_price: item.unit_price,
                              total_landing_amount: item.quantity * landing,
                              verified: true,
                            };
                          });
                          setRateVerifyModal({
                            company: comp,
                            orders: companyOrders,
                            items,
                          });
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-900/30"
                        title="Audit rates, margins, and quantities before submitting PO to Principal Company"
                      >
                        <ShieldCheck size={14} /> Verify Rates & Quantities (Gate)
                      </button>
                      <button
                        onClick={() => {
                          if (companyOrders.length === 0) {
                            alert('No verified store orders to generate PO.');
                            return;
                          }
                          const poNumber = `PO-${comp.code}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
                          const items = skuList.map((item) => {
                            const skuObj = skus.find((s) => s.name === item.name || s.code === item.code);
                            const landing = skuObj?.landing_price || item.unit_price * 0.85;
                            return {
                              sku_id: skuObj?.id || item.code,
                              sku_code: item.code,
                              sku_name: item.name,
                              pack_size: item.pack,
                              total_quantity: item.quantity,
                              demanded_quantity: item.quantity,
                              purchase_price: landing,
                              master_landing_price: landing,
                              total_amount: item.quantity * landing,
                              verified_rate: true,
                              is_rate_verified: true,
                            };
                          });
                          const totalPOVal = items.reduce((s, i) => s + i.total_amount, 0);
                          const totalPOUnits = items.reduce((s, i) => s + i.total_quantity, 0);

                          addPurchaseOrder({
                            id: `po_${Date.now()}_${comp.code.toLowerCase()}`,
                            tenant_id: activeTenant?.id || 't1',
                            po_number: poNumber,
                            company_id: comp.id,
                            company_name: comp.name,
                            company_code: comp.code,
                            status: 'SUBMITTED_TO_PRINCIPLE',
                            gate_verified_by: 'Vikram Singh (Order Puncher)',
                            items,
                            total_quantity: totalPOUnits,
                            total_amount: totalPOVal,
                            created_at: new Date().toISOString(),
                            submitted_at: new Date().toISOString(),
                            linked_order_ids: companyOrders.map((o) => o.id),
                            notes: `Generated from ${companyOrders.length} verified store orders. Sent to ${comp.name} ERP portal.`,
                          });

                          // Update linked store orders
                          companyOrders.forEach((o) => {
                            updateOrderStatus(o.id, 'PUNCHED_TO_PRINCIPAL');
                          });

                          alert(`✅ Principle Purchase Order ${poNumber} submitted to ${comp.name}!\n\n• ${items.length} SKUs\n• ${totalPOUnits.toLocaleString()} units\n• ₹${totalPOVal.toLocaleString('en-IN')} Landing Value\n\nOrders updated to PUNCHED TO PRINCIPAL.`);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-900/30"
                        title="Generate and submit PO to Principle Company"
                      >
                        <Building size={14} /> Submit Principle PO
                      </button>
                      <button
                        onClick={() => handleExportCompanyCsv(comp, companyOrders)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5"
                        title="Download primary purchase order CSV aggregated SKU-wise"
                      >
                        <Download size={14} /> Export PO (CSV)
                      </button>
                      <button
                        onClick={() => handleCopyCompanySummaryText(comp, companyOrders)}
                        className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-semibold text-xs flex items-center gap-1.5"
                        title="Copy text summary to paste in manufacturer portal"
                      >
                        <Copy size={13} /> Copy Text
                      </button>
                      <button
                        onClick={() => setExpandedCompanyId(isExpanded ? null : comp.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? 'Hide Stores' : `Store Orders (${companyOrders.length})`}
                      </button>
                    </div>
                  </div>

                  {/* Aggregated SKU Table */}
                  {skuList.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-xs italic bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                      No verified store orders captured for {comp.name} under current filter scope.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                              <th className="py-2.5 px-3">SKU Code</th>
                              <th className="py-2.5 px-3">Product Description</th>
                              <th className="py-2.5 px-3">Pack Size</th>
                              <th className="py-2.5 px-3 text-right">Consolidated Qty (pcs)</th>
                              <th className="py-2.5 px-3 text-right">Rate (₹)</th>
                              <th className="py-2.5 px-3 text-right">Total Gross Value (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-200">
                            {skuList.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40 font-mono text-[11px]">
                                <td className="py-2 px-3 font-bold text-blue-400">{item.code}</td>
                                <td className="py-2 px-3 font-sans font-semibold text-white">{item.name}</td>
                                <td className="py-2 px-3 font-sans text-slate-400">{item.pack}</td>
                                <td className="py-2 px-3 text-right font-bold text-amber-300">{item.quantity.toLocaleString()}</td>
                                <td className="py-2 px-3 text-right text-slate-300">₹{item.unit_price}</td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-400">₹{item.total.toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                            <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-xs">
                              <td colSpan={3} className="py-3 px-3 text-slate-300 uppercase font-sans">
                                Total Consolidated Primary Order for {comp.name}:
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-amber-300 text-sm">
                                {totalCompanyQty.toLocaleString()} pcs
                              </td>
                              <td className="py-3 px-3"></td>
                              <td className="py-3 px-3 text-right font-mono text-emerald-400 text-sm">
                                ₹{totalCompanyVal.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Expandable Store Orders Breakdown Drawer */}
                      {isExpanded && (
                        <div className="bg-slate-950/90 border border-slate-800 p-4 rounded-xl space-y-3">
                          <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-800 pb-2">
                            <span className="text-slate-300 flex items-center gap-1.5 font-bold">
                              <Building size={14} className="text-blue-400" />
                              Underlying Store Orders with {comp.code} SKUs ({companyOrders.length})
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {comp.code} Order Portion Total: <strong className="text-emerald-400 font-mono">₹{totalCompanyVal.toLocaleString('en-IN')}</strong>
                            </span>
                          </div>

                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {companyOrders.map((ord) => {
                              const compLines = (ord.lines || []).filter(
                                (l) => l.company_id === comp.id || getCompanyForSku(l.sku_id)?.id === comp.id
                              );
                              const compQty = compLines.reduce((s, l) => s + l.quantity, 0);
                              const compVal = compLines.reduce((s, l) => s + l.total, 0);

                              return (
                                <div
                                  key={ord.id}
                                  className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-blue-400">{ord.order_number}</span>
                                      <span className="text-slate-400">({ord.order_date})</span>
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                                        {ord.status === 'VERIFIED_BY_BILLING' ? 'VERIFIED BY BILLING' : ord.status}
                                      </span>
                                      {ord.commission_agent_name && (
                                        <span className="text-[10px] text-slate-400">
                                          Agent: {ord.commission_agent_name}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-slate-200 font-semibold mt-0.5">
                                      {ord.retailer_name_raw} <span className="text-slate-400 font-normal">| {ord.beat_name}</span>
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <div className="text-right">
                                      <div className="text-slate-400 text-[11px]">
                                        {compLines.length} {comp.code} SKUs | {compQty} Pcs
                                      </div>
                                      <div className="font-bold text-emerald-400 font-mono">
                                        ₹{compVal.toLocaleString('en-IN')}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => updateOrderStatus(ord.id, 'PUNCHED_TO_PRINCIPAL')}
                                      className="px-2 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-[10px] font-bold"
                                      title="Mark order as Punched to Principal Company"
                                    >
                                      Mark Punched
                                    </button>
                                    <button
                                      onClick={() => handleOpenOrderDetail(ord)}
                                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                                      title="View full order line details"
                                    >
                                      <Eye size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: PRINCIPLE PURCHASE ORDERS (POs) & FACTORY SHIPMENTS */}
      {activeTab === 'PRINCIPLE_POS' && (
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3 max-w-3xl">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 mt-0.5">
                <Building size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  Principle Company Fulfillment Pipeline
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Consolidated Principle Purchase Orders & In-Transit Factory Shipments
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Track all aggregated Purchase Orders submitted to Principal Companies (Britannia, Marico, Parle, etc.). Once the manufacturer confirms dispatch, mark as "Dispatched by Principle" to alert the Dispatcher for Inward Docking.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('COMPANY_COMPILATION')}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-900/30"
              >
                <Plus size={15} /> Consolidate New Principle PO
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold">Status Filter:</span>
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(['ALL', 'SUBMITTED_TO_PRINCIPLE', 'DISPATCHED_BY_PRINCIPLE', 'INWARDED_AT_DEPOT'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setPoStatusFilter(st)}
                    className={`px-3 py-1 rounded-md font-semibold text-xs transition-colors ${
                      poStatusFilter === st ? 'bg-indigo-600 text-white shadow-sm font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st === 'ALL'
                      ? `All (${purchaseOrders.length})`
                      : st === 'SUBMITTED_TO_PRINCIPLE'
                      ? `Submitted (${purchaseOrders.filter((p) => p.status === 'SUBMITTED_TO_PRINCIPLE').length})`
                      : st === 'DISPATCHED_BY_PRINCIPLE'
                      ? `In-Transit (${purchaseOrders.filter((p) => p.status === 'DISPATCHED_BY_PRINCIPLE').length})`
                      : `Inwarded (${purchaseOrders.filter((p) => p.status === 'INWARDED_AT_DEPOT').length})`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* PO List */}
          <div className="space-y-4">
            {purchaseOrders.filter((po) => poStatusFilter === 'ALL' || po.status === poStatusFilter).length === 0 ? (
              <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <Building size={32} className="mx-auto text-slate-600" />
                <p className="text-slate-400 font-medium text-sm">No Principle Purchase Orders match this filter.</p>
                <p className="text-slate-500 text-xs">Go to "SKU-Wise Principle PO Consolidation" to aggregate verified orders into a new PO.</p>
              </div>
            ) : (
              purchaseOrders
                .filter((po) => poStatusFilter === 'ALL' || po.status === poStatusFilter)
                .map((po) => {
                  const statusColors: Record<string, { bg: string; text: string; border: string; label: string }> = {
                    SUBMITTED_TO_PRINCIPLE: {
                      bg: 'bg-amber-500/10',
                      text: 'text-amber-400',
                      border: 'border-amber-500/30',
                      label: 'Submitted to Principle (Awaiting Factory Truck)',
                    },
                    DISPATCHED_BY_PRINCIPLE: {
                      bg: 'bg-indigo-500/10',
                      text: 'text-indigo-400',
                      border: 'border-indigo-500/30',
                      label: 'Factory Dispatched — In-Transit to Depot',
                    },
                    INWARDED_AT_DEPOT: {
                      bg: 'bg-emerald-500/10',
                      text: 'text-emerald-400',
                      border: 'border-emerald-500/30',
                      label: 'Stock Inwarded & Docked at Depot',
                    },
                  };

                  const currentSt = statusColors[po.status] || statusColors.SUBMITTED_TO_PRINCIPLE;

                  return (
                    <div key={po.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 font-mono font-bold text-sm border border-blue-500/30">
                            {po.company_code}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-white">{po.po_number}</h3>
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${currentSt.bg} ${currentSt.text} ${currentSt.border}`}>
                                {currentSt.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Principal: <strong className="text-white">{po.company_name}</strong> | Rate Gate Verified By: <strong className="text-indigo-300">{po.gate_verified_by}</strong> | Created: {new Date(po.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {po.status === 'SUBMITTED_TO_PRINCIPLE' && (
                            <button
                              onClick={() => {
                                updatePurchaseOrderStatus(po.id, 'DISPATCHED_BY_PRINCIPLE');
                                alert(`🚚 Principle Company ${po.company_name} factory dispatch simulated!\n\nStatus is now DISPATCHED_BY_PRINCIPLE.\nParallel alert sent to Dispatcher for Inward Docking.`);
                              }}
                              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-900/30"
                              title="Simulate manufacturer dispatching goods truck to depot"
                            >
                              <Truck size={14} /> Simulate Principle Factory Dispatch
                            </button>
                          )}
                          {po.status === 'DISPATCHED_BY_PRINCIPLE' && (
                            <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/60 border border-indigo-500/30">
                              <Clock size={13} className="animate-spin" /> In-Transit (Dispatcher can Inward at Dock)
                            </span>
                          )}
                          {po.status === 'INWARDED_AT_DEPOT' && (
                            <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30">
                              <CheckCircle2 size={13} /> Stock Docked at Depot ({new Date(po.inwarded_at || '').toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                              <th className="py-2.5 px-3">SKU Code</th>
                              <th className="py-2.5 px-3">Description</th>
                              <th className="py-2.5 px-3">Pack</th>
                              <th className="py-2.5 px-3 text-right">Demanded Units</th>
                              <th className="py-2.5 px-3 text-right">Master Landing Price (₹)</th>
                              <th className="py-2.5 px-3 text-right">Total Amount (₹)</th>
                              <th className="py-2.5 px-3 text-center">Rate Verified</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-200">
                            {po.items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40 font-mono text-[11px]">
                                <td className="py-2 px-3 font-bold text-blue-400">{item.sku_code}</td>
                                <td className="py-2 px-3 font-sans font-semibold text-white">{item.sku_name}</td>
                                <td className="py-2 px-3 font-sans text-slate-400">{item.pack_size}</td>
                                <td className="py-2 px-3 text-right font-bold text-amber-300">{(item.demanded_quantity ?? item.total_quantity ?? 0).toLocaleString()}</td>
                                <td className="py-2 px-3 text-right text-slate-300">₹{item.master_landing_price ?? item.purchase_price ?? 0}</td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-400">₹{item.total_amount.toLocaleString('en-IN')}</td>
                                <td className="py-2 px-3 text-center text-emerald-400 font-bold">✓ Verified</td>
                              </tr>
                            ))}
                            <tr className="bg-slate-950 font-bold border-t-2 border-slate-700 text-xs">
                              <td colSpan={3} className="py-3 px-3 text-slate-300 uppercase font-sans">
                                Total Purchase Order Value:
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-amber-300 text-sm">
                                {po.total_quantity.toLocaleString()} pcs
                              </td>
                              <td className="py-3 px-3"></td>
                              <td className="py-3 px-3 text-right font-mono text-emerald-400 text-sm">
                                ₹{po.total_amount.toLocaleString('en-IN')}
                              </td>
                              <td className="py-3 px-3"></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PORTAL SUBMISSION HISTORY */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText size={16} className="text-blue-400" /> Principal Portal Compilation Audit Trail
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Log of compiled order CSV exports generated for principal portals (Britannia, Marico, Parle, ITC, etc.).
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Export Timestamp</th>
                  <th className="py-3 px-4">Principal Company</th>
                  <th className="py-3 px-4 text-center">Orders Included</th>
                  <th className="py-3 px-4 text-center">SKU Count</th>
                  <th className="py-3 px-4 text-right">Total Quantity</th>
                  <th className="py-3 px-4 text-right">Total Value (₹)</th>
                  <th className="py-3 px-4">Exported File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono text-slate-400">{log.timestamp}</td>
                    <td className="py-3 px-4 font-bold text-white">
                      {log.company_name} ({log.company_code})
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-blue-400">{log.order_count}</td>
                    <td className="py-3 px-4 text-center font-mono">{log.sku_count}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-300">
                      {log.total_quantity.toLocaleString()} pcs
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      ₹{log.total_value.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1">
                        <Download size={12} className="text-blue-400" />
                        {log.file_name}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: DISTRIBUTORS & INSTITUTIONS (BE DIRECT SCOPE) */}
      {activeTab === 'DISTRIBUTORS_INSTITUTIONS' && (
        <BEDistributorOrdersView />
      )}

      {/* MODAL: REGISTER NEW GT RETAILER */}
      {isAddRetailerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Commission Agent Store Onboarding</span>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                  <UserCheck size={18} className="text-emerald-400" /> Onboard Retailer Outlet
                </h3>
              </div>
              <button
                onClick={() => setIsAddRetailerOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {/* Validation helper variables */}
            {(() => {
              const phoneStatus = validatePhoneNumber(newRetPhone, false);
              const gstinStatus = validateGSTIN(newRetGstin, false);
              const nameStatus = validateStoreName(newRetName);
              const cleanPhoneDigits = newRetPhone.replace(/\D/g, '');
              const existingStoreWithPhone =
                cleanPhoneDigits.length === 10
                  ? retailers.find((r) => r.phone.trim().replace(/\D/g, '') === cleanPhoneDigits)
                  : undefined;

              return (
                <form onSubmit={handleCreateRetailer} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Outlet / Store Name *</span>
                      {newRetName.trim().length >= 2 ? (
                        <span className="text-[9px] text-emerald-400 font-medium flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> Valid Name
                        </span>
                      ) : newRetName.length > 0 ? (
                        <span className="text-[9px] text-amber-400 font-medium flex items-center gap-0.5">
                          <AlertCircle size={10} /> Min 2 characters
                        </span>
                      ) : null}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Laxmi General Store & Provision"
                      value={newRetName}
                      onChange={(e) => setNewRetName(e.target.value)}
                      className={`w-full bg-slate-950 border rounded-lg p-2.5 text-white focus:outline-none ${
                        newRetName.length > 0 && newRetName.trim().length < 2
                          ? 'border-amber-500 focus:border-amber-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Contact Number (10 Digits) *</span>
                      <span className="text-[10px] font-mono">
                        {existingStoreWithPhone ? (
                          <span className="text-rose-400 font-bold flex items-center gap-0.5">
                            <AlertTriangle size={10} /> Duplicate Contact
                          </span>
                        ) : newRetPhone.length === 10 && phoneStatus.isValid ? (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <CheckCircle2 size={10} /> 10/10 Digits Valid
                          </span>
                        ) : newRetPhone.length > 0 ? (
                          <span className="text-amber-400 flex items-center gap-0.5">
                            <AlertCircle size={10} /> {newRetPhone.length}/10 digits
                          </span>
                        ) : (
                          <span className="text-emerald-400">Unique Store Key</span>
                        )}
                      </span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={newRetPhone}
                      onChange={(e) => setNewRetPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className={`w-full bg-slate-950 border rounded-lg p-2.5 text-white font-mono focus:outline-none ${
                        existingStoreWithPhone
                          ? 'border-rose-500 focus:border-rose-400'
                          : newRetPhone.length > 0 && !phoneStatus.isValid
                          ? 'border-amber-500 focus:border-amber-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />

                    {/* Prominent Duplicate Contact Number Alert Banner */}
                    {existingStoreWithPhone && (
                      <div className="mt-2 p-2.5 rounded-xl bg-rose-950/70 border border-rose-600/80 text-rose-200 text-xs space-y-1.5 animate-in fade-in duration-200">
                        <div className="flex items-center gap-1.5 font-bold text-rose-300">
                          <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                          <span>Store Onboarding Blocked (Duplicate Contact Number):</span>
                        </div>
                        <p className="text-[11px] text-rose-200/90 leading-snug">
                          Each retailer must have a unique 10-digit contact number.
                        </p>
                        <div className="bg-black/40 p-2 rounded-lg text-[10px] space-y-0.5 border border-rose-900/50">
                          <div className="text-slate-300 font-semibold">• Store: {existingStoreWithPhone.name} ({existingStoreWithPhone.code})</div>
                          <div className="text-slate-400">• Beat Route: {existingStoreWithPhone.beat_name}</div>
                          <div className="text-slate-400">• Registered Phone: <span className="font-mono text-emerald-400">{existingStoreWithPhone.phone}</span></div>
                        </div>
                      </div>
                    )}

                    {!existingStoreWithPhone && newRetPhone.length > 0 && !phoneStatus.isValid && (
                      <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={11} /> {phoneStatus.error}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">
                        Select Beat * (1:1 FMCG Primary Beat)
                      </label>
                      <select
                        required
                        value={newRetBeatId}
                        onChange={(e) => setNewRetBeatId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 focus:outline-none text-xs"
                      >
                        {beats.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code}) {b.assigned_agent_name ? `— ${b.assigned_agent_name}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 mb-1">Trade Channel</label>
                      <select
                        value={newRetChannel}
                        onChange={(e) => setNewRetChannel(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="GT">GT (General Trade)</option>
                        <option value="MT">MT (Modern Trade)</option>
                        <option value="INSTITUTIONAL">Institutional / HoReCa</option>
                        <option value="ECOMMERCE">E-Commerce</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Owner / Contact Person</label>
                      <input
                        type="text"
                        placeholder="e.g. Rajesh Sharma"
                        value={newRetOwner}
                        onChange={(e) => setNewRetOwner(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-300 mb-1 flex items-center justify-between">
                        <span>GSTIN Number</span>
                        <span className="text-[9px] text-slate-500">Optional</span>
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        placeholder="e.g. 27AAAAA0000A1Z5"
                        value={newRetGstin}
                        onChange={(e) => setNewRetGstin(e.target.value.toUpperCase().replace(/[\s-]/g, ''))}
                        className={`w-full bg-slate-950 border rounded-lg p-2 text-white uppercase font-mono text-xs focus:outline-none ${
                          newRetGstin.length > 0
                            ? gstinStatus.isValid
                              ? 'border-emerald-500 focus:border-emerald-400'
                              : 'border-rose-500 focus:border-rose-400'
                            : 'border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Real-time GSTIN validation feedback */}
                  {newRetGstin.length > 0 && (
                    <div
                      className={`p-2 rounded-xl text-[10px] flex items-start gap-1.5 ${
                        gstinStatus.isValid
                          ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/50 border border-rose-800 text-rose-300'
                      }`}
                    >
                      {gstinStatus.isValid ? (
                        <>
                          <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <strong>Valid 15-character GSTIN:</strong> State {newRetGstin.slice(0, 2)} | PAN {newRetGstin.slice(2, 12)} | Checksum {newRetGstin.slice(12)}
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={13} className="text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <strong>GSTIN Validation Notice:</strong> {gstinStatus.error}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {newRetGstin.length === 0 && (
                    <p className="text-[10px] text-slate-500 italic">
                      💡 Tip: For unregistered / composition stores, leave the GSTIN field empty.
                    </p>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsAddRetailerOpen(false)}
                      className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-900/30"
                    >
                      <UserCheck size={14} /> Complete Store Onboarding
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL: SANITY EXCEPTION FLAGGING */}
      {flaggingOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <AlertOctagon size={16} /> Flag Order Sanity Exception
              </h3>
              <button onClick={() => setFlaggingOrder(null)} className="text-slate-400 hover:text-white font-bold text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFlag} className="space-y-3 text-xs">
              <p className="text-slate-400">
                Flagging order <strong className="text-white">{flaggingOrder.order_number}</strong> ({flaggingOrder.retailer_name_raw}).
                This notifies the field agent / office admin for clarification.
              </p>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Exception / Flag Reason *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. SKU rate variance, missing GSTIN or suspicious order quantity..."
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFlaggingOrder(null)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg">
                  Flag & Request Clarification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ORDER DETAIL & LINE EDITING */}
      {selectedOrderForDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-blue-400 uppercase font-semibold">
                  Order Detailed Audit & Line Verification
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShoppingCart size={18} className="text-blue-400" />
                  {selectedOrderForDetail.order_number}
                </h3>
              </div>

              <button
                onClick={() => setSelectedOrderForDetail(null)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕ Close
              </button>
            </div>

            {/* Order Meta Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">Store / Buyer</span>
                <strong className="text-white">{selectedOrderForDetail.retailer_name_raw}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Channel & Beat</span>
                <span className="text-slate-300">{selectedOrderForDetail.channel} | {selectedOrderForDetail.beat_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Order Date</span>
                <span className="text-slate-300">{selectedOrderForDetail.order_date}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Sanity Status</span>
                <span className="font-bold text-amber-300">{selectedOrderForDetail.status}</span>
              </div>
            </div>

            {!isEditMode ? (
              /* VIEW MODE */
              <div className="space-y-4 text-xs">
                {/* Commission Agent / Verification Status & Editing Permission */}
                {(() => {
                  const isVerifiedByBilling = [
                    'VERIFIED',
                    'VERIFIED_BY_BILLING',
                    'INVOICED',
                    'DELIVERED',
                    'PUNCHED_TO_PRINCIPAL',
                    'CLEARED',
                    'APPROVED',
                  ].includes(selectedOrderForDetail.status);
                  const isDelivered = selectedOrderForDetail.status === 'DELIVERED';
                  const isAgentRole = activeRole === 'AGENT';

                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-white text-xs">Order Line Items Breakdown</span>

                      {/* Rule: Once Billing Executive verifies the order, Commission agent can't edit order lines */}
                      {isDelivered ? (
                        <span className="px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 font-semibold text-xs flex items-center gap-1.5">
                          <Lock size={12} /> Delivered — Order Lines Locked
                        </span>
                      ) : isAgentRole && isVerifiedByBilling ? (
                        <span className="px-3 py-1 rounded-xl bg-emerald-950/50 border border-emerald-700/60 text-emerald-300 font-bold text-xs flex items-center gap-1.5 shadow-sm">
                          <Lock size={12} className="text-emerald-400" /> Verified by Billing Exec — Lines Locked
                        </span>
                      ) : (
                        <button
                          onClick={() => setIsEditMode(true)}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-900/30"
                        >
                          <Edit3 size={13} /> Edit Order Lines
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(selectedOrderForDetail.lines || []).map((l, idx) => {
                    const comp = getCompanyForSku(l.sku_id);

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-white flex items-center gap-2">
                            {l.sku_name}
                            {comp && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold">
                                {comp.code}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Quantity: <strong className="text-white">{l.quantity} pcs</strong> × Rate: <strong className="text-white">₹{l.unit_price}</strong>
                          </div>
                        </div>

                        <div className="text-right font-mono font-bold text-emerald-400 text-sm">
                          ₹{l.total.toLocaleString('en-IN')}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const fin = getOrderFinancialSummary(selectedOrderForDetail);
                  return (
                    <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Product Value (Taxable Amount):</span>
                        <span className="font-mono text-slate-200">
                          ₹{fin.productValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Applicable GST (18%):</span>
                        <span className="font-mono text-amber-300 font-semibold">
                          + ₹{fin.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between text-white font-bold text-sm pt-2 border-t border-slate-800">
                        <span className="flex items-center gap-1.5">
                          <span>Total Order Amount:</span>
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-1.5 py-0.5 rounded font-semibold">
                            GST Included
                          </span>
                        </span>
                        <span className="text-emerald-400 font-mono text-base font-bold">
                          ₹{fin.totalAmountWithGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Delivery Action Control Card */}
                {(() => {
                  const isVerifiedByBilling = [
                    'VERIFIED',
                    'VERIFIED_BY_BILLING',
                    'INVOICED',
                    'DELIVERED',
                    'PUNCHED_TO_PRINCIPAL',
                    'CLEARED',
                    'APPROVED',
                  ].includes(selectedOrderForDetail.status);
                  const isPendingVerification =
                    selectedOrderForDetail.status === 'PENDING_VERIFICATION' ||
                    selectedOrderForDetail.status === 'PUNCHED';
                  const isDelivered = selectedOrderForDetail.status === 'DELIVERED';

                  if (isDelivered) {
                    return (
                      <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={16} className="text-emerald-400" />
                          <div>
                            <div className="font-bold text-emerald-300 text-xs">Order Delivered Successfully</div>
                            <div className="text-[10px] text-slate-400">
                              Reflected in Retailer Current Outstanding balance.
                            </div>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs border border-emerald-500/30">
                          DELIVERED
                        </span>
                      </div>
                    );
                  }

                  if (isPendingVerification) {
                    return (
                      <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                            <Clock size={14} className="text-amber-400" /> Delivery Locked: Awaiting Billing Verification
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Commission agent can only mark the order delivered once Billing Executive verifies it.
                          </div>
                        </div>
                        <button
                          disabled
                          title="Cannot mark delivered until Billing Executive verifies the order"
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-500 border border-slate-700 font-semibold text-xs cursor-not-allowed flex items-center gap-1.5"
                        >
                          <Lock size={12} /> Mark Delivered (Locked)
                        </button>
                      </div>
                    );
                  }

                  if (isVerifiedByBilling) {
                    return (
                      <div className="p-3 bg-blue-950/40 border border-blue-500/40 rounded-xl flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-blue-300 text-xs flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-blue-400" /> Verified by Billing Executive
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Ready for store delivery. Marking delivered will update Retailer Current Outstanding.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            updateOrderStatus(selectedOrderForDetail.id, 'DELIVERED');
                            setSelectedOrderForDetail({ ...selectedOrderForDetail, status: 'DELIVERED' });
                            alert(
                              `Order ${selectedOrderForDetail.order_number} marked as DELIVERED!\nRetailer outstanding balance updated.`
                            );
                          }}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-900/40 transition-all transform active:scale-95"
                        >
                          <Truck size={14} /> Mark Order Delivered
                        </button>
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            ) : (
              /* EDIT MODE */
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">Edit Order Items Before Principal Compilation</span>
                  <button
                    type="button"
                    onClick={() => {
                      const usedSkuIds = new Set(editLines.map((l) => l.sku_id).filter(Boolean));
                      const availableSkus = skus.filter((s) => !usedSkuIds.has(s.id));
                      if (availableSkus.length === 0) {
                        alert('All catalog products have already been added to this order.');
                        return;
                      }
                      const nextSku = availableSkus[0];
                      setEditLines([
                        ...editLines,
                        { sku_id: nextSku.id, quantity: 10, unit_price: nextSku.selling_price || 10 },
                      ]);
                    }}
                    className="text-xs font-bold text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    + Add Product Item
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {editLines.map((el, idx) => {
                    const comp = getCompanyForSku(el.sku_id);

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-12 gap-2 items-center"
                      >
                        <div className="col-span-5">
                          <label className="text-[10px] text-slate-400 block mb-0.5">
                            Product {comp && `(${comp.code})`}
                          </label>
                          <select
                            value={el.sku_id}
                            onChange={(e) => {
                              const newSkuId = e.target.value;
                              const isDuplicate = editLines.some((l, i) => i !== idx && l.sku_id === newSkuId);
                              if (isDuplicate) {
                                const found = skus.find((s) => s.id === newSkuId);
                                alert(
                                  `Cannot select "${found?.name || 'this product'}": It is already in this order.\n\nDuplicate products cannot be selected in the same order.`
                                );
                                return;
                              }
                              const copy = [...editLines];
                              copy[idx].sku_id = newSkuId;
                              const found = skus.find((s) => s.id === newSkuId);
                              if (found) copy[idx].unit_price = found.selling_price;
                              setEditLines(copy);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white cursor-pointer"
                          >
                            {skus.map((s) => {
                              const isUsed = editLines.some((l, i) => i !== idx && l.sku_id === s.id);
                              return (
                                <option key={s.id} value={s.id} disabled={isUsed}>
                                  {s.name}{isUsed ? ' — [Already Added]' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="col-span-3">
                          <label className="text-[10px] text-slate-400 block mb-0.5">Qty</label>
                          <input
                            type="number"
                            min="1"
                            value={el.quantity}
                            onKeyDown={(e) => (e.key === '-' || e.key === 'e') && e.preventDefault()}
                            onChange={(e) => {
                              const copy = [...editLines];
                              copy[idx].quantity = Math.max(1, Math.abs(Number(e.target.value)) || 1);
                              setEditLines(copy);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                          />
                        </div>

                        <div className="col-span-3">
                          <label className="text-[10px] text-slate-400 block mb-0.5">Rate (₹)</label>
                          <input
                            type="number"
                            min="0"
                            value={el.unit_price}
                            onKeyDown={(e) => (e.key === '-' || e.key === 'e') && e.preventDefault()}
                            onChange={(e) => {
                              const copy = [...editLines];
                              copy[idx].unit_price = Math.max(0, Math.abs(Number(e.target.value)) || 0);
                              setEditLines(copy);
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white"
                          />
                        </div>

                        <div className="col-span-1 text-right pt-4">
                          {editLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setEditLines(editLines.filter((_, i) => i !== idx))}
                              className="text-rose-400 hover:text-rose-300 font-bold"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
                  >
                    Cancel Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedOrderForDetail) return;

                      // Validate SKU uniqueness
                      const seenEditSkus = new Set<string>();
                      for (const l of editLines) {
                        if (!l.sku_id) continue;
                        if (seenEditSkus.has(l.sku_id)) {
                          const targetSku = skus.find((s) => s.id === l.sku_id);
                          alert(
                            `Duplicate product detected: "${targetSku?.name || l.sku_id}".\n\nDuplicate products should not be selected or added in the same order.`
                          );
                          return;
                        }
                        seenEditSkus.add(l.sku_id);
                      }

                      const compiledLines: OrderLine[] = editLines.map((l, idx) => {
                        const targetSku = skus.find((s) => s.id === l.sku_id) || skus[0];
                        const qty = Math.max(1, Math.abs(Number(l.quantity)) || 1);
                        const rate = Math.max(0, Math.abs(Number(l.unit_price)) || 0);
                        const landing = targetSku.landing_price;
                        const isBelow = rate < landing;

                        return {
                          id: `ol_edit_${Date.now()}_${idx}`,
                          tenant_id: activeTenant.id,
                          order_id: selectedOrderForDetail.id,
                          sku_id: targetSku.id,
                          sku_name: targetSku.name,
                          quantity: qty,
                          unit_price: rate,
                          landing_price: landing,
                          total: qty * rate,
                          is_below_cost: isBelow,
                          expected_claim_total: isBelow ? (landing - rate) * qty : 0,
                        };
                      });

                      const productSubtotal = compiledLines.reduce((sum, l) => sum + l.total, 0);
                      const taxAmount = Math.round(productSubtotal * 0.18 * 100) / 100;
                      const totalAmount = Math.round((productSubtotal + taxAmount) * 100) / 100;
                      const hasBelow = compiledLines.some((l) => l.is_below_cost);

                      updateOrder(selectedOrderForDetail.id, {
                        lines: compiledLines,
                        total_amount: totalAmount,
                        tax_amount: taxAmount,
                        has_below_cost_lines: hasBelow,
                      });

                      alert(`Order ${selectedOrderForDetail.order_number} updated successfully!`);
                      setSelectedOrderForDetail(null);
                      setIsEditMode(false);
                    }}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg"
                  >
                    Save & Update System Order
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RATE & QUANTITY VERIFICATION GATE MODAL */}
      {rateVerifyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 text-slate-200 space-y-5 shadow-2xl shadow-indigo-950/60">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Verify Rates & Quantities Gate — {rateVerifyModal.company.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Order Puncher Mandatory Verification Gate before Primary PO generation ({rateVerifyModal.orders.length} underlying store orders)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRateVerifyModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* SKU Line Item Audit Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">SKU Line Items ({rateVerifyModal.items.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    const allTrue = rateVerifyModal.items.every((i) => i.verified);
                    setRateVerifyModal({
                      ...rateVerifyModal,
                      items: rateVerifyModal.items.map((i) => ({ ...i, verified: !allTrue })),
                    });
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs flex items-center gap-1"
                >
                  <CheckSquare size={13} /> {rateVerifyModal.items.every((i) => i.verified) ? 'Uncheck All' : 'Verify All SKU Lines'}
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-3">SKU Code</th>
                      <th className="py-2.5 px-3">Product Description</th>
                      <th className="py-2.5 px-3">Pack</th>
                      <th className="py-2.5 px-3 text-right">Demanded Qty</th>
                      <th className="py-2.5 px-3 text-right">Store Selling Rate</th>
                      <th className="py-2.5 px-3 text-right">Master Landing Price</th>
                      <th className="py-2.5 px-3 text-right">Gross PO Value</th>
                      <th className="py-2.5 px-3 text-center">Verify Gate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {rateVerifyModal.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 text-[11px] font-mono">
                        <td className="py-2.5 px-3 font-bold text-blue-400">{it.sku_code}</td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-white">{it.sku_name}</td>
                        <td className="py-2.5 px-3 font-sans text-slate-400">{it.pack_size}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-300">{it.total_quantity.toLocaleString()} pcs</td>
                        <td className="py-2.5 px-3 text-right text-slate-300">₹{it.store_avg_price}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-indigo-300">₹{it.master_landing_price}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">₹{it.total_landing_amount.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={it.verified}
                            onChange={(e) => {
                              const copy = [...rateVerifyModal.items];
                              copy[idx].verified = e.target.checked;
                              setRateVerifyModal({ ...rateVerifyModal, items: copy });
                            }}
                            className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700 cursor-pointer"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary & Confirmation */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="text-slate-400">Total Primary PO Landing Value:</div>
                <div className="text-base font-bold text-emerald-400 font-mono">
                  ₹{rateVerifyModal.items.reduce((s, i) => s + i.total_landing_amount, 0).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-slate-400">Verification Status:</div>
                <div className="text-xs font-bold text-indigo-300 font-mono">
                  {rateVerifyModal.items.filter((i) => i.verified).length} of {rateVerifyModal.items.length} SKUs Verified
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRateVerifyModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Close Without Saving
              </button>
              <button
                type="button"
                onClick={() => {
                  const allVerified = rateVerifyModal.items.every((i) => i.verified);
                  if (!allVerified) {
                    alert('Please check and verify all SKU lines before generating the Principle PO.');
                    return;
                  }

                  const poNumber = `PO-${rateVerifyModal.company.code}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
                  const items = rateVerifyModal.items.map((i) => ({
                    sku_id: i.sku_id,
                    sku_code: i.sku_code,
                    sku_name: i.sku_name,
                    pack_size: i.pack_size,
                    total_quantity: i.total_quantity,
                    demanded_quantity: i.total_quantity,
                    purchase_price: i.master_landing_price,
                    master_landing_price: i.master_landing_price,
                    total_amount: i.total_landing_amount,
                    verified_rate: true,
                    is_rate_verified: true,
                  }));

                  const totalUnits = items.reduce((s, i) => s + i.total_quantity, 0);
                  const totalVal = items.reduce((s, i) => s + i.total_amount, 0);

                  addPurchaseOrder({
                    id: `po_${Date.now()}_${rateVerifyModal.company.code.toLowerCase()}`,
                    tenant_id: activeTenant?.id || 't1',
                    po_number: poNumber,
                    company_id: rateVerifyModal.company.id,
                    company_name: rateVerifyModal.company.name,
                    company_code: rateVerifyModal.company.code,
                    status: 'SUBMITTED_TO_PRINCIPLE',
                    gate_verified_by: 'Vikram Singh (Order Puncher)',
                    items,
                    total_quantity: totalUnits,
                    total_amount: totalVal,
                    created_at: new Date().toISOString(),
                    submitted_at: new Date().toISOString(),
                    linked_order_ids: rateVerifyModal.orders.map((o) => o.id),
                    notes: `Verified by Order Puncher Rate Gate. Submitted to ${rateVerifyModal.company.name}.`,
                  });

                  rateVerifyModal.orders.forEach((o) => {
                    updateOrderStatus(o.id, 'PUNCHED_TO_PRINCIPAL');
                  });

                  alert(`✅ Rates & Quantities verified! Principle PO ${poNumber} successfully generated and submitted.\n\nAll ${rateVerifyModal.orders.length} store orders updated to PUNCHED TO PRINCIPAL.`);
                  setRateVerifyModal(null);
                  setActiveTab('PRINCIPLE_POS');
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-900/40 flex items-center gap-2"
              >
                <CheckCircle2 size={15} /> Lock Gate & Submit Principle PO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DUPLICATE STORE CONTACT NUMBER ALERT MODAL */}
      {duplicateAlertInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-500/80 rounded-2xl w-full max-w-md p-6 text-slate-200 space-y-4 shadow-2xl shadow-rose-950/50 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded">
                  Alert
                </span>
                <h3 className="text-base font-bold text-white leading-snug">
                  Store Onboarding Blocked (Duplicate Contact Number):
                </h3>
                <p className="text-xs text-rose-200 font-medium">
                  Each retailer must have a unique 10-digit contact number.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950 border border-rose-900/50 rounded-xl space-y-2 text-xs">
              <div className="text-[12px] font-semibold text-slate-300">
                A store with contact number <span className="font-mono text-emerald-400 font-bold">{duplicateAlertInfo.cleanPhone}</span> already exists:
              </div>
              <div className="space-y-1 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800">
                <div>• Store Name: <strong className="text-white font-semibold">{duplicateAlertInfo.existingStore.name}</strong></div>
                <div>• Beat Route: <span className="text-slate-300">{duplicateAlertInfo.existingStore.beat_name}</span></div>
                <div>• Store Code: <span className="font-mono text-slate-300">{duplicateAlertInfo.existingStore.code}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setDuplicateAlertInfo(null)}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
              >
                Change Number
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateAlertInfo(null);
                  setIsAddRetailerOpen(false);
                }}
                className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors"
              >
                Close & View Registry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Onboard Success Modal */}
      <StoreOnboardSuccessModal
        retailer={onboardedStoreSuccess}
        onClose={() => setOnboardedStoreSuccess(null)}
        actionLabel="Done"
        onAction={() => setOnboardedStoreSuccess(null)}
      />
    </div>
  );
};
