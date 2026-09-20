import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../data/store';
import { Order, OrderLine, SKU, Payment, PaymentMode, Retailer, Company, User as AppUser } from '../../types';
import { StoreOnboardSuccessModal } from '../common/StoreOnboardSuccessModal';
import { MobileAlertsBanner } from './MobileAlertsBanner';
import {
  applyCAMappingsToOrder,
  getOrderFinancialSummary,
  getAgentAssignedBeats,
  getAgentAssignedStores,
  isOrderInAgentBeats
} from '../../utils/caRoutingLogic';
import {
  validateGSTIN,
  validatePhoneNumber,
  validateStoreName,
  validateBeatRoute,
  validatePaymentAmount,
  validatePaymentReference
} from '../../utils/validators';
import { t } from '../../utils/translations';
import {
  Smartphone,
  MapPin,
  ShoppingBag,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  User,
  Building,
  Edit2,
  Trash2,
  Eye,
  ChevronRight,
  Search,
  AlertTriangle,
  X,
  FileText,
  Store,
  Tag,
  Truck,
  Wallet,
  CreditCard,
  QrCode,
  Banknote,
  Receipt,
  History,
  CheckSquare,
  DollarSign,
  Lock,
  AlertCircle,
  ShieldCheck,
  UserCheck,
  Package,
  Boxes,
  RotateCcw,
  Languages
} from 'lucide-react';

export const MobileAgentView: React.FC = () => {
  const {
    activeTenant,
    activeTenantSettings,
    retailers = [],
    beats = [],
    skus = [],
    companies = [],
    dispatchPoints = [],
    orders = [],
    payments = [],
    users = [],
    currentUser,
    returnableAssetLedger = [],
    recordDeliveryCrates,
    checkRetailerCrateAlert,
    getCrateAgingInfo,
    addOrder,
    updateOrder,
    updateOrderStatus,
    addPayment,
    addRetailer,
    language,
    setLanguage
  } = useAppStore();

  // Commission Agents for Admin Simulation
  const commissionAgents = useMemo(() => (users || []).filter((u) => u.role === 'AGENT'), [users]);
  const [simulatedAgentId, setSimulatedAgentId] = useState<string>(() => commissionAgents[0]?.id || '');
  const [selectedBeatFilterId, setSelectedBeatFilterId] = useState<string>('ALL');

  // Dynamically resolve active Commission Agent from session or Admin simulation
  const activeAgent: AppUser = useMemo(() => {
    // 1. If currentUser is ADMIN, use the simulated agent
    if (currentUser?.role === 'ADMIN') {
      const match = commissionAgents.find((u) => u.id === simulatedAgentId);
      if (match) return match;
      if (commissionAgents[0]) return commissionAgents[0];
      return currentUser;
    }
    // 2. Authenticated currentUser from session if role is AGENT
    if (currentUser?.role === 'AGENT') {
      return currentUser;
    }
    // 3. Fallback to first AGENT
    const anyAgent = commissionAgents[0];
    if (anyAgent) return anyAgent;
    // 4. Default fallback
    return currentUser || (users || [])[0];
  }, [currentUser, commissionAgents, simulatedAgentId, users]);

  const agentName = activeAgent?.name || 'Commission Agent';

  // Resolve all territory beats assigned to active Commission Agent
  const agentAssignedBeats = useMemo(() => {
    return getAgentAssignedBeats(activeAgent, beats);
  }, [activeAgent, beats]);

  // Effective beats (incorporating user's selected beat filter if specified)
  const effectiveBeats = useMemo(() => {
    if (!selectedBeatFilterId || selectedBeatFilterId === 'ALL') {
      return agentAssignedBeats;
    }
    return agentAssignedBeats.filter((b) => b.id === selectedBeatFilterId);
  }, [agentAssignedBeats, selectedBeatFilterId]);

  // Resolve stores strictly belonging to the agent's assigned beats
  const agentAssignedStores = useMemo(() => {
    return getAgentAssignedStores(activeAgent, retailers, effectiveBeats);
  }, [activeAgent, retailers, effectiveBeats]);

  const agentStoreIds = useMemo(() => new Set(agentAssignedStores.map((s) => s.id)), [agentAssignedStores]);
  const agentBeatIds = useMemo(() => new Set(effectiveBeats.map((b) => b.id)), [effectiveBeats]);
  const agentBeatNames = useMemo(
    () => new Set(effectiveBeats.map((b) => b.name.trim().toLowerCase())),
    [effectiveBeats]
  );

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'NEW_ORDER' | 'MY_ORDERS' | 'COLLECT_PAYMENT' | 'MY_STORES' | 'PAYMENT_HISTORY'
  >('NEW_ORDER');

  // Store Onboarding Modal State
  const [isOnboardStoreOpen, setIsOnboardStoreOpen] = useState(false);
  const [onboardedStoreSuccess, setOnboardedStoreSuccess] = useState<Retailer | null>(null);
  const [duplicateAlertInfo, setDuplicateAlertInfo] = useState<{
    cleanPhone: string;
    existingStore: Retailer;
  } | null>(null);
  const [onboardName, setOnboardName] = useState('');
  const [onboardPhone, setOnboardPhone] = useState('');
  const [onboardBeatId, setOnboardBeatId] = useState<string>(agentAssignedBeats[0]?.id || '');
  const [onboardChannel, setOnboardChannel] = useState<'GT' | 'MT' | 'INSTITUTIONAL' | 'ECOMMERCE'>('GT');
  const [onboardOwner, setOnboardOwner] = useState('');
  const [onboardGstin, setOnboardGstin] = useState('');

  // Form State for New Multi-Company Order
  const [selectedRetailerId, setSelectedRetailerId] = useState<string>(agentAssignedStores[0]?.id || '');
  const [mobileVisitNotes, setMobileVisitNotes] = useState<string>('');
  const [mobileSearchTerm, setMobileSearchTerm] = useState<string>('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState<boolean>(false);
  const [mobileCreatedOrderSummary, setMobileCreatedOrderSummary] = useState<{
    order: Order;
    retailerName: string;
    companyBreakdowns: {
      company: Company;
      skuCount: number;
      unitsCount: number;
      subtotal: number;
    }[];
  } | null>(null);

  // Detail / Edit Modal State
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const [selectedStoreForDetail, setSelectedStoreForDetail] = useState<Retailer | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [editLines, setEditLines] = useState<
    { sku_id: string; quantity: number; unit_price: number }[]
  >([]);

  // Delivery Modal State (SEPARATE from Payment Collection)
  const [deliveryOrder, setDeliveryOrder] = useState<Order | null>(null);
  const [receiverName, setReceiverName] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('Delivered at store counter in full condition');
  const [deliveryCratesIssued, setDeliveryCratesIssued] = useState<number>(2);
  const [deliveryCratesReturned, setDeliveryCratesReturned] = useState<number>(0);

  // Helper to open delivery modal with auto-suggested standard crate quantity
  const openDeliveryModal = (order: Order) => {
    setDeliveryOrder(order);
    setReceiverName(order.retailer_name_raw || '');
    const totalUnits = (order.lines || []).reduce((acc, l) => acc + (l.quantity || 0), 0);
    const suggested = Math.max(1, Math.ceil(totalUnits > 0 ? totalUnits / 20 : (order.total_amount || 2000) / 2000));
    setDeliveryCratesIssued(suggested);
    setDeliveryCratesReturned(0);
    setDeliveryNotes('Delivered at store counter in full condition');
  };

  // Payment Collection State (SEPARATE from Delivery)
  const [paymentRetailerId, setPaymentRetailerId] = useState<string>(agentAssignedStores[0]?.id || '');
  const [paymentOrderId, setPaymentOrderId] = useState<string>('GENERAL');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paymentAmount, setPaymentAmount] = useState<string>('5000');
  const [paymentRefNumber, setPaymentRefNumber] = useState<string>('');
  const [paymentBankName, setPaymentBankName] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('Beat cash/digital payment collected');

  // Keep selected stores synchronized with assigned stores
  useEffect(() => {
    if (agentAssignedStores.length > 0) {
      if (!agentStoreIds.has(selectedRetailerId)) {
        setSelectedRetailerId(agentAssignedStores[0].id);
      }
      if (!agentStoreIds.has(paymentRetailerId)) {
        setPaymentRetailerId(agentAssignedStores[0].id);
      }
    } else {
      setSelectedRetailerId('');
      setPaymentRetailerId('');
    }
  }, [agentAssignedStores, agentStoreIds, selectedRetailerId, paymentRetailerId]);

  // Keep onboard beat selection synchronized with assigned beats
  useEffect(() => {
    if (agentAssignedBeats.length > 0) {
      if (!agentAssignedBeats.some((b) => b.id === onboardBeatId)) {
        setOnboardBeatId(agentAssignedBeats[0].id);
      }
    } else {
      setOnboardBeatId('');
    }
  }, [agentAssignedBeats, onboardBeatId]);

  const handleOnboardStoreSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (agentAssignedBeats.length === 0) {
      alert('Store onboarding is disabled because no territory beats are assigned to your account. Please ask an administrator or Billing Executive to assign a beat route to your profile.');
      return;
    }

    const nameVal = validateStoreName(onboardName);
    if (!nameVal.isValid) {
      alert(`Outlet Name Error:\n\n${nameVal.error}`);
      return;
    }

    const phoneVal = validatePhoneNumber(onboardPhone);
    if (!phoneVal.isValid) {
      alert(`Contact Number Error:\n\n${phoneVal.error}`);
      return;
    }

    const cleanPhone = phoneVal.formatted!;
    // Check unique identifier (Phone number) across entire retailer repository
    const existing = retailers.find((r) => r.phone.trim().replace(/\D/g, '') === cleanPhone);
    if (existing) {
      setDuplicateAlertInfo({ cleanPhone, existingStore: existing });
      return;
    }

    const selectedBeatObj = agentAssignedBeats.find((b) => b.id === onboardBeatId) || agentAssignedBeats[0];
    const cleanBeat = selectedBeatObj ? selectedBeatObj.name : 'Central GT Beat';

    const gstinVal = validateGSTIN(onboardGstin, false);
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
      channel: onboardChannel,
      beat_name: cleanBeat,
      beat_id: selectedBeatObj?.id,
      gstin: cleanGstin,
      address: `${cleanBeat} Route`,
      contact_person: onboardOwner.trim() || 'Store Owner',
      phone: cleanPhone,
      phase_status: 'ACTIVE' as const,
      credit_limit: activeTenantSettings.credit_limit_default || 50000,
      current_outstanding: 0,
      onboarded_by_role: activeAgent?.role || 'AGENT',
      onboarded_by_user_id: activeAgent?.id,
    };

    addRetailer(newRet);
    setSelectedRetailerId(newRet.id);
    setPaymentRetailerId(newRet.id);

    // Reset Form
    setOnboardName('');
    setOnboardPhone('');
    setOnboardGstin('');
    setOnboardOwner('');
    setIsOnboardStoreOpen(false);

    // Show high-visibility onboarding success modal
    setOnboardedStoreSuccess(newRet);
  };

  // Search filter for orders
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | 'PUNCHED_TO_PRINCIPAL' | 'PENDING_DELIVERY' | 'DELIVERED'>('ALL');

  const selectedRetailer = agentAssignedStores.find((r) => r.id === selectedRetailerId) || null;
  const paymentSelectedRetailer = agentAssignedStores.find((r) => r.id === paymentRetailerId) || null;

  // Helper to get company for an SKU
  const getCompanyForSku = (skuId: string) => {
    const targetSku = skus.find((s) => s.id === skuId);
    if (!targetSku) return null;
    return companies.find((c) => c.id === targetSku.company_id);
  };

  interface MobileTempLine {
    id: string;
    sku_id: string;
    current_stock: number;
    quantity: number;
  }

  interface MobileCompanyGroup {
    groupId: string;
    companyId: string;
    lines: MobileTempLine[];
  }

  const [mobileCompanyGroups, setMobileCompanyGroups] = useState<MobileCompanyGroup[]>(() => {
    const firstComp = companies[0];
    const compSkus = firstComp ? skus.filter((s) => s.company_id === firstComp.id) : skus;
    const firstSku = compSkus[0] || skus[0];
    return [
      {
        groupId: `mob_grp_${Date.now()}_1`,
        companyId: firstComp?.id || '',
        lines: [
          {
            id: `mob_line_${Date.now()}_1`,
            sku_id: firstSku?.id || '',
            current_stock: 0,
            quantity: 10,
          },
        ],
      },
    ];
  });

  // Historical Order Lookup for Prev. Order calculation in Mobile View
  const getMobilePrevOrderQty = (retId: string, skuId: string): number => {
    if (!retId || !skuId) return 0;
    const pastStoreOrders = orders.filter(
      (o) => o.retailer_id === retId && o.status !== 'CANCELLED'
    );
    for (const ord of pastStoreOrders) {
      const matchedLine = (ord.lines || []).find((l) => l.sku_id === skuId);
      if (matchedLine) {
        return matchedLine.quantity;
      }
    }
    return 0;
  };

  // Global SKU Search for Mobile
  const mobileSearchMatches = useMemo(() => {
    if (!mobileSearchTerm.trim()) return [];
    const q = mobileSearchTerm.toLowerCase();
    return skus
      .filter((s) => {
        const comp = companies.find((c) => c.id === s.company_id);
        return (
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          comp?.name.toLowerCase().includes(q) ||
          comp?.code.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [mobileSearchTerm, skus, companies]);

  // Track all selected SKU IDs across the mobile order
  const allMobileSelectedSkuIds = useMemo(() => {
    const ids = new Set<string>();
    (mobileCompanyGroups || []).forEach((g) => {
      (g.lines || []).forEach((l) => {
        if (l.sku_id) ids.add(l.sku_id);
      });
    });
    return ids;
  }, [mobileCompanyGroups]);

  // Quick Add from Mobile Search
  const handleMobileQuickAddSku = (sku: SKU) => {
    // Check if this SKU is already added anywhere in the order
    let existingGroupIdx = -1;
    let existingLineIdx = -1;
    (mobileCompanyGroups || []).forEach((g, gIdx) => {
      const lIdx = (g.lines || []).findIndex((l) => l.sku_id === sku.id);
      if (lIdx >= 0) {
        existingGroupIdx = gIdx;
        existingLineIdx = lIdx;
      }
    });

    if (existingGroupIdx >= 0 && existingLineIdx >= 0) {
      const targetGroup = mobileCompanyGroups[existingGroupIdx];
      const existingLine = targetGroup.lines[existingLineIdx];
      const newQty = (existingLine.quantity || 0) + 10;
      setMobileCompanyGroups((prev) =>
        prev.map((g, gIdx) =>
          gIdx === existingGroupIdx
            ? {
                ...g,
                lines: g.lines.map((l, lIdx) =>
                  lIdx === existingLineIdx ? { ...l, quantity: newQty } : l
                ),
              }
            : g
        )
      );
      alert(
        `"${sku.name}" is already in this order.\n\nTo prevent duplicate products in the same order, +10 units were added to its existing line (new total: ${newQty} units).`
      );
      setMobileSearchTerm('');
      setIsMobileSearchOpen(false);
      return;
    }

    const targetCompId = sku.company_id;
    const existingGroupIndex = mobileCompanyGroups.findIndex((g) => g.companyId === targetCompId);

    if (existingGroupIndex >= 0) {
      setMobileCompanyGroups((prev) =>
        prev.map((g, gIdx) =>
          gIdx === existingGroupIndex
            ? {
                ...g,
                lines: [
                  ...g.lines,
                  {
                    id: `mob_line_${Date.now()}_${Math.random()}`,
                    sku_id: sku.id,
                    current_stock: 0,
                    quantity: 10,
                  },
                ],
              }
            : g
        )
      );
    } else {
      const newGroup: MobileCompanyGroup = {
        groupId: `mob_grp_${Date.now()}_${Math.random()}`,
        companyId: targetCompId,
        lines: [
          {
            id: `mob_line_${Date.now()}_${Math.random()}`,
            sku_id: sku.id,
            current_stock: 0,
            quantity: 10,
          },
        ],
      };
      setMobileCompanyGroups((prev) => [...prev, newGroup]);
    }

    setMobileSearchTerm('');
    setIsMobileSearchOpen(false);
  };

  // Add Company Section in Mobile
  const handleAddMobileCompanyGroup = () => {
    const existingCompIds = new Set(mobileCompanyGroups.map((g) => g.companyId));
    const availableCompanies = companies.filter((c) => !existingCompIds.has(c.id));

    if (availableCompanies.length === 0) {
      alert('All Principal Companies have already been added to this order.');
      return;
    }

    // Collect SKUs already in order
    const usedSkuIds = new Set<string>();
    (mobileCompanyGroups || []).forEach((g) => {
      (g.lines || []).forEach((l) => {
        if (l.sku_id) usedSkuIds.add(l.sku_id);
      });
    });

    const companyWithAvailableSku =
      availableCompanies.find((c) => {
        const compSkus = skus.filter((s) => s.company_id === c.id);
        return compSkus.some((s) => !usedSkuIds.has(s.id));
      }) || availableCompanies[0];

    const compSkus = skus.filter((s) => s.company_id === companyWithAvailableSku.id);
    const availableSku = compSkus.find((s) => !usedSkuIds.has(s.id)) || compSkus[0];

    if (!availableSku) {
      alert(`No available products found for ${companyWithAvailableSku.name}.`);
      return;
    }

    setMobileCompanyGroups((prev) => [
      ...prev,
      {
        groupId: `mob_grp_${Date.now()}_${Math.random()}`,
        companyId: companyWithAvailableSku.id,
        lines: [
          {
            id: `mob_line_${Date.now()}_${Math.random()}`,
            sku_id: availableSku.id,
            current_stock: 0,
            quantity: 10,
          },
        ],
      },
    ]);
  };

  const handleRemoveMobileCompanyGroup = (groupId: string) => {
    if (mobileCompanyGroups.length <= 1) {
      alert('The order must contain at least one Principal Company section.');
      return;
    }
    setMobileCompanyGroups((prev) => prev.filter((g) => g.groupId !== groupId));
  };

  const handleMobileGroupCompanyChange = (groupId: string, newCompanyId: string) => {
    const targetGroup = mobileCompanyGroups.find((g) => g.groupId === groupId);
    if (!targetGroup) return;
    if (targetGroup.companyId === newCompanyId) return;

    // Check if another group already uses this company
    const isCompanyAlreadyInOrder = mobileCompanyGroups.some(
      (g) => g.groupId !== groupId && g.companyId === newCompanyId
    );
    if (isCompanyAlreadyInOrder) {
      const compObj = companies.find((c) => c.id === newCompanyId);
      alert(
        `"${compObj?.name || 'This company'}" is already added as a separate section in this order. Please use that existing section.`
      );
      return;
    }

    const compSkus = skus.filter((s) => s.company_id === newCompanyId);
    if (compSkus.length === 0) {
      alert('No products found for this company.');
      return;
    }

    // Collect SKUs used in other groups
    const otherUsedSkuIds = new Set<string>();
    mobileCompanyGroups.forEach((g) => {
      if (g.groupId !== groupId) {
        (g.lines || []).forEach((l) => {
          if (l.sku_id) otherUsedSkuIds.add(l.sku_id);
        });
      }
    });

    const availableSkus = compSkus.filter((s) => !otherUsedSkuIds.has(s.id));
    if (availableSkus.length === 0) {
      alert('All products for this company are already added in other sections of this order.');
      return;
    }

    const linesToKeep = Math.min(targetGroup.lines.length, availableSkus.length);
    const updatedLines: MobileTempLine[] = [];

    for (let i = 0; i < Math.max(1, linesToKeep); i++) {
      const existingLine = targetGroup.lines[i];
      updatedLines.push({
        id: existingLine?.id || `mob_line_${Date.now()}_${i}`,
        sku_id: availableSkus[i]?.id || availableSkus[0].id,
        current_stock: existingLine?.current_stock || 0,
        quantity: existingLine?.quantity || 10,
      });
    }

    setMobileCompanyGroups((prev) =>
      prev.map((g) =>
        g.groupId === groupId
          ? {
              ...g,
              companyId: newCompanyId,
              lines: updatedLines,
            }
          : g
      )
    );
  };

  const handleAddMobileLineToGroup = (groupId: string) => {
    const targetGroup = mobileCompanyGroups.find((g) => g.groupId === groupId);
    if (!targetGroup) return;

    const compSkus = skus.filter((s) => s.company_id === targetGroup.companyId);

    // Collect all SKUs currently used across the entire order
    const allUsedSkuIds = new Set<string>();
    (mobileCompanyGroups || []).forEach((g) => {
      (g.lines || []).forEach((l) => {
        if (l.sku_id) allUsedSkuIds.add(l.sku_id);
      });
    });

    const availableSkus = compSkus.filter((s) => !allUsedSkuIds.has(s.id));

    if (availableSkus.length === 0) {
      const compObj = companies.find((c) => c.id === targetGroup.companyId);
      alert(
        `All products for ${compObj?.name || 'this company'} have already been added to this order.\n\nDuplicate products cannot be added in the same order. Please adjust the quantity on the existing lines.`
      );
      return;
    }

    const nextSku = availableSkus[0];

    setMobileCompanyGroups((prev) =>
      prev.map((g) =>
        g.groupId === groupId
          ? {
              ...g,
              lines: [
                ...g.lines,
                {
                  id: `mob_line_${Date.now()}_${Math.random()}`,
                  sku_id: nextSku.id,
                  current_stock: 0,
                  quantity: 10,
                },
              ],
            }
          : g
      )
    );
  };

  const handleRemoveMobileLineFromGroup = (groupId: string, lineId: string) => {
    const targetGroup = mobileCompanyGroups.find((g) => g.groupId === groupId);
    if (!targetGroup) return;

    if (targetGroup.lines.length <= 1) {
      if (mobileCompanyGroups.length > 1) {
        handleRemoveMobileCompanyGroup(groupId);
      } else {
        const compSkus = skus.filter((s) => s.company_id === targetGroup.companyId);
        const firstSku = compSkus[0] || skus[0];
        setMobileCompanyGroups((prev) =>
          prev.map((g) =>
            g.groupId === groupId
              ? {
                  ...g,
                  lines: [
                    {
                      id: `mob_line_${Date.now()}_1`,
                      sku_id: firstSku?.id || '',
                      current_stock: 0,
                      quantity: 1,
                    },
                  ],
                }
              : g
          )
        );
      }
      return;
    }

    setMobileCompanyGroups((prev) =>
      prev.map((g) =>
        g.groupId === groupId ? { ...g, lines: g.lines.filter((l) => l.id !== lineId) } : g
      )
    );
  };

  const handleUpdateMobileLine = (
    groupId: string,
    lineId: string,
    updates: Partial<MobileTempLine>
  ) => {
    if (updates.sku_id) {
      const isDuplicate = (mobileCompanyGroups || []).some((g) =>
        (g.lines || []).some((l) => l.id !== lineId && l.sku_id === updates.sku_id)
      );

      if (isDuplicate) {
        const skuObj = skus.find((s) => s.id === updates.sku_id);
        alert(
          `Cannot select "${skuObj?.name || 'this product'}": It is already added to this order.\n\nDuplicate products should not be selected or added in the same order. Please increase quantity on the existing line instead.`
        );
        return;
      }
    }

    setMobileCompanyGroups((prev) =>
      prev.map((g) =>
        g.groupId === groupId
          ? {
              ...g,
              lines: g.lines.map((l) => (l.id === lineId ? { ...l, ...updates } : l)),
            }
          : g
      )
    );
  };

  // Mobile Consolidated Calculations
  const mobileOrderStats = useMemo(() => {
    let totalGross = 0;
    let totalUnits = 0;
    let totalSkusCount = 0;
    const companyBreakdowns: {
      company: Company;
      skuCount: number;
      unitsCount: number;
      subtotal: number;
    }[] = [];

    (mobileCompanyGroups || []).forEach((group) => {
      const comp = (companies || []).find((c) => c.id === group.companyId);
      let groupSubtotal = 0;
      let groupUnits = 0;

      (group.lines || []).forEach((l) => {
        const sku = (skus || []).find((s) => s.id === l.sku_id);
        const price = sku?.selling_price || 0;
        const lineTotal = (l.quantity || 0) * price;
        groupSubtotal += lineTotal;
        groupUnits += l.quantity || 0;
        totalSkusCount += 1;
      });

      totalGross += groupSubtotal;
      totalUnits += groupUnits;

      if (comp) {
        companyBreakdowns.push({
          company: comp,
          skuCount: (group.lines || []).length,
          unitsCount: groupUnits,
          subtotal: groupSubtotal,
        });
      }
    });

    const taxAmount = totalGross * 0.18;
    const grandTotal = totalGross + taxAmount;

    return {
      totalGross,
      totalUnits,
      totalSkusCount,
      taxAmount,
      grandTotal,
      companyBreakdowns,
      totalCompaniesCount: (mobileCompanyGroups || []).length,
    };
  }, [mobileCompanyGroups, companies, skus]);

  // Create Order for the Store (Combined Single Order ID with Multi-Principal Line Tags)
  const handlePunchMultiCompanyOrder = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRetailer) {
      alert('Please select a valid store outlet.');
      return;
    }

    if (mobileOrderStats.totalSkusCount === 0 || mobileOrderStats.totalUnits === 0) {
      alert('Please add at least one product SKU line with quantity > 0.');
      return;
    }

    // Enforce SKU uniqueness across entire order
    const seenSkus = new Set<string>();
    const duplicateSkuNames: string[] = [];
    for (const g of mobileCompanyGroups || []) {
      for (const l of g.lines || []) {
        if (!l.sku_id) continue;
        if (seenSkus.has(l.sku_id)) {
          const skuObj = skus.find((s) => s.id === l.sku_id);
          duplicateSkuNames.push(skuObj?.name || l.sku_id);
        } else {
          seenSkus.add(l.sku_id);
        }
      }
    }

    if (duplicateSkuNames.length > 0) {
      alert(
        `Duplicate products detected: "${duplicateSkuNames.join(
          ', '
        )}".\n\nDuplicate products should not be selected or added in the same order. Please consolidate order quantities into a single line or remove duplicate rows before submitting.`
      );
      return;
    }

    for (const g of mobileCompanyGroups || []) {
      for (const l of g.lines || []) {
        if (!l.quantity || l.quantity < 1) {
          alert('Every product row must have a quantity of at least 1 unit.');
          return;
        }
      }
    }

    const orderNum = Math.floor(1000 + Math.random() * 9000);
    const orderId = `ord_mob_comb_${Date.now()}`;
    const orderNumber = `ORD-GT-${orderNum}`;
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const caMapping = applyCAMappingsToOrder(
      {},
      activeAgent,
      users,
      dispatchPoints[0]?.id || 'dp_central'
    );

    const distinctCompanyIds = Array.from(new Set((mobileCompanyGroups || []).map((g) => g.companyId))) as string[];
    const companyNames = distinctCompanyIds.map((cid) => (companies || []).find((c) => c.id === cid)?.name || cid);

    const allCompiledLines: OrderLine[] = [];

    (mobileCompanyGroups || []).forEach((group, gIdx) => {
      const comp = (companies || []).find((c) => c.id === group.companyId);

      (group.lines || []).forEach((l, lIdx) => {
        const targetSku = (skus || []).find((s) => s.id === l.sku_id) || skus[0];
        const rate = targetSku?.selling_price || 0;
        const landing = targetSku?.landing_price || 0;
        const isBelow = rate < landing;
        const lineQty = l.quantity || 1;

        allCompiledLines.push({
          id: `ol_mob_${Date.now()}_${gIdx}_${lIdx}`,
          tenant_id: activeTenant?.id || 't1',
          order_id: orderId,
          sku_id: targetSku?.id || l.sku_id,
          sku_name: targetSku?.name || 'SKU',
          quantity: lineQty,
          unit_price: rate,
          landing_price: landing,
          total: lineQty * rate,
          is_below_cost: isBelow,
          expected_claim_total: isBelow ? (landing - rate) * lineQty : 0,
          company_id: group.companyId,
          company_name: comp?.name || 'Principal',
        });
      });
    });

    const productSubtotal = allCompiledLines.reduce((s, l) => s + l.total, 0);
    const combinedTax = Math.round(productSubtotal * 0.18 * 100) / 100;
    const combinedTotal = Math.round((productSubtotal + combinedTax) * 100) / 100;
    const hasBelow = allCompiledLines.some((l) => l.is_below_cost);

    const assignedBEId = caMapping.billing_executive_id || activeAgent?.billing_executive_id || 'usr_billing_1';
    const assignedDPId = caMapping.dispatch_point_id || activeAgent?.dispatch_point_id || dispatchPoints[0]?.id || 'dp_central';

    const combinedOrder: Order = {
      id: orderId,
      tenant_id: activeTenant?.id || 't1',
      order_number: orderNumber,
      channel: 'GT',
      company_id: distinctCompanyIds.length === 1 ? distinctCompanyIds[0] : 'MULTI',
      company_ids: distinctCompanyIds,
      retailer_id: selectedRetailer?.id || '',
      retailer_name_raw: selectedRetailer?.name || 'Store',
      beat_name: selectedRetailer?.beat_name || '',
      dispatch_point_id: assignedDPId,
      billing_executive_id: assignedBEId,
      created_by_user_id: activeAgent?.id || caMapping.commission_agent_id,
      commission_agent_id: caMapping.commission_agent_id || activeAgent?.id,
      commission_agent_name: caMapping.commission_agent_name || activeAgent?.name || agentName,
      order_date: today,
      delivery_date: tomorrow,
      status: 'PENDING_VERIFICATION',
      total_amount: combinedTotal,
      tax_amount: combinedTax,
      lines: allCompiledLines,
      has_below_cost_lines: hasBelow,
      exception_comment: mobileVisitNotes.trim()
        ? `[Multi-Company: ${companyNames.join(', ')}] ${mobileVisitNotes}`
        : `[Multi-Company: ${companyNames.join(', ')}] Field Beat Order`,
      source_type: 'GT_AGENT',
    };

    addOrder(combinedOrder);

    // Show popup summary of created combined order
    setMobileCreatedOrderSummary({
      order: combinedOrder,
      retailerName: selectedRetailer?.name || 'Store Outlet',
      companyBreakdowns: mobileOrderStats.companyBreakdowns || [],
    });

    // Reset lines
    const firstComp = companies[0];
    const compSkus = firstComp ? skus.filter((s) => s.company_id === firstComp.id) : skus;
    const firstSku = compSkus[0] || skus[0];
    setMobileCompanyGroups([
      {
        groupId: `mob_grp_${Date.now()}_1`,
        companyId: firstComp?.id || '',
        lines: [{ id: `mob_line_${Date.now()}_1`, sku_id: firstSku?.id || '', current_stock: 0, quantity: 10 }],
      },
    ]);
    setMobileVisitNotes('');
  };

  // Check if order has been verified by Billing Executive
  const isOrderVerifiedByBilling = (ord: Order) => {
    return (
      ord.status === 'VERIFIED' ||
      ord.status === 'VERIFIED_BY_BILLING' ||
      ord.status === 'PO_GENERATED' ||
      ord.status === 'PUNCHED_TO_PRINCIPAL' ||
      ord.status === 'PRINCIPAL_DISPATCHED' ||
      ord.status === 'APPROVED' ||
      ord.status === 'DISPATCHED' ||
      ord.status === 'INVOICED'
    );
  };

  // Check if order is unverified and editable by commission agent
  const isOrderEditableByAgent = (ord: Order) => {
    if (ord.is_locked) return false;
    return ord.status === 'PENDING_VERIFICATION' || ord.status === 'PUNCHED' || ord.status === 'FLAGGED';
  };

  // Open Detailed View
  const handleOpenOrderDetail = (ord: Order) => {
    setSelectedOrderForDetail(ord);
    setIsEditMode(false);
    setEditLines(
      (ord.lines || []).map((l) => {
        const targetSku = skus.find((s) => s.id === l.sku_id);
        return {
          sku_id: l.sku_id,
          quantity: l.quantity,
          unit_price: targetSku?.selling_price || l.unit_price
        };
      })
    );
  };

  // Edit Lines Helper
  const handleAddEditLine = () => {
    const usedSkuIds = new Set(editLines.map((l) => l.sku_id));
    const availableSkus = skus.filter((s) => !usedSkuIds.has(s.id));
    if (availableSkus.length === 0) {
      alert('All catalog products have already been added to this order.');
      return;
    }
    const nextSku = availableSkus[0];
    setEditLines([
      ...editLines,
      { sku_id: nextSku.id, quantity: 10, unit_price: nextSku.selling_price || 10 }
    ]);
  };

  const handleEditLineSkuChange = (idx: number, skuId: string) => {
    const isDuplicate = editLines.some((l, i) => i !== idx && l.sku_id === skuId);
    if (isDuplicate) {
      const found = skus.find((s) => s.id === skuId);
      alert(`"${found?.name || 'This product'}" is already in this order.\n\nDuplicate products cannot be selected in the same order.`);
      return;
    }
    const targetSku = skus.find((s) => s.id === skuId);
    const copy = [...editLines];
    copy[idx] = {
      sku_id: skuId,
      quantity: copy[idx].quantity || 10,
      unit_price: targetSku?.selling_price || 10
    };
    setEditLines(copy);
  };

  const handleRemoveEditLine = (idx: number) => {
    if (editLines.length <= 1) return;
    setEditLines(editLines.filter((_, i) => i !== idx));
  };

  const handleSaveEditedOrder = () => {
    if (!selectedOrderForDetail) return;

    if (!isOrderEditableByAgent(selectedOrderForDetail)) {
      alert(`Modification Locked: Order ${selectedOrderForDetail.order_number} has been verified by the Billing Executive. Commission Agents can only edit lines before billing verification.`);
      setIsEditMode(false);
      return;
    }

    if (editLines.length === 0) {
      alert('Order must contain at least one line item.');
      return;
    }

    const seenEditSkus = new Set<string>();
    for (const l of editLines) {
      if (seenEditSkus.has(l.sku_id)) {
        const skuObj = skus.find((s) => s.id === l.sku_id);
        alert(`Duplicate product detected: "${skuObj?.name || l.sku_id}". Order cannot contain duplicate products.`);
        return;
      }
      seenEditSkus.add(l.sku_id);
    }

    const compiledLines: OrderLine[] = editLines.map((l, idx) => {
      const targetSku = skus.find((s) => s.id === l.sku_id) || skus[0];
      const qty = Math.max(1, Math.abs(Number(l.quantity)) || 1);
      // Enforce product-rate protection from the catalog SKU selling price
      const rate = targetSku.selling_price;
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
        expected_claim_total: isBelow ? (landing - rate) * qty : 0
      };
    });

    const productSubtotal = compiledLines.reduce((sum, l) => sum + l.total, 0);
    const taxAmount = Math.round(productSubtotal * 0.18 * 100) / 100;
    const totalAmount = Math.round((productSubtotal + taxAmount) * 100) / 100;
    const hasBelowCost = compiledLines.some((l) => l.is_below_cost);

    const updatedData = {
      lines: compiledLines,
      total_amount: totalAmount,
      tax_amount: taxAmount,
      has_below_cost_lines: hasBelowCost
    };

    updateOrder(selectedOrderForDetail.id, updatedData);
    setSelectedOrderForDetail({
      ...selectedOrderForDetail,
      ...updatedData
    });
    setIsEditMode(false);
    alert(`Order ${selectedOrderForDetail.order_number} lines updated successfully!`);
  };

  // Handle Mark Order Delivery Action (SEPARATE from Payment)
  const handleConfirmOrderDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryOrder) return;

    if (!isOrderVerifiedByBilling(deliveryOrder)) {
      alert(`Delivery Guard: Order ${deliveryOrder.order_number} is currently in "${deliveryOrder.status}" status. It must be verified by the Billing Executive before marking delivery.`);
      setDeliveryOrder(null);
      return;
    }

    // Record Returnable Asset Crate movements
    recordDeliveryCrates({
      orderId: deliveryOrder.id,
      cratesIssued: Math.max(0, Number(deliveryCratesIssued) || 0),
      cratesReturned: Math.max(0, Number(deliveryCratesReturned) || 0),
      agentId: activeAgent?.id,
      retailerId: deliveryOrder.retailer_id || undefined,
      notes: deliveryNotes,
    });

    updateOrderStatus(deliveryOrder.id, 'DELIVERED');
    if (selectedOrderForDetail && selectedOrderForDetail.id === deliveryOrder.id) {
      setSelectedOrderForDetail({ ...selectedOrderForDetail, status: 'DELIVERED' });
    }

    const choice = confirm(
      `Order ${deliveryOrder.order_number} successfully marked DELIVERED!\nCrates Handled: +${deliveryCratesIssued} issued, -${deliveryCratesReturned} returned.\n\nWould you like to collect payment for ${deliveryOrder.retailer_name_raw} now?`
    );

    if (choice && deliveryOrder.retailer_id) {
      setPaymentRetailerId(deliveryOrder.retailer_id);
      setPaymentOrderId(deliveryOrder.id);
      setPaymentAmount(String(deliveryOrder.total_amount));
      setActiveTab('COLLECT_PAYMENT');
      setSelectedOrderForDetail(null);
    }

    setDeliveryOrder(null);
    setReceiverName('');
  };

  // Handle Submit Payment Collection (SEPARATE from Delivery)
  const handleCollectPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!paymentSelectedRetailer) {
      alert('Validation Error: Please select a valid store outlet to record payment collection.');
      return;
    }

    const amtVal = validatePaymentAmount(paymentAmount);
    if (!amtVal.isValid) {
      alert(`Invalid Payment Amount:\n\n${amtVal.error}`);
      return;
    }

    const parsedAmount = amtVal.value!;
    let defaultRef = paymentRefNumber.trim();

    if (paymentMode !== 'CASH') {
      const refVal = validatePaymentReference(defaultRef, paymentMode);
      if (!refVal.isValid) {
        alert(`Payment Reference Required:\n\n${refVal.error}\n\nPlease enter the UTR, Transaction ID, or Cheque Number for accountant verification.`);
        return;
      }
      defaultRef = refVal.formatted!;
    } else {
      if (!defaultRef) {
        defaultRef = `CASH-REC-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    const newPayment: Payment = {
      id: `pmt_agent_${Date.now()}`,
      tenant_id: activeTenant.id,
      payment_number: `PAY-AGT-${Math.floor(10000 + Math.random() * 90000)}`,
      retailer_id: paymentSelectedRetailer.id,
      retailer_name: paymentSelectedRetailer.name,
      amount: parsedAmount,
      payment_mode: paymentMode,
      reference_number: defaultRef,
      payment_date: new Date().toISOString().split('T')[0],
      matched_invoice_id: paymentOrderId !== 'GENERAL' ? paymentOrderId : null,
      status: 'PENDING', // Sent to Account Executive for verification before crediting
      collector_name: `Agent ${activeAgent?.name || 'Field Agent'} (Commission Agent)`,
      notes: paymentNotes,
      bank_name: paymentBankName || null,
      cash_status: paymentMode === 'CASH' ? 'IN_SAFE' : undefined
    };

    addPayment(newPayment);

    alert(
      `Payment of ₹${parsedAmount.toLocaleString('en-IN')} (${paymentMode}) collected for ${paymentSelectedRetailer.name}!\n\n• Reference No: ${defaultRef}\n• Status: Submitted to Accountant Verification Queue.\n\nRetailer balance will be credited upon accountant approval.`
    );

    setPaymentRefNumber('');
    setPaymentNotes('Beat cash/digital payment collected');
    setActiveTab('PAYMENT_HISTORY');
  };

  // Orders strictly aligned with the agent's assigned beats
  const agentRelevantOrders = useMemo(() => {
    if (effectiveBeats.length === 0) {
      return [];
    }
    return orders.filter((o) => isOrderInAgentBeats(o, agentStoreIds, agentBeatIds, agentBeatNames));
  }, [orders, effectiveBeats, agentStoreIds, agentBeatIds, agentBeatNames]);

  // Payments strictly aligned with the agent's assigned stores
  const agentRelevantPayments = useMemo(() => {
    if (effectiveBeats.length === 0) {
      return [];
    }
    return payments.filter((p) => p.retailer_id && agentStoreIds.has(p.retailer_id));
  }, [payments, effectiveBeats, agentStoreIds]);

  const searchedOrders = orderSearch
    ? agentRelevantOrders.filter((o) => {
        const q = orderSearch.toLowerCase();
        return o.order_number.toLowerCase().includes(q) || o.retailer_name_raw.toLowerCase().includes(q);
      })
    : agentRelevantOrders;

  const totalAllOrdersCount = searchedOrders.length;
  const totalPunchedOrdersCount = searchedOrders.filter((o) => o.status === 'PUNCHED' || o.status === 'PUNCHED_TO_PRINCIPAL').length;
  const totalPendingOrdersCount = searchedOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;
  const totalDeliveredOrdersCount = searchedOrders.filter((o) => o.status === 'DELIVERED').length;

  // Filter Agent Orders
  const myAgentOrders = searchedOrders.filter((o) => {
    if (orderStatusFilter === 'PUNCHED_TO_PRINCIPAL') {
      return o.status === 'PUNCHED_TO_PRINCIPAL' || o.status === 'PUNCHED';
    }
    if (orderStatusFilter === 'PENDING_DELIVERY') {
      return o.status !== 'DELIVERED' && o.status !== 'CANCELLED';
    }
    if (orderStatusFilter === 'DELIVERED') {
      return o.status === 'DELIVERED';
    }
    return true;
  });

  return (
    <div className="max-w-md mx-auto bg-slate-950 border border-slate-800 rounded-3xl p-4 text-slate-200 shadow-2xl space-y-4">
      {/* Mobile Header Banner */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
            <Smartphone size={16} />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>{activeTenant.name}</span>
              <span className="px-1.5 py-0.2 rounded bg-blue-900/80 text-blue-300 text-[10px] font-semibold border border-blue-700/50">
                {activeAgent?.name || 'Field Agent'}
              </span>
            </div>
            <div className="text-[10px] text-blue-400 font-semibold">{t('cfCommissionAgentApp', language)}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Handheld Language Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs shadow-xs">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-0.5 ${
                language === 'en'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Languages size={10} />
              <span>EN</span>
            </button>
            <button
              type="button"
              onClick={() => setLanguage('hi')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                language === 'hi'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>हिंदी</span>
            </button>
          </div>

          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1" title="Physical Standard Crates currently in Commission Agent's van/custody">
            <Package size={11} /> {t('vanCrates', language)}: {activeAgent?.crate_custody_balance || 0}
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            ● {activeAgent?.name ? `${activeAgent.name.split(' ')[0]} ${language === 'hi' ? 'सक्रिय' : 'Active'}` : t('fieldBeatActive', language)}
          </span>
        </div>
      </div>

      {/* Admin Simulation Mode: select any CA to simulate and test beat-level view */}
      {currentUser?.role === 'ADMIN' && (
        <div className="p-3 bg-indigo-950/60 border border-indigo-500/40 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-indigo-300 text-[11px]">
              <UserCheck size={14} className="text-indigo-400" />
              <span>Admin Simulation Mode: Commission Agent View</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-mono font-semibold border border-indigo-500/30">
              ADMIN
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-indigo-200/80 font-semibold mb-1">
                Simulate Agent:
              </label>
              <select
                value={simulatedAgentId}
                onChange={(e) => {
                  setSimulatedAgentId(e.target.value);
                  setSelectedBeatFilterId('ALL');
                }}
                className="w-full bg-slate-950 border border-indigo-700/60 rounded-xl p-2 text-xs font-bold text-white focus:border-indigo-400 focus:outline-none"
              >
                {commissionAgents.map((ag) => {
                  const agBeats = getAgentAssignedBeats(ag, beats);
                  return (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({agBeats.length} beats)
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-indigo-200/80 font-semibold mb-1">
                Beat Route:
              </label>
              <select
                value={selectedBeatFilterId}
                onChange={(e) => setSelectedBeatFilterId(e.target.value)}
                className="w-full bg-slate-950 border border-indigo-700/60 rounded-xl p-2 text-xs font-bold text-white focus:border-indigo-400 focus:outline-none"
              >
                <option value="ALL">All Assigned ({agentAssignedBeats.length})</option>
                {agentAssignedBeats.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Field Beat Route Info & Selector Pill */}
      {currentUser?.role !== 'ADMIN' && (
        <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
              <MapPin size={13} className="text-blue-400" /> {t('assignedBeatTerritory', language)}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {agentAssignedStores.length} {t('storesMapped', language)}
            </span>
          </div>

          {agentAssignedBeats.length > 1 ? (
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setSelectedBeatFilterId('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
                  selectedBeatFilterId === 'ALL'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                {t('allBeats', language)} ({agentAssignedBeats.length})
              </button>
              {agentAssignedBeats.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBeatFilterId(b.id)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all shrink-0 ${
                    selectedBeatFilterId === b.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          ) : agentAssignedBeats.length === 1 ? (
            <div className="text-[11px] text-blue-300 font-semibold bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-800/40 flex items-center justify-between">
              <span>{agentAssignedBeats[0].name} ({agentAssignedBeats[0].code})</span>
              <span className="text-[10px] font-mono text-blue-400">{t('primaryBeat', language)}</span>
            </div>
          ) : (
            <div className="text-[11px] text-rose-300 font-semibold bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-800/40 flex items-center gap-1.5">
              <AlertCircle size={13} className="text-rose-400" /> {language === 'hi' ? 'कोई बीट आवंटित नहीं' : 'No Territory Beats Assigned'}
            </div>
          )}
        </div>
      )}

      {/* Mobile Alerts Banner for real-time BE push notifications */}
      <MobileAlertsBanner />

      {/* Channel Workflow Callout */}
      <div className="p-2.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-[11px] text-blue-300 flex items-center gap-2">
        <Building size={16} className="text-blue-400 shrink-0" />
        <span>
          <strong>{t('agencyNetworkTitle', language)} ({agentAssignedStores.length} {t('retailOutlets', language)}):</strong> {t('agencyNetworkDesc', language)}
        </span>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="grid grid-cols-5 gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-[10px] font-bold">
        <button
          onClick={() => setActiveTab('NEW_ORDER')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'NEW_ORDER'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Plus size={11} />
          <span>{language === 'hi' ? '+ नया ऑर्डर' : '+ Order'}</span>
        </button>

        <button
          onClick={() => setActiveTab('MY_ORDERS')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'MY_ORDERS'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingBag size={11} />
          <span>{language === 'hi' ? 'ऑर्डर्स' : 'Orders'}</span>
        </button>

        <button
          onClick={() => setActiveTab('COLLECT_PAYMENT')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'COLLECT_PAYMENT'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Wallet size={11} />
          <span>{language === 'hi' ? 'भुगतान ₹' : 'Collect ₹'}</span>
        </button>

        <button
          onClick={() => setActiveTab('MY_STORES')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'MY_STORES'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Store size={11} />
          <span>{language === 'hi' ? 'दुकानें' : 'Stores'}</span>
        </button>

        <button
          onClick={() => setActiveTab('PAYMENT_HISTORY')}
          className={`py-2 rounded-lg text-center transition-all flex flex-col items-center gap-0.5 ${
            activeTab === 'PAYMENT_HISTORY'
              ? 'bg-purple-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <History size={11} />
          <span>{language === 'hi' ? 'इतिहास' : 'Log'}</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: NEW MULTI-COMPANY ORDER FOR SINGLE STORE */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'NEW_ORDER' && (
        <form onSubmit={handlePunchMultiCompanyOrder} className="space-y-4 text-xs">
          {/* Store Selector Header */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
              <span className="flex items-center gap-1">
                <Store size={14} className="text-blue-400" /> {t('selectStoreOutlet', language)}
              </span>
              <button
                type="button"
                onClick={() => setIsOnboardStoreOpen(true)}
                disabled={agentAssignedBeats.length === 0}
                className={`text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded border ${
                  agentAssignedBeats.length === 0
                    ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-60'
                    : 'bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 border-emerald-500/30'
                }`}
                title={
                  agentAssignedBeats.length === 0
                    ? 'Store onboarding disabled: No territory beats assigned'
                    : t('onboardNewStore', language)
                }
              >
                <Plus size={11} /> {t('onboardNewStore', language)}
              </button>
            </div>

            {agentAssignedBeats.length === 0 ? (
              <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-400">
                  <AlertCircle size={14} />
                  {language === 'hi' ? 'कोई बीट आवंटित नहीं है' : 'No Territory Beats Assigned'}
                </div>
                <p className="text-[11px] text-rose-200/90 leading-snug">
                  {language === 'hi'
                    ? 'आपको किसी बीट रूट पर नियुक्त नहीं किया गया है। एडमिन द्वारा बीट जोड़ने तक दुकान चयन और ऑर्डर निर्माण बंद रहेगा।'
                    : 'You are not assigned to any territory beats. Store selection and order punching are disabled until an administrator assigns a beat route to your profile.'}
                </p>
              </div>
            ) : agentAssignedStores.length === 0 ? (
              <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-amber-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-400">
                  <AlertTriangle size={14} />
                  {language === 'hi' ? 'आवंटित बीट में कोई दुकान नहीं है' : 'No Stores in Assigned Beat(s)'}
                </div>
                <p className="text-[11px] text-amber-200/90 leading-snug">
                  {language === 'hi'
                    ? `आपकी बीट (${effectiveBeats.map((b) => b.name).join(', ')}) में कोई खुदरा दुकान मैप नहीं है। दुकान पंजीकृत करने के लिए "नई दुकान जोड़ें" पर क्लिक करें।`
                    : `No retail stores are mapped to your assigned beat(s): ${effectiveBeats.map((b) => b.name).join(', ')}. Click "Onboard New Store" to register an outlet.`}
                </p>
              </div>
            ) : null}

            <select
              disabled={agentAssignedStores.length === 0}
              value={selectedRetailerId}
              onChange={(e) => setSelectedRetailerId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-bold focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {agentAssignedStores.length === 0 ? (
                <option value="">
                  {agentAssignedBeats.length === 0
                    ? (language === 'hi' ? '-- एजेंट को कोई बीट नहीं मिली --' : '-- No Beats Assigned to Agent --')
                    : (language === 'hi' ? '-- बीट में कोई दुकान उपलब्ध नहीं --' : '-- No Stores Mapped to Assigned Beat --')}
                </option>
              ) : (
                agentAssignedStores.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.beat_name}) - {r.phone}
                  </option>
                ))
              )}
            </select>

            {selectedRetailer && (
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>
                    {t('outstanding', language)}: <strong className="text-rose-400 font-mono">₹{selectedRetailer.current_outstanding.toLocaleString('en-IN')}</strong>
                  </span>
                  <span>
                    {t('cratesInCustody', language)}: <strong className="text-amber-400 font-mono font-bold">{selectedRetailer.crate_custody_balance || 0} {language === 'hi' ? 'क्रेट' : 'crates'}</strong>
                  </span>
                </div>

                {/* Soft warning if store has high crate deficit or aging alert */}
                {(() => {
                  const alert = checkRetailerCrateAlert(selectedRetailer.id);
                  if (!alert.hasWarning) return null;
                  return (
                    <div
                      className={`p-2 rounded-xl border text-[11px] leading-snug flex items-start gap-1.5 ${
                        alert.isCritical
                          ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                          : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                      }`}
                    >
                      <AlertTriangle
                        size={13}
                        className={`shrink-0 mt-0.5 ${alert.isCritical ? 'text-rose-400' : 'text-amber-400'}`}
                      />
                      <div>
                        <strong>{alert.isCritical ? 'Critical Crate Alert' : 'Crate Deficit Soft Warning'}:</strong> {alert.message}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Global Quick SKU Search */}
          <div className="relative bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={t('quickSearchSkuPlaceholder', language)}
                value={mobileSearchTerm}
                onChange={(e) => {
                  setMobileSearchTerm(e.target.value);
                  setIsMobileSearchOpen(true);
                }}
                onFocus={() => setIsMobileSearchOpen(true)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {isMobileSearchOpen && mobileSearchMatches.length > 0 && (
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-1 space-y-1 shadow-xl">
                {mobileSearchMatches.map((sku) => {
                  const comp = companies.find((c) => c.id === sku.company_id);
                  const isAlreadyInOrder = allMobileSelectedSkuIds.has(sku.id);
                  return (
                    <button
                      key={sku.id}
                      type="button"
                      onClick={() => handleMobileQuickAddSku(sku)}
                      className="w-full text-left p-1.5 rounded hover:bg-slate-800 flex items-center justify-between text-[11px]"
                    >
                      <div className="truncate">
                        <span className="font-semibold text-white">{sku.name}</span>
                        <span className="text-[9px] text-purple-300 ml-1.5 font-mono">({comp?.code || 'SKU'})</span>
                        {isAlreadyInOrder && (
                          <span className="text-[9px] text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/30 ml-1.5 font-semibold">
                            {language === 'hi' ? 'ऑर्डर में (+10)' : 'In Order (+10 Qty)'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-emerald-400 font-mono font-bold">₹{sku.selling_price}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isAlreadyInOrder ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>
                          {isAlreadyInOrder ? (language === 'hi' ? '+10 मात्रा' : '+10 Qty') : (language === 'hi' ? '+ जोड़ें' : '+ Add')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Company-Grouped Product Sections */}
          <div className="space-y-3">
            {mobileCompanyGroups.map((group, gIdx) => {
              const compObj = companies.find((c) => c.id === group.companyId);
              const compSkus = skus.filter((s) => s.company_id === group.companyId);
              const availableSkusForGroup = compSkus.filter((s) => !allMobileSelectedSkuIds.has(s.id));
              const groupSubtotal = group.lines.reduce((sum, l) => {
                const sku = skus.find((s) => s.id === l.sku_id);
                return sum + (sku?.selling_price || 0) * l.quantity;
              }, 0);

              return (
                <div
                  key={group.groupId}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-3 shadow-md"
                >
                  {/* Company Section Header */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center text-[10px] font-bold">
                        {gIdx + 1}
                      </span>
                      <div>
                        <select
                          id={`select-mobile-company-${group.groupId}`}
                          value={group.companyId}
                          onChange={(e) => handleMobileGroupCompanyChange(group.groupId, e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-white focus:border-purple-500 focus:outline-none cursor-pointer"
                        >
                          {companies.map((c) => {
                            const isUsedInOtherGroup = mobileCompanyGroups.some(
                              (g) => g.groupId !== group.groupId && g.companyId === c.id
                            );
                            return (
                              <option key={c.id} value={c.id} disabled={isUsedInOtherGroup}>
                                {c.name} ({c.code}){isUsedInOtherGroup ? ' — [Already in Order]' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">
                        Subtotal: <strong className="text-emerald-400 font-mono">₹{groupSubtotal.toLocaleString('en-IN')}</strong>
                      </span>
                      {mobileCompanyGroups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMobileCompanyGroup(group.groupId)}
                          className="p-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                          title="Remove this principal company section"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Product Rows for this company */}
                  <div className="space-y-2.5">
                    {group.lines.map((line, lIdx) => {
                      const skuObj = skus.find((s) => s.id === line.sku_id) || compSkus[0] || skus[0];
                      const prevQty = getMobilePrevOrderQty(selectedRetailerId, line.sku_id);
                      const lineTotal = (skuObj?.selling_price || 0) * line.quantity;

                      return (
                        <div
                          key={line.id}
                          className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                        >
                          {/* SKU Selector */}
                          <div className="flex items-center justify-between gap-1">
                            <select
                              value={line.sku_id}
                              onChange={(e) => handleUpdateMobileLine(group.groupId, line.id, { sku_id: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white font-semibold focus:border-blue-500 focus:outline-none cursor-pointer"
                            >
                              {(compSkus.length > 0 ? compSkus : skus).map((s) => {
                                const isSelectedInOtherLine = mobileCompanyGroups.some((g) =>
                                  g.lines.some((l) => l.id !== line.id && l.sku_id === s.id)
                                );
                                return (
                                  <option key={s.id} value={s.id} disabled={isSelectedInOtherLine}>
                                    {s.name} (MRP ₹{s.mrp}){isSelectedInOtherLine ? ' — [Already in Order]' : ''}
                                  </option>
                                );
                              })}
                            </select>

                            <button
                              type="button"
                              onClick={() => handleRemoveMobileLineFromGroup(group.groupId, line.id)}
                              className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {/* Data Input Grid */}
                          <div className="grid grid-cols-4 gap-1.5 text-center">
                            <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                              <label className="block text-[9px] text-slate-400 mb-0.5">{t('prevOrder', language)}</label>
                              <span className="font-mono text-slate-300 font-bold text-xs">{prevQty}</span>
                            </div>

                            <div className="bg-slate-900 p-1.5 rounded-lg border border-slate-800">
                              <label className="block text-[9px] text-slate-400 mb-0.5">{t('currStock', language)}</label>
                              <input
                                type="number"
                                min="0"
                                value={line.current_stock}
                                onKeyDown={(e) => (e.key === '-' || e.key === 'e') && e.preventDefault()}
                                onChange={(e) => handleUpdateMobileLine(group.groupId, line.id, { current_stock: Math.max(0, Number(e.target.value)) })}
                                className="w-full bg-transparent text-center font-mono font-bold text-xs text-white focus:outline-none"
                              />
                            </div>

                            <div className="bg-blue-950/40 p-1.5 rounded-lg border border-blue-800/40">
                              <label className="block text-[9px] text-blue-300 mb-0.5 font-bold">{t('freshOrder', language)}</label>
                              <input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onKeyDown={(e) => (e.key === '-' || e.key === 'e') && e.preventDefault()}
                                onChange={(e) => handleUpdateMobileLine(group.groupId, line.id, { quantity: Math.max(1, Number(e.target.value)) })}
                                className="w-full bg-transparent text-center font-mono font-bold text-xs text-blue-200 focus:outline-none"
                              />
                            </div>

                            <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                              <label className="block text-[9px] text-slate-400 mb-0.5">{t('rate', language)}</label>
                              <span className="font-mono text-slate-300 font-bold text-xs">₹{skuObj?.selling_price || 0}</span>
                            </div>
                          </div>

                          <div className="text-right text-[10px] text-slate-400 pt-0.5">
                            {t('lineTotal', language)}: <strong className="text-emerald-400 font-mono">₹{lineTotal.toLocaleString('en-IN')}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add SKU Button for this company */}
                  {availableSkusForGroup.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleAddMobileLineToGroup(group.groupId)}
                      className="w-full py-1.5 rounded-lg bg-blue-600/15 border border-blue-500/30 hover:bg-blue-600/25 text-blue-300 font-bold text-[11px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus size={12} /> {t('addSkuFromCompany', language)} {compObj?.name || 'Company'} ({availableSkusForGroup.length} {language === 'hi' ? 'शेष' : 'left'})
                    </button>
                  ) : (
                    <div className="text-center py-1.5 px-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-500 italic">
                      ✓ {t('allProductsAddedFromCompany', language)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Another Principal Company */}
          {companies.some((c) => !mobileCompanyGroups.some((g) => g.companyId === c.id)) ? (
            <button
              type="button"
              onClick={handleAddMobileCompanyGroup}
              className="w-full py-2 rounded-xl bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
            >
              <Building size={13} /> {t('addAnotherPrincipalCompany', language)}
            </button>
          ) : (
            <div className="text-center py-2 px-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-500 italic">
              ✓ {t('allPrincipalCompaniesAdded', language)}
            </div>
          )}

          {/* Visit Notes */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
            <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
              <FileText size={12} className="text-slate-400" /> {t('visitNotesLabel', language)}
            </label>
            <textarea
              rows={2}
              placeholder={t('visitNotesPlaceholder', language)}
              value={mobileVisitNotes}
              onChange={(e) => setMobileVisitNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Consolidated Order Summary Card */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-800">
              <span className="text-slate-400">{t('companiesAndItems', language)}:</span>
              <span className="font-bold text-white">
                {mobileOrderStats.totalCompaniesCount} {language === 'hi' ? 'कंपनियां' : 'Companies'} • {mobileOrderStats.totalSkusCount} {language === 'hi' ? 'उत्पाद' : 'SKUs'} ({mobileOrderStats.totalUnits} {language === 'hi' ? 'पीस' : 'pcs'})
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{t('grossTotalCombined', language)}:</span>
              <span className="font-mono font-bold text-slate-200">
                ₹{mobileOrderStats.totalGross.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{t('gstEstimated', language)}:</span>
              <span className="font-mono text-slate-400">
                ₹{mobileOrderStats.taxAmount.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800 font-bold">
              <span className="text-white">{t('consolidatedOrderValue', language)}:</span>
              <span className="font-mono font-extrabold text-emerald-400 text-sm">
                ₹{mobileOrderStats.grandTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!selectedRetailer || agentAssignedStores.length === 0}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={15} />
            {agentAssignedBeats.length === 0
              ? t('orderPunchingDisabledNoBeats', language)
              : agentAssignedStores.length === 0
              ? t('orderPunchingDisabledNoStores', language)
              : t('punchCombinedOrder', language)}
          </button>
        </form>
      )}

      {/* POPUP: FIELD MULTI-COMPANY ORDER SUCCESS */}
      {mobileCreatedOrderSummary && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 text-slate-200 space-y-4 shadow-2xl">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold text-white">Combined Order Punched!</h3>
              <p className="text-xs text-slate-400">
                Created for <strong className="text-white">{mobileCreatedOrderSummary.retailerName}</strong>
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Order ID:</span>
                <span className="font-mono font-bold text-blue-400">{mobileCreatedOrderSummary.order.order_number}</span>
              </div>
              <div className="text-[11px] text-slate-300 font-medium pt-1 border-t border-slate-800">
                Principals Represented (<strong className="text-white">{(mobileCreatedOrderSummary.companyBreakdowns || []).length}</strong>):
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {(mobileCreatedOrderSummary.companyBreakdowns || []).map((cb) => (
                  <div
                    key={cb.company.id}
                    className="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <div className="font-bold text-white">{cb.company.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Building size={10} className="text-purple-400" />
                        {cb.skuCount} SKUs • {cb.unitsCount} pcs
                      </div>
                    </div>
                    <div className="font-mono font-bold text-emerald-400">
                      ₹{cb.subtotal.toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-bold">
                <span className="text-slate-300">Total Value:</span>
                <span className="font-mono text-emerald-400">₹{mobileCreatedOrderSummary.order.total_amount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMobileCreatedOrderSummary(null);
                setActiveTab('MY_ORDERS');
              }}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
            >
              View in My Beat Orders
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: MY BEAT ORDERS LIST WITH SEPARATE DELIVERY & PAYMENT */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'MY_ORDERS' && (
        <div className="space-y-3 text-xs">
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search store name or order #..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white"
            />
          </div>

          {/* Bulk Punch Info Callout */}
          <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-[11px] text-indigo-200 flex items-start gap-2.5 shadow-sm">
            <Building size={16} className="text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Bulk Principal Order Punching</span>
              <span className="text-indigo-300 text-[10px] leading-relaxed">
                Your submitted store orders are compiled SKU-wise per Principal Company (Britannia, Amul, Paras, etc.) by the Order Puncher / Sub-Admin. Once placed in bulk, the status automatically updates to "Punched to Principal" below.
              </span>
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
            <button
              onClick={() => setOrderStatusFilter('ALL')}
              className={`flex-1 py-1 rounded-lg ${
                orderStatusFilter === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-400'
              }`}
            >
              All ({totalAllOrdersCount})
            </button>
            <button
              onClick={() => setOrderStatusFilter('PUNCHED_TO_PRINCIPAL')}
              className={`flex-1 py-1 rounded-lg ${
                orderStatusFilter === 'PUNCHED_TO_PRINCIPAL' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Punched ({totalPunchedOrdersCount})
            </button>
            <button
              onClick={() => setOrderStatusFilter('PENDING_DELIVERY')}
              className={`flex-1 py-1 rounded-lg ${
                orderStatusFilter === 'PENDING_DELIVERY' ? 'bg-amber-600 text-white' : 'text-slate-400'
              }`}
            >
              Pending ({totalPendingOrdersCount})
            </button>
            <button
              onClick={() => setOrderStatusFilter('DELIVERED')}
              className={`flex-1 py-1 rounded-lg ${
                orderStatusFilter === 'DELIVERED' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              Delivered ({totalDeliveredOrdersCount})
            </button>
          </div>

          <div className="space-y-2.5">
            {agentAssignedBeats.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <AlertCircle size={28} className="mx-auto text-rose-400" />
                <div className="font-bold text-white text-xs">No Beats Assigned to Agent</div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Your profile has no assigned territory beats. Order history and customer store access are restricted strictly to assigned beats.
                </p>
              </div>
            ) : myAgentOrders.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
                No orders match selected filter for stores on your assigned beat(s).
              </div>
            ) : (
              myAgentOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5 transition-all"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5 text-xs">
                        <Store size={13} className="text-blue-400" />
                        {ord.retailer_name_raw}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {ord.order_number} | {ord.order_date}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400 text-xs">
                        ₹{ord.total_amount.toLocaleString('en-IN')}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          ord.status === 'DELIVERED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : ord.status === 'PUNCHED_TO_PRINCIPAL'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : ord.status === 'APPROVED' || ord.status === 'DISPATCHED'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {ord.status === 'PUNCHED_TO_PRINCIPAL' ? 'PUNCHED TO PRINCIPAL' : ord.status}
                      </span>
                    </div>
                  </div>

                  {/* Summary of SKUs inside */}
                  <div
                    className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded-xl border border-slate-800/80"
                  >
                    <span>
                      {(ord.lines || []).length} Line Items ({(ord.lines || []).map((l) => l.sku_name).slice(0, 2).join(', ')}...)
                    </span>
                  </div>

                  {/* Action Buttons: VIEW DETAILS, EDIT ORDER (if unverified), COLLECT PAYMENT */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      onClick={() => handleOpenOrderDetail(ord)}
                      className="py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 shadow-sm transition-colors"
                    >
                      <Eye size={12} /> View
                    </button>

                    {isOrderEditableByAgent(ord) ? (
                      <button
                        onClick={() => {
                          setSelectedOrderForDetail(ord);
                          setIsEditMode(true);
                          setEditLines(
                            (ord.lines || []).map((l) => {
                              const targetSku = skus.find((s) => s.id === l.sku_id);
                              return {
                                sku_id: l.sku_id,
                                quantity: l.quantity,
                                unit_price: targetSku?.selling_price || l.unit_price,
                              };
                            })
                          );
                        }}
                        className="py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 shadow-sm transition-colors"
                        title="Edit order lines before billing verification"
                      >
                        <Edit2 size={12} /> Edit Lines
                      </button>
                    ) : ord.status === 'DELIVERED' ? (
                      <div className="py-2 rounded-xl bg-slate-800 text-slate-500 font-semibold text-[10px] flex items-center justify-center gap-1">
                        <CheckCircle2 size={12} /> Delivered
                      </div>
                    ) : isOrderVerifiedByBilling(ord) ? (
                      <button
                        onClick={() => openDeliveryModal(ord)}
                        className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 shadow-sm transition-colors"
                        title="Billing verified! Hand over goods & log crate movements"
                      >
                        <Truck size={12} /> Deliver & Crates
                      </button>
                    ) : (
                      <div
                        className="py-2 rounded-xl bg-slate-900 border border-slate-700/60 text-slate-400 font-semibold text-[9px] flex items-center justify-center gap-1 text-center px-1"
                        title="Awaiting verification by Billing Executive."
                      >
                        <Clock size={11} className="text-amber-400" /> Pending Audit
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (ord.retailer_id) {
                          setPaymentRetailerId(ord.retailer_id);
                          setPaymentOrderId(ord.id);
                          setPaymentAmount(String(ord.total_amount || 0));
                        }
                        setActiveTab('COLLECT_PAYMENT');
                      }}
                      className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 shadow-sm transition-colors"
                    >
                      <Wallet size={12} /> Collect
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: DEDICATED PAYMENT COLLECTION FORM (SEPARATE FROM DELIVERY) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'COLLECT_PAYMENT' && (
        <form onSubmit={handleCollectPaymentSubmit} className="space-y-4 text-xs">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-1">
            <h3 className="font-bold text-white flex items-center gap-1.5 text-xs text-emerald-400">
              <Wallet size={15} /> {language === 'hi' ? 'भुगतान संग्रह (नकद / UPI / चेक)' : 'Collect Payment (Cash / UPI / Cheque)'}
            </h3>
            <p className="text-[10px] text-slate-400">
              {language === 'hi'
                ? 'फील्ड बीट पर दुकानों से प्राप्त भुगतान दर्ज करें। दुकानदार का खाता तुरंत अपडेट होता है।'
                : 'Record payments collected from retailers on field beat. Updates retailer balance immediately.'}
            </p>
          </div>

          <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            {/* Retailer Selector */}
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                {language === 'hi' ? 'दुकान / रिटेलर चुनें' : 'Select Store / Retailer'}
              </label>
              <select
                disabled={agentAssignedStores.length === 0}
                value={paymentRetailerId}
                onChange={(e) => setPaymentRetailerId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {agentAssignedStores.length === 0 ? (
                  <option value="">
                    {agentAssignedBeats.length === 0
                      ? (language === 'hi' ? '-- एजेंट को कोई बीट नहीं मिली --' : '-- No Beats Assigned to Agent --')
                      : (language === 'hi' ? '-- बीट में कोई दुकान उपलब्ध नहीं --' : '-- No Stores Mapped to Assigned Beat --')}
                  </option>
                ) : (
                  agentAssignedStores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.beat_name})
                    </option>
                  ))
                )}
              </select>

              {paymentSelectedRetailer && (
                <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">{language === 'hi' ? 'दुकान की वर्तमान बकाया राशि:' : 'Current Store Outstanding:'}</span>
                  <span className="font-mono font-bold text-rose-400 text-sm">
                    ₹{paymentSelectedRetailer.current_outstanding.toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>

            {/* Optional Order Link */}
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                {language === 'hi' ? 'भुगतान संबद्ध करें (वैकल्पिक ऑर्डर/बिल)' : 'Link Payment To (Optional Order/Invoice)'}
              </label>
              <select
                disabled={agentAssignedStores.length === 0}
                value={paymentOrderId}
                onChange={(e) => setPaymentOrderId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white disabled:opacity-50"
              >
                <option value="GENERAL">{language === 'hi' ? 'सामान्य दुकान खाता शेष' : 'General Store Account Balance'}</option>
                {agentRelevantOrders
                  .filter((o) => o.retailer_id === paymentRetailerId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {language === 'hi' ? 'ऑर्डर' : 'Order'} #{o.order_number} (₹{o.total_amount.toLocaleString('en-IN')})
                    </option>
                  ))}
              </select>
            </div>

            {/* Payment Mode Selector Pills */}
            <div>
              <label className="block text-[10px] text-slate-400 mb-1.5 font-semibold">
                {t('paymentMode', language)}
              </label>
              <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setPaymentMode('CASH')}
                  className={`py-2 rounded-lg flex flex-col items-center gap-0.5 ${
                    paymentMode === 'CASH'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Banknote size={13} />
                  <span>{t('cash', language)}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode('UPI')}
                  className={`py-2 rounded-lg flex flex-col items-center gap-0.5 ${
                    paymentMode === 'UPI'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <QrCode size={13} />
                  <span>UPI QR</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode('CHEQUE')}
                  className={`py-2 rounded-lg flex flex-col items-center gap-0.5 ${
                    paymentMode === 'CHEQUE'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileText size={13} />
                  <span>{t('cheque', language)}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode('NEFT_RTGS')}
                  className={`py-2 rounded-lg flex flex-col items-center gap-0.5 ${
                    paymentMode === 'NEFT_RTGS'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard size={13} />
                  <span>{language === 'hi' ? 'बैंक ट्रांसफर' : 'Bank Wire'}</span>
                </button>
              </div>
            </div>

            {/* Collection Amount Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-emerald-400 font-semibold">
                  {language === 'hi' ? 'प्राप्त राशि (₹) *' : 'Amount Collected (₹) *'}
                </label>
                {paymentSelectedRetailer && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(String(paymentSelectedRetailer.current_outstanding))}
                    className="text-[10px] font-bold text-blue-400 hover:underline"
                  >
                    {language === 'hi' ? 'कुल बकाया' : 'Full Balance'} (₹{paymentSelectedRetailer.current_outstanding})
                  </button>
                )}
              </div>

              <input
                type="text"
                inputMode="decimal"
                value={paymentAmount}
                placeholder="e.g. 5000"
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setPaymentAmount(val);
                }}
                className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl p-2.5 text-base font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-400"
                required
              />
            </div>

            {/* Mode-Specific Instrument Info */}
            {paymentMode === 'CASH' && (
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  {language === 'hi' ? 'नकद रसीद / वाउचर नंबर (वैकल्पिक)' : 'Cash Receipt / Voucher # (Optional)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. REC-CASH-9012"
                  value={paymentRefNumber}
                  onChange={(e) => setPaymentRefNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white"
                />
              </div>
            )}

            {paymentMode === 'UPI' && (
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  {language === 'hi' ? 'UPI लेनदेन UTR / संदर्भ नंबर' : 'UPI Transaction UTR / Ref Number'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI/429182901239"
                  value={paymentRefNumber}
                  onChange={(e) => setPaymentRefNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white"
                />
              </div>
            )}

            {paymentMode === 'CHEQUE' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                    {language === 'hi' ? 'चेक नंबर' : 'Cheque Number'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CHQ-004812"
                    value={paymentRefNumber}
                    onChange={(e) => setPaymentRefNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                    {language === 'hi' ? 'बैंक का नाम' : 'Drawn Bank Name'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC Bank, Main Branch"
                    value={paymentBankName}
                    onChange={(e) => setPaymentBankName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                  />
                </div>
              </div>
            )}

            {paymentMode === 'NEFT_RTGS' && (
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  {language === 'hi' ? 'बैंक रेफरेंस / UTR नंबर' : 'Bank Reference Number / UTR'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR-HDFC-901823"
                  value={paymentRefNumber}
                  onChange={(e) => setPaymentRefNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs font-mono text-white"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                {language === 'hi' ? 'टिप्पणी / विवरण' : 'Collection Remarks / Notes'}
              </label>
              <textarea
                rows={2}
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={!paymentSelectedRetailer || agentAssignedStores.length === 0}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={15} />
              {agentAssignedBeats.length === 0
                ? (language === 'hi' ? 'भुगतान संग्रह अक्षम (कोई बीट नहीं)' : 'Payment Collection Disabled (No Beats Assigned)')
                : agentAssignedStores.length === 0
                ? (language === 'hi' ? 'भुगतान संग्रह अक्षम (बीट में कोई दुकान नहीं)' : 'Payment Collection Disabled (No Stores in Beat)')
                : (language === 'hi' ? 'भुगतान दर्ज करें और रसीद जारी करें' : 'Record Payment & Issue Receipt')}
            </button>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: MY TAGGED STORES LIST */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'MY_STORES' && (
        <div className="space-y-3 text-xs">
          {/* Top Banner with Onboard New Store Button */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="font-bold text-white flex items-center gap-1.5 text-xs text-blue-400">
                <Store size={15} /> {language === 'hi' ? 'मेरी संबद्ध दुकानें' : 'My Tagged Stores'} ({agentAssignedStores.length})
              </span>
              <p className="text-[10px] text-slate-400">
                {language === 'hi' ? 'एजेंट फील्ड बीट डायरेक्टरी' : 'Agent Field Beat Directory'} — {effectiveBeats.map((b) => b.name).join(', ') || (language === 'hi' ? 'कोई बीट नहीं' : 'No Beats Assigned')}
              </p>
            </div>
            <button
              onClick={() => setIsOnboardStoreOpen(true)}
              disabled={agentAssignedBeats.length === 0}
              className={`px-3 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-1 shadow-md ${
                agentAssignedBeats.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
              }`}
              title={
                agentAssignedBeats.length === 0
                  ? (language === 'hi' ? 'दुकान पंजीकरण अक्षम: कोई बीट नहीं' : 'Store onboarding disabled: No territory beats assigned')
                  : t('onboardNewStore', language)
              }
            >
              <Plus size={13} /> {t('onboardNewStore', language)}
            </button>
          </div>

          <div className="space-y-2.5">
            {agentAssignedBeats.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <AlertCircle size={28} className="mx-auto text-rose-400" />
                <div className="font-bold text-white text-xs">{language === 'hi' ? 'कोई बीट आवंटित नहीं' : 'No Beats Assigned'}</div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  {language === 'hi'
                    ? 'आपको किसी बीट रूट पर नियुक्त नहीं किया गया है। दुकान सूची केवल आवंटित बीट तक सीमित है।'
                    : 'You are not assigned to any territory beats. Store directory is restricted strictly to assigned beats.'}
                </p>
              </div>
            ) : agentAssignedStores.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <Store size={28} className="mx-auto text-slate-500" />
                <div className="font-bold text-white text-xs">{language === 'hi' ? 'आवंटित बीट में कोई दुकान नहीं' : 'No Stores in Assigned Beat(s)'}</div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  {language === 'hi'
                    ? `आपकी बीट (${effectiveBeats.map((b) => b.name).join(', ')}) में कोई दुकान पंजीकृत नहीं है।`
                    : `No retail stores are mapped to your assigned beat(s): ${effectiveBeats.map((b) => b.name).join(', ')}.`}
                </p>
              </div>
            ) : (
              agentAssignedStores.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs flex items-center gap-1">
                        <Store size={13} className="text-blue-400" />
                        {r.name}
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                          {r.channel}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{r.beat_name} | Code: {r.code}</div>
                      <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                        {language === 'hi' ? 'संपर्क:' : 'Contact:'} {r.phone} {r.contact_person ? `(${r.contact_person})` : ''}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium flex items-center gap-1">
                          <Package size={10} /> {r.crate_custody_balance || 0} {language === 'hi' ? 'क्रेट' : 'Crates'}
                        </span>
                        {(() => {
                          if (!r.crate_custody_balance || r.crate_custody_balance === 0) return null;
                          const aging = getCrateAgingInfo(r.last_crate_return_date, r.last_crate_issue_date);
                          if (aging.status === 'CRITICAL') {
                            return (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                                {aging.daysHeld}{language === 'hi' ? ' दिन से रखी (गंभीर)' : 'd held (CRITICAL)'}
                              </span>
                            );
                          }
                          if (aging.status === 'WARNING') {
                            return (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                                {aging.daysHeld}{language === 'hi' ? ' दिन से रखी (चेतावनी)' : 'd held (WARNING)'}
                              </span>
                            );
                          }
                          return (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                              {aging.daysHeld}{language === 'hi' ? ' दिन' : 'd held'}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">{t('outstanding', language)}</div>
                      <div className="font-mono font-bold text-rose-400 text-xs">
                        ₹{r.current_outstanding.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons for Store: View Details, Punch Order, Collect Payment */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-800/80">
                    <button
                      onClick={() => setSelectedStoreForDetail(r)}
                      className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold text-[10px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Eye size={12} /> {language === 'hi' ? 'विवरण' : 'View Details'}
                    </button>

                    <button
                      onClick={() => {
                        setSelectedRetailerId(r.id);
                        setActiveTab('NEW_ORDER');
                      }}
                      className="py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus size={12} /> {language === 'hi' ? 'ऑर्डर बनाएं' : 'Punch Order'}
                    </button>

                    <button
                      onClick={() => {
                        setPaymentRetailerId(r.id);
                        setPaymentAmount(String(r.current_outstanding || 5000));
                        setActiveTab('COLLECT_PAYMENT');
                      }}
                      className="py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Wallet size={12} /> {language === 'hi' ? 'भुगतान लें' : 'Collect'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 5: PAYMENT COLLECTION HISTORY LOG */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'PAYMENT_HISTORY' && (
        <div className="space-y-3 text-xs">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1.5 text-xs text-purple-400">
              <History size={15} /> Field Collection Receipts Log
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {agentRelevantPayments.length} Collections
            </span>
          </div>

          <div className="space-y-2">
            {agentRelevantPayments.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
                No payment collections recorded for stores in your assigned beats.
              </div>
            ) : (
              agentRelevantPayments.map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white flex items-center gap-1">
                        <Store size={12} className="text-purple-400" />
                        {p.retailer_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {p.payment_number} | Mode: <strong>{p.payment_mode}</strong>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-400 text-xs">
                        ₹{p.amount.toLocaleString('en-IN')}
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          p.status === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : p.status === 'FLAGGED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {p.status === 'PENDING'
                          ? 'Awaiting AE Verification'
                          : p.status === 'VERIFIED'
                          ? 'AE Verified & Credited'
                          : 'Flagged Mismatch'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-950 rounded-xl text-[10px] text-slate-400 font-mono flex items-center justify-between border border-slate-800/80">
                    <span>Ref: {p.reference_number}</span>
                    <span>Date: {p.payment_date}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MARK ORDER DELIVERY MODAL (SEPARATE FUNCTION FROM PAYMENT) */}
      {deliveryOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Truck size={15} className="text-amber-400" /> Confirm Order Delivery
              </h3>
              <button
                onClick={() => setDeliveryOrder(null)}
                className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] space-y-1">
              <div>
                Order #: <strong className="text-white font-mono">{deliveryOrder.order_number}</strong>
              </div>
              <div>
                Store: <span className="text-slate-300 font-bold">{deliveryOrder.retailer_name_raw}</span>
              </div>
              <div>
                Order Value: <span className="font-mono text-emerald-400 font-bold">₹{deliveryOrder.total_amount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmOrderDelivery} className="space-y-3 text-xs">
              {/* Returnable Asset / Standard Crate Handover & Return Section */}
              {(() => {
                const targetDeliveryRetailer = retailers.find((r) => r.id === deliveryOrder.retailer_id);
                const deliveryCrateAlert = checkRetailerCrateAlert(deliveryOrder.retailer_id || '');
                const totalUnits = (deliveryOrder.lines || []).reduce((acc, l) => acc + (l.quantity || 0), 0);
                const suggestedCount = Math.max(1, Math.ceil(totalUnits > 0 ? totalUnits / 20 : (deliveryOrder.total_amount || 2000) / 2000));
                const storeCurrentBal = targetDeliveryRetailer?.crate_custody_balance || 0;
                const projectedStoreBal = Math.max(0, storeCurrentBal + deliveryCratesIssued - deliveryCratesReturned);

                return (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                        <Package size={14} /> Standard Crate Custody
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Store Balance: <strong className="text-white font-bold">{storeCurrentBal} crates</strong>
                      </span>
                    </div>

                    {/* Soft Warning if Retailer has High Deficit or Overdue Aging Leakage Alert */}
                    {deliveryCrateAlert.hasWarning && (
                      <div
                        className={`p-2 rounded-lg border text-[11px] leading-snug flex items-start gap-1.5 ${
                          deliveryCrateAlert.isCritical
                            ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                            : 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                        }`}
                      >
                        <AlertTriangle
                          size={14}
                          className={`shrink-0 mt-0.5 ${
                            deliveryCrateAlert.isCritical ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        />
                        <div>
                          <strong className="block font-bold">
                            {deliveryCrateAlert.isCritical ? 'CRITICAL LEAKAGE ALERT' : 'Crate Deficit Soft Warning'}
                          </strong>
                          <span>{deliveryCrateAlert.message}</span>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {/* Crates Issued (Loaded out with Goods) */}
                      <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-semibold">Crates Issued</span>
                          <span className="text-[9px] text-blue-400 bg-blue-500/10 px-1 rounded font-mono">
                            Auto: {suggestedCount}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDeliveryCratesIssued(Math.max(0, deliveryCratesIssued - 1))}
                            className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={deliveryCratesIssued}
                            onChange={(e) => setDeliveryCratesIssued(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full text-center bg-slate-950 border border-slate-700 rounded py-1 text-xs font-mono font-bold text-white focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => setDeliveryCratesIssued(deliveryCratesIssued + 1)}
                            className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[9px] text-slate-500 block text-center">Handed over to retailer</span>
                      </div>

                      {/* Empty Crates Returned (Collected) */}
                      <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-300 font-semibold">Empties Returned</span>
                          {storeCurrentBal > 0 && (
                            <button
                              type="button"
                              onClick={() => setDeliveryCratesReturned(storeCurrentBal)}
                              className="text-[9px] text-emerald-400 underline hover:text-emerald-300 font-medium"
                            >
                              All ({storeCurrentBal})
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDeliveryCratesReturned(Math.max(0, deliveryCratesReturned - 1))}
                            className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={deliveryCratesReturned}
                            onChange={(e) => setDeliveryCratesReturned(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-full text-center bg-slate-950 border border-slate-700 rounded py-1 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => setDeliveryCratesReturned(deliveryCratesReturned + 1)}
                            className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-[9px] text-slate-500 block text-center">Collected from retailer</span>
                      </div>
                    </div>

                    {/* Net Balance Preview */}
                    <div className="p-2 bg-slate-900 rounded-lg text-[10px] flex items-center justify-between text-slate-400 border border-slate-800 font-medium">
                      <span>Store Custody After Delivery:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {projectedStoreBal} Standard Crates
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Store Receiver Staff / Owner Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar (Store Owner)"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Delivery Notes / Remark
                </label>
                <textarea
                  rows={2}
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                />
              </div>

              <div className="p-2 bg-amber-950/30 border border-amber-500/30 rounded-xl text-[10px] text-amber-300">
                Note: Delivery function is distinct. Payment collection can be completed separately anytime.
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeliveryOrder(null)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-xs shadow-md shadow-amber-900/30 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 size={15} /> Confirm Delivered
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ORDER DETAIL & EDIT MODAL */}
      {selectedOrderForDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-200 space-y-4 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-blue-400 uppercase font-semibold">
                  Order Details & Audit
                </span>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <FileText size={15} className="text-blue-400" />
                  {selectedOrderForDetail.order_number}
                </h3>
              </div>

              <button
                onClick={() => setSelectedOrderForDetail(null)}
                className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Store & Meta Info */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Store / Retailer:</span>
                <strong className="text-white">{selectedOrderForDetail.retailer_name_raw}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Beat Route:</span>
                <span className="text-slate-300">{selectedOrderForDetail.beat_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="font-bold text-amber-300">{selectedOrderForDetail.status}</span>
              </div>
            </div>

            {/* Mode Switch: View vs Edit */}
            {!isEditMode ? (
              /* VIEW MODE */
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">Order Line Items Breakdown</span>
                  {isOrderEditableByAgent(selectedOrderForDetail) ? (
                    <button
                      type="button"
                      onClick={() => setIsEditMode(true)}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm transition-colors"
                      title="Edit order items & quantities prior to billing verification"
                    >
                      <Edit2 size={12} /> Edit Order Lines
                    </button>
                  ) : selectedOrderForDetail.status !== 'DELIVERED' ? (
                    <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1">
                      <Lock size={10} /> Verified by Billing (Read-Only)
                    </span>
                  ) : null}
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(selectedOrderForDetail.lines || []).map((l, i) => {
                    const company = getCompanyForSku(l.sku_id);

                    return (
                      <div
                        key={i}
                        className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{l.sku_name}</span>
                          {company && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {company.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            {l.quantity} pcs × ₹{l.unit_price}
                          </span>
                          <strong className="text-emerald-400 font-mono">
                            ₹{l.total.toLocaleString('en-IN')}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const fin = getOrderFinancialSummary(selectedOrderForDetail);
                  return (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Product Value:</span>
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
                      <div className="flex justify-between text-white font-bold pt-1.5 border-t border-slate-800">
                        <span className="flex items-center gap-1.5">
                          <span>Total Amount:</span>
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-1 py-0.2 rounded font-semibold">
                            GST Included
                          </span>
                        </span>
                        <span className="text-emerald-400 font-mono text-sm font-bold">
                          ₹{fin.totalAmountWithGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Commission Agent Delivery Action Section - GATED BY BILLING VERIFICATION */}
                {selectedOrderForDetail.status === 'DELIVERED' ? (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold">
                        <CheckCircle2 size={15} className="text-emerald-400" />
                        <span>Order Delivered to Store</span>
                      </div>
                      {selectedOrderForDetail.retailer_id && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentRetailerId(selectedOrderForDetail.retailer_id!);
                            setPaymentOrderId(selectedOrderForDetail.id);
                            setPaymentAmount(String(selectedOrderForDetail.total_amount || 0));
                            setSelectedOrderForDetail(null);
                            setActiveTab('COLLECT_PAYMENT');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <Wallet size={12} /> Collect Payment
                        </button>
                      )}
                    </div>
                    {/* Crates Movement Record for Delivered Order */}
                    <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Package size={13} className="text-amber-400" /> Standard Crates Logged:
                      </span>
                      <div className="space-x-2 font-mono">
                        <span className="text-blue-300 font-semibold">
                          +{selectedOrderForDetail.crates_issued || 0} Issued
                        </span>
                        <span className="text-emerald-300 font-semibold">
                          -{selectedOrderForDetail.crates_returned || 0} Returned
                        </span>
                      </div>
                    </div>
                  </div>
                ) : isOrderVerifiedByBilling(selectedOrderForDetail) ? (
                  <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                      <span className="flex items-center gap-1.5">
                        <Truck size={15} className="text-emerald-400" />
                        <span>Ready for Final Store Delivery</span>
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                        Billing Verified ✓
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Billing Executive has audited credit & verified this order. You may now hand over physical goods to the retailer and confirm delivery.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        openDeliveryModal(selectedOrderForDetail);
                        setSelectedOrderForDetail(null);
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/40 transition-colors"
                    >
                      <Truck size={14} /> Mark Order Delivered & Log Crates
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-950/30 border border-amber-500/40 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                      <span className="flex items-center gap-1.5">
                        <Clock size={15} className="text-amber-400" />
                        <span>Awaiting Billing Executive Verification</span>
                      </span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                        Pending
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      This order is in <strong>{selectedOrderForDetail.status}</strong> status. Delivery cannot be marked until the <strong>Billing Executive</strong> audits and marks it as <strong>VERIFIED</strong>.
                    </p>
                    <div className="w-full py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-center font-medium text-[11px] flex items-center justify-center gap-1.5">
                      <ShieldCheck size={13} className="text-amber-400" /> Delivery Locked until Billing Verification
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* EDIT MODE BEFORE SUBMISSION */
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-amber-300">Editing Order Lines</span>
                  <button
                    type="button"
                    onClick={handleAddEditLine}
                    className="text-[10px] font-bold text-blue-400 flex items-center gap-1 hover:text-blue-300"
                  >
                    <Plus size={12} /> Add Item
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {editLines.map((el, idx) => {
                    const comp = getCompanyForSku(el.sku_id);

                    return (
                      <div key={idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={el.sku_id}
                            onChange={(e) => handleEditLineSkuChange(idx, e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-white w-full cursor-pointer"
                          >
                            {skus.map((s) => {
                              const sComp = getCompanyForSku(s.id);
                              const isSelectedInOtherLine = editLines.some(
                                (otherL, otherIdx) => otherIdx !== idx && otherL.sku_id === s.id
                              );
                              return (
                                <option key={s.id} value={s.id} disabled={isSelectedInOtherLine}>
                                  {s.name} ({sComp?.code || 'SKU'}) — MRP ₹{s.mrp}
                                  {isSelectedInOtherLine ? ' — [Already in Order]' : ''}
                                </option>
                              );
                            })}
                          </select>

                          {comp && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 whitespace-nowrap flex-shrink-0">
                              {comp.code}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <label className="block text-[9px] text-slate-400 mb-0.5">Quantity</label>
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
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs font-mono font-bold text-white"
                            />
                          </div>

                          <div className="col-span-5">
                            <label className="block text-[9px] text-slate-400 mb-0.5 flex items-center gap-0.5">
                              <span>Rate (₹)</span>
                              <Lock size={9} className="text-slate-500" />
                            </label>
                            <input
                              type="text"
                              readOnly
                              value={`₹${el.unit_price}`}
                              className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-xs font-mono font-bold text-slate-300 cursor-not-allowed"
                            />
                          </div>

                          <div className="col-span-2 text-right pt-3">
                            {editLines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveEditLine(idx)}
                                className="p-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/40"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="text-right text-[10px] text-slate-400 border-t border-slate-800/60 pt-1">
                          Line Total: <strong className="text-emerald-400 font-mono">₹{(el.quantity * el.unit_price).toLocaleString('en-IN')}</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between font-bold">
                  <span className="text-slate-400">Total Order Value:</span>
                  <span className="text-emerald-400 font-mono text-xs font-bold">
                    ₹{editLines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => setIsEditMode(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEditedOrder}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* MODAL: STORE ONBOARDING FOR AGENTS */}
      {isOnboardStoreOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 text-slate-200 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Agent Mobile App</span>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                  <Store size={16} className="text-emerald-400" /> Onboard Retail Outlet
                </h3>
              </div>
              <button
                onClick={() => setIsOnboardStoreOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {/* Validation helper variables */}
            {(() => {
              const phoneStatus = validatePhoneNumber(onboardPhone, false);
              const gstinStatus = validateGSTIN(onboardGstin, false);
              const nameStatus = validateStoreName(onboardName);
              const cleanPhoneDigits = onboardPhone.replace(/\D/g, '');
              const existingStoreWithPhone =
                cleanPhoneDigits.length === 10
                  ? retailers.find((r) => r.phone.trim().replace(/\D/g, '') === cleanPhoneDigits)
                  : undefined;

              return (
                <form onSubmit={handleOnboardStoreSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Outlet / Store Name *</span>
                      {onboardName.trim().length >= 2 ? (
                        <span className="text-[9px] text-emerald-400 font-medium flex items-center gap-0.5">
                          <CheckCircle2 size={10} /> Valid Name
                        </span>
                      ) : onboardName.length > 0 ? (
                        <span className="text-[9px] text-amber-400 font-medium flex items-center gap-0.5">
                          <AlertCircle size={10} /> Min 2 characters
                        </span>
                      ) : null}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Laxmi Provision Store"
                      value={onboardName}
                      onChange={(e) => setOnboardName(e.target.value)}
                      className={`w-full bg-slate-950 border rounded-xl p-2.5 text-white focus:outline-none ${
                        onboardName.length > 0 && onboardName.trim().length < 2
                          ? 'border-amber-500 focus:border-amber-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                      <span>Contact Number (10 Digits) *</span>
                      <span className="text-[9px] font-mono">
                        {existingStoreWithPhone ? (
                          <span className="text-rose-400 font-bold flex items-center gap-0.5">
                            <AlertTriangle size={10} /> Duplicate Contact
                          </span>
                        ) : onboardPhone.length === 10 && phoneStatus.isValid ? (
                          <span className="text-emerald-400 flex items-center gap-0.5">
                            <CheckCircle2 size={10} /> 10/10 Digits Valid
                          </span>
                        ) : onboardPhone.length > 0 ? (
                          <span className="text-amber-400 flex items-center gap-0.5">
                            <AlertCircle size={10} /> {onboardPhone.length}/10 digits
                          </span>
                        ) : (
                          <span className="text-emerald-400">Unique Identifier</span>
                        )}
                      </span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      value={onboardPhone}
                      onChange={(e) => setOnboardPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className={`w-full bg-slate-950 border rounded-xl p-2.5 text-white font-mono focus:outline-none ${
                        existingStoreWithPhone
                          ? 'border-rose-500 focus:border-rose-400'
                          : onboardPhone.length > 0 && !phoneStatus.isValid
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

                    {!existingStoreWithPhone && onboardPhone.length > 0 && !phoneStatus.isValid && (
                      <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={11} /> {phoneStatus.error}
                      </p>
                    )}
                  </div>

                  {agentAssignedBeats.length === 0 && (
                    <div className="p-3 bg-amber-950/50 border border-amber-500/40 rounded-xl text-amber-200 text-xs space-y-1">
                      <div className="font-bold text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle size={15} /> Store Onboarding Disabled
                      </div>
                      <p className="text-[11px] text-amber-200/90 leading-snug">
                        You are not assigned to any territory beats. Store onboarding requires an active beat assignment so new outlets are mapped to your route. Please contact your administrator or Billing Executive to assign a beat to your profile.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-300 mb-1">
                        Select Beat * (Assigned Route)
                      </label>
                      <select
                        required
                        disabled={agentAssignedBeats.length === 0}
                        value={onboardBeatId}
                        onChange={(e) => setOnboardBeatId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white text-xs font-semibold focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                      >
                        {agentAssignedBeats.length === 0 ? (
                          <option value="">-- No Beats Assigned --</option>
                        ) : (
                          agentAssignedBeats.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.code})
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-300 mb-1">Trade Channel</label>
                      <select
                        value={onboardChannel}
                        onChange={(e) => setOnboardChannel(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white"
                      >
                        <option value="GT">GT (General Trade)</option>
                        <option value="MT">MT (Modern Trade)</option>
                        <option value="INSTITUTIONAL">Institutional / HoReCa</option>
                        <option value="ECOMMERCE">E-Commerce</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Owner / Manager</label>
                      <input
                        type="text"
                        placeholder="e.g. Rajesh Sharma"
                        value={onboardOwner}
                        onChange={(e) => setOnboardOwner(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-slate-300 mb-1 flex items-center justify-between">
                        <span>GSTIN (15 Chars)</span>
                        <span className="text-[9px] text-slate-500">Optional</span>
                      </label>
                      <input
                        type="text"
                        maxLength={15}
                        placeholder="27AAAAA0000A1Z5"
                        value={onboardGstin}
                        onChange={(e) => setOnboardGstin(e.target.value.toUpperCase().replace(/[\s-]/g, ''))}
                        className={`w-full bg-slate-950 border rounded-xl p-2 text-white uppercase font-mono text-xs focus:outline-none ${
                          onboardGstin.length > 0
                            ? gstinStatus.isValid
                              ? 'border-emerald-500 focus:border-emerald-400'
                              : 'border-rose-500 focus:border-rose-400'
                            : 'border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Real-time GSTIN validation feedback */}
                  {onboardGstin.length > 0 && (
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
                            <strong>Valid 15-character GSTIN format:</strong> State {onboardGstin.slice(0, 2)} | PAN {onboardGstin.slice(2, 12)} | Checksum {onboardGstin.slice(12)}
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

                  {onboardGstin.length === 0 && (
                    <p className="text-[9px] text-slate-500 italic">
                      💡 Tip: For unregistered / composition stores, you can leave the GSTIN field empty.
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsOnboardStoreOpen(false)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={agentAssignedBeats.length === 0 || !!existingStoreWithPhone}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-1 shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2 size={13} />
                      {agentAssignedBeats.length === 0 ? 'Onboarding Disabled' : 'Complete Onboarding'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* STORE DETAILS & ORDERS MODAL */}
      {selectedStoreForDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-200 space-y-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-mono text-blue-400 uppercase font-semibold">
                  Store Profile & Orders Directory
                </span>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Store size={16} className="text-blue-400" />
                  {selectedStoreForDetail.name}
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                    {selectedStoreForDetail.channel}
                  </span>
                </h3>
              </div>

              <button
                onClick={() => setSelectedStoreForDetail(null)}
                className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Store Meta Card */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Beat Route:</span>
                <strong className="text-slate-200">{selectedStoreForDetail.beat_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Store Code:</span>
                <span className="font-mono text-slate-300">{selectedStoreForDetail.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Contact / Owner:</span>
                <span className="text-emerald-400 font-mono">
                  {selectedStoreForDetail.phone} ({selectedStoreForDetail.contact_person || 'Owner'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">GSTIN:</span>
                <span className="font-mono text-slate-300">{selectedStoreForDetail.gstin || 'Unregistered / Composition'}</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-1.5 mt-1">
                <span className="text-slate-400">Current Outstanding:</span>
                <span className="font-mono font-bold text-rose-400">
                  ₹{selectedStoreForDetail.current_outstanding.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Credit Limit:</span>
                <span className="font-mono text-slate-300">
                  ₹{selectedStoreForDetail.credit_limit.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-1.5 mt-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Package size={12} className="text-amber-400" /> Crate Custody:
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {selectedStoreForDetail.crate_custody_balance || 0} Standard Crates
                </span>
              </div>
              {(() => {
                const aging = getCrateAgingInfo(
                  selectedStoreForDetail.last_crate_return_date,
                  selectedStoreForDetail.last_crate_issue_date
                );
                return (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Aging & Risk Status:</span>
                    <span
                      className={`font-semibold ${
                        aging.status === 'CRITICAL'
                          ? 'text-rose-400 font-bold'
                          : aging.status === 'WARNING'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {aging.daysHeld} days held ({aging.status})
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setSelectedRetailerId(selectedStoreForDetail.id);
                  setSelectedStoreForDetail(null);
                  setActiveTab('NEW_ORDER');
                }}
                className="py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus size={14} /> Punch New Order
              </button>

              <button
                onClick={() => {
                  setPaymentRetailerId(selectedStoreForDetail.id);
                  setPaymentAmount(String(selectedStoreForDetail.current_outstanding || 5000));
                  setSelectedStoreForDetail(null);
                  setActiveTab('COLLECT_PAYMENT');
                }}
                className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <Wallet size={14} /> Collect Payment
              </button>
            </div>

            {/* Orders for this Store */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-white border-b border-slate-800 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <ShoppingBag size={14} className="text-blue-400" />
                  Store Orders & Deliveries
                </span>
                <span className="text-[10px] text-slate-400">
                  {
                    orders.filter(
                      (o) =>
                        o.retailer_id === selectedStoreForDetail.id ||
                        o.retailer_name_raw.toLowerCase() === selectedStoreForDetail.name.toLowerCase()
                    ).length
                  }{' '}
                  Orders
                </span>
              </div>

              {(() => {
                const storeOrders = orders.filter(
                  (o) =>
                    o.retailer_id === selectedStoreForDetail.id ||
                    o.retailer_name_raw.toLowerCase() === selectedStoreForDetail.name.toLowerCase()
                );

                if (storeOrders.length === 0) {
                  return (
                    <div className="p-4 text-center text-slate-500 bg-slate-950 border border-slate-800 rounded-xl">
                      No orders placed for this outlet yet.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {storeOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono font-bold text-white text-xs">
                              {ord.order_number}
                            </span>
                            <div className="text-[10px] text-slate-400">{ord.order_date}</div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-emerald-400 text-xs">
                              ₹{ord.total_amount.toLocaleString('en-IN')}
                            </span>
                            <div>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  ord.status === 'DELIVERED'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {ord.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-400 bg-slate-900/80 p-1.5 rounded border border-slate-800 flex items-center justify-between">
                          <span>
                            {(ord.lines || []).length} items ({(ord.lines || []).map((l) => l.sku_name).slice(0, 1).join('')}...)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStoreForDetail(null);
                              handleOpenOrderDetail(ord);
                            }}
                            className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
                          >
                            <Eye size={12} /> View Details {ord.status !== 'DELIVERED' ? 'to Deliver' : ''} →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Returnable Asset (Crate) Movement Log for Store */}
            <div className="space-y-2 text-xs border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between font-bold text-white border-b border-slate-800 pb-1.5">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Package size={14} />
                  Returnable Asset (Crate) Log
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {
                    returnableAssetLedger.filter(
                      (e) => e.holder_id === selectedStoreForDetail.id
                    ).length
                  }{' '}
                  Movements
                </span>
              </div>

              {(() => {
                const storeCrateLogs = returnableAssetLedger.filter(
                  (e) => e.holder_id === selectedStoreForDetail.id
                );

                if (storeCrateLogs.length === 0) {
                  return (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-500 text-[11px]">
                      No crate movements logged for this store yet.
                    </div>
                  );
                }

                return (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {storeCrateLogs.slice(0, 10).map((log) => {
                      const isIssuedToStore = log.movement_type === 'ISSUED';
                      return (
                        <div
                          key={log.id}
                          className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] flex items-center justify-between"
                        >
                          <div>
                            <span
                              className={`font-semibold ${
                                isIssuedToStore ? 'text-blue-300' : 'text-emerald-300'
                              }`}
                            >
                              {isIssuedToStore ? 'Issued (+)' : 'Returned (-)'} {log.quantity} Standard Crates
                            </span>
                            <div className="text-slate-400 text-[9px]">
                              {new Date(log.timestamp).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                              })}{' '}
                              • {log.notes}
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-slate-300 font-bold">Bal: {log.running_balance}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* DUPLICATE STORE CONTACT NUMBER ALERT MODAL */}
      {duplicateAlertInfo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-500/80 rounded-2xl w-full max-w-sm p-5 text-slate-200 space-y-4 shadow-2xl shadow-rose-950/50 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded">
                  Alert
                </span>
                <h3 className="text-sm font-bold text-white leading-snug">
                  Store Onboarding Blocked (Duplicate Contact Number):
                </h3>
                <p className="text-xs text-rose-200 font-medium">
                  Each retailer must have a unique 10-digit contact number.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-rose-900/50 rounded-xl space-y-1.5 text-xs">
              <div className="text-[11px] font-semibold text-slate-300">
                A store with contact number <span className="font-mono text-emerald-400 font-bold">{duplicateAlertInfo.cleanPhone}</span> already exists:
              </div>
              <div className="space-y-1 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800">
                <div>• Store Name: <strong className="text-white font-semibold">{duplicateAlertInfo.existingStore.name}</strong></div>
                <div>• Beat Route: <span className="text-slate-300">{duplicateAlertInfo.existingStore.beat_name}</span></div>
                <div>• Store Code: <span className="font-mono text-slate-300">{duplicateAlertInfo.existingStore.code}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
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
                  setSelectedRetailerId(duplicateAlertInfo.existingStore.id);
                  setDuplicateAlertInfo(null);
                  setIsOnboardStoreOpen(false);
                  setActiveTab('NEW_ORDER');
                }}
                className="py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors"
              >
                Use Existing Store
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Onboard Success Modal */}
      <StoreOnboardSuccessModal
        retailer={onboardedStoreSuccess}
        onClose={() => setOnboardedStoreSuccess(null)}
        onAction={(action) => {
          if (action === 'ORDER') {
            setActiveTab('NEW_ORDER');
          }
        }}
        actionLabel="Punch First Order Now"
      />
    </div>
  );
};
