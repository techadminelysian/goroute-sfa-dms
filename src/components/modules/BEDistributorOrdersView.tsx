import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../data/store';
import { Order, Retailer } from '../../types';
import { BEDistributorOnboardingModal } from '../common/BEDistributorOnboardingModal';
import { BEDistributorOrderPunchModal } from '../common/BEDistributorOrderPunchModal';
import { KPICard } from '../common/KPICard';
import {
  Building2,
  Plus,
  Search,
  Filter,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  FileText,
  CreditCard,
  Phone,
  MapPin,
  ExternalLink,
  ChevronRight,
  Receipt,
  UserCheck,
  ShieldCheck,
  Percent
} from 'lucide-react';

interface BEDistributorOrdersViewProps {
  onNavigateToBilling?: () => void;
}

export const BEDistributorOrdersView: React.FC<BEDistributorOrdersViewProps> = ({
  onNavigateToBilling,
}) => {
  const { retailers, distributors, orders, skus, dispatchPoints, activeRole } = useAppStore();

  const [subView, setSubView] = useState<'ORDERS' | 'CLIENTS'>('ORDERS');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSegment, setFilterSegment] = useState<'ALL' | 'DISTRIBUTOR' | 'INSTITUTIONAL'>('ALL');

  // Modal States
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [isPunchModalOpen, setIsPunchModalOpen] = useState(false);
  const [selectedPunchClientId, setSelectedPunchClientId] = useState<string | undefined>(undefined);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);

  // All Distributors & Institutions combined from distributors collection and any legacy accounts
  const allDirectClients = useMemo(() => {
    const list = [
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

  // Filtered Distributors & Institutions list
  const directClients = useMemo(() => {
    return allDirectClients.filter((r) => {
      if (filterSegment !== 'ALL' && r.channel !== filterSegment) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          (r.gstin && r.gstin.toLowerCase().includes(q)) ||
          (r.city && r.city.toLowerCase().includes(q)) ||
          (r.contact_person && r.contact_person.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [allDirectClients, filterSegment, searchQuery]);

  // Direct Orders (Distributors & Institutions)
  const directOrders = useMemo(() => {
    const directClientIds = new Set(allDirectClients.map((c) => c.id));

    return orders.filter((o) => {
      const isDirect =
        o.is_direct_be_order ||
        o.channel === 'DISTRIBUTOR' ||
        o.channel === 'INSTITUTIONAL' ||
        o.source_type === 'BE_DIRECT' ||
        (o.retailer_id && directClientIds.has(o.retailer_id)) ||
        !o.commission_agent_id;

      if (!isDirect) return false;

      if (filterSegment !== 'ALL' && o.channel !== filterSegment) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          o.order_number.toLowerCase().includes(q) ||
          o.retailer_name_raw.toLowerCase().includes(q) ||
          (o.notes && o.notes.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [orders, allDirectClients, filterSegment, searchQuery]);

  // Financial Metrics
  const totalDirectOrderValue = directOrders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalCreditExposure = directClients.reduce((sum, c) => sum + c.current_outstanding, 0);
  const totalApprovedCreditLimit = directClients.reduce((sum, c) => sum + c.credit_limit, 0);

  const handleOpenPunchForClient = (clientId: string) => {
    setSelectedPunchClientId(clientId);
    setIsPunchModalOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800/80 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 size={12} />
              Billing Executive Domain Scope
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60">
              No Field Beats • Direct Order Generation
            </span>
          </div>
          <h2 className="text-lg font-bold text-white">
            Distributors & Institutions Management
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Onboard B2B distributors and institutional buyers, punch direct orders with custom rates & principal discount slabs, and bypass redundant verification directly to billing.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsOnboardingModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} className="text-purple-400" />
            <span>Onboard Distributor/Institution</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedPunchClientId(undefined);
              setIsPunchModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingCart size={14} />
            <span>+ New Direct Order</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <KPICard
          title="Direct Clients"
          value={directClients.length}
          delta={{ value: 'Distributors & Institutions', isPositive: true, label: 'onboarded' }}
          icon={Building2}
          subtext="No beat mapping required"
          accentColor="#a855f7"
        />
        <KPICard
          title="Direct Orders Placed"
          value={directOrders.length}
          delta={{ value: 'Auto-Verified', isPositive: true, label: 'ready for dispatch' }}
          icon={ShoppingCart}
          subtext="Direct BE punch orders"
          accentColor="#3b82f6"
        />
        <KPICard
          title="Total Order Value"
          value={`₹${totalDirectOrderValue.toLocaleString('en-IN')}`}
          delta={{ value: 'Bypassed Queue', isPositive: true, label: 'instant verification' }}
          icon={Receipt}
          subtext="Gross commercial billing"
          accentColor="#10b981"
        />
        <KPICard
          title="Credit Exposure"
          value={`₹${totalCreditExposure.toLocaleString('en-IN')}`}
          delta={{
            value: `₹${(totalApprovedCreditLimit - totalCreditExposure).toLocaleString('en-IN')}`,
            isPositive: totalCreditExposure <= totalApprovedCreditLimit,
            label: 'credit cushion',
          }}
          icon={CreditCard}
          subtext={`Limit: ₹${totalApprovedCreditLimit.toLocaleString('en-IN')}`}
          accentColor="#f59e0b"
        />
      </div>

      {/* Sub-view Navigation & Filters */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView('ORDERS')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              subView === 'ORDERS'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <ShoppingCart size={13} />
            <span>Orders Ledger ({directOrders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('CLIENTS')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              subView === 'CLIENTS'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Building2 size={13} />
            <span>Distributors & Institutions Directory ({directClients.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Channel Filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-slate-400" />
            <span className="text-slate-400">Segment:</span>
            <select
              value={filterSegment}
              onChange={(e) => setFilterSegment(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white outline-none"
            >
              <option value="ALL">All Segments</option>
              <option value="DISTRIBUTOR">Distributor Only</option>
              <option value="INSTITUTIONAL">Institutional Only</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder={subView === 'ORDERS' ? 'Search order #, client...' : 'Search name, GSTIN, city...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white outline-none w-56 placeholder:text-slate-600"
            />
          </div>
        </div>
      </div>

      {/* VIEW A: DIRECT ORDERS TABLE */}
      {subView === 'ORDERS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-purple-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Direct Client Orders Queue ({directOrders.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Orders created by BE bypass verification and receive <strong className="text-emerald-400">VERIFIED_BY_BILLING</strong>
            </span>
          </div>

          {directOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs space-y-2">
              <Building2 size={32} className="mx-auto text-slate-600" />
              <div className="font-semibold text-slate-300">No Direct Orders Found</div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                No orders have been punched yet for Distributors or Institutions. Use the button above to punch a direct verified order.
              </p>
              <button
                type="button"
                onClick={() => setIsPunchModalOpen(true)}
                className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Punch First Direct Order</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 text-[11px] font-semibold uppercase">
                  <tr>
                    <th className="p-3">Order # & Date</th>
                    <th className="p-3">Client & Segment</th>
                    <th className="p-3">Lines & SKUs</th>
                    <th className="p-3">Commercial Terms</th>
                    <th className="p-3 text-right">Order Amount (₹)</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {directOrders.map((ord) => {
                    const clientObj = allDirectClients.find((r) => r.id === ord.retailer_id) || retailers.find((r) => r.id === ord.retailer_id);
                    const isDirectBE = ord.is_direct_be_order || !ord.commission_agent_id;

                    return (
                      <tr key={ord.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3">
                          <div className="font-mono font-bold text-white">{ord.order_number}</div>
                          <div className="text-[10px] text-slate-400">{ord.order_date}</div>
                          {ord.notes && (
                            <div className="text-[10px] text-slate-500 truncate max-w-xs mt-0.5">
                              {ord.notes}
                            </div>
                          )}
                        </td>

                        <td className="p-3">
                          <div className="font-semibold text-white">{ord.retailer_name_raw}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-950 text-purple-300 border border-purple-800/60">
                              {ord.channel}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {clientObj?.city || 'Direct Depot'}
                            </span>
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="text-slate-200 font-semibold">
                            {ord.lines?.length || 0} Products
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Total Units: {ord.lines?.reduce((s, l) => s + l.quantity, 0) || 0}
                          </div>
                          {ord.company_discount_slabs &&
                            Object.keys(ord.company_discount_slabs).length > 0 && (
                              <div className="flex items-center gap-1 text-[10px] text-purple-300 mt-0.5">
                                <Percent size={10} />
                                <span>Special Principal Slabs Applied</span>
                              </div>
                            )}
                        </td>

                        <td className="p-3 text-[11px]">
                          <div className="text-slate-300">
                            Credit: ₹{clientObj?.credit_limit.toLocaleString('en-IN') || '0'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Terms: {clientObj?.credit_days || 0} Days
                          </div>
                          {ord.credit_limit_exceeded && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800/60 font-medium inline-block mt-0.5">
                              Exceeded Approved Limit
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          <div className="font-mono font-bold text-white text-sm">
                            ₹{ord.total_amount.toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Tax: ₹{ord.tax_amount.toLocaleString('en-IN')}
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                              ord.status === 'VERIFIED_BY_BILLING' || ord.status === 'APPROVED'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800/80'
                                : ord.status === 'INVOICED'
                                ? 'bg-blue-950 text-blue-300 border-blue-800/80'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <ShieldCheck size={11} />
                            <span>{ord.status}</span>
                          </span>
                          <span className="block text-[9px] text-slate-500 mt-0.5">
                            {isDirectBE ? 'BE Auto-Verified' : 'Agent Order'}
                          </span>
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedOrderDetail(ord)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors cursor-pointer"
                            >
                              Details
                            </button>
                            {onNavigateToBilling && (
                              <button
                                type="button"
                                onClick={onNavigateToBilling}
                                className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <span>Invoice</span>
                                <ChevronRight size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW B: DISTRIBUTORS & INSTITUTIONS DIRECTORY */}
      {subView === 'CLIENTS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-purple-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Distributors & Institutions Directory ({directClients.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOnboardingModalOpen(true)}
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus size={13} />
              <span>+ Onboard New Client</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 text-[11px] font-semibold uppercase">
                <tr>
                  <th className="p-3">Client / Firm Name</th>
                  <th className="p-3">Segment & Channel</th>
                  <th className="p-3">Tax & License</th>
                  <th className="p-3">Contact & City</th>
                  <th className="p-3 text-right">Credit Limit (₹)</th>
                  <th className="p-3 text-right">Outstanding (₹)</th>
                  <th className="p-3 text-center">Beat Mapping</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {directClients.map((client) => {
                  const dp = dispatchPoints.find((d) => d.id === client.dispatch_point_id);

                  return (
                    <tr key={client.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-white text-sm">{client.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{client.code}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-xs">
                          {client.address}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800/60">
                          {client.channel}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Terms: {client.credit_days || 0} Days Credit
                        </div>
                      </td>

                      <td className="p-3 font-mono text-[11px]">
                        <div>GST: {client.gstin || <span className="text-slate-500">N/A</span>}</div>
                        {client.pan_number && (
                          <div className="text-slate-400">PAN: {client.pan_number}</div>
                        )}
                        {client.fssai_license && (
                          <div className="text-slate-400">FSSAI: {client.fssai_license}</div>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-slate-200">{client.contact_person}</div>
                        <div className="text-slate-400 text-[11px] flex items-center gap-1 mt-0.5">
                          <Phone size={10} />
                          <span>{client.phone}</span>
                        </div>
                        <div className="text-slate-500 text-[10px]">{client.city || 'Delhi NCR'}</div>
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        ₹{client.credit_limit.toLocaleString('en-IN')}
                      </td>

                      <td className="p-3 text-right font-mono font-semibold text-amber-400">
                        ₹{client.current_outstanding.toLocaleString('en-IN')}
                      </td>

                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                          Direct (No Beat)
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Depot: {dp?.name || 'Main Depot'}
                        </div>
                      </td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenPunchForClient(client.id)}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow flex items-center gap-1.5 ml-auto cursor-pointer"
                        >
                          <ShoppingCart size={13} />
                          <span>Punch Order</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrderDetail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex items-start justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-base">
                  Order Details: {selectedOrderDetail.order_number}
                </h3>
                <p className="text-xs text-slate-400">
                  Client: {selectedOrderDetail.retailer_name_raw} • Channel: {selectedOrderDetail.channel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderDetail(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase">Product Lines</div>
              <div className="bg-slate-950 rounded-xl p-2 max-h-56 overflow-y-auto space-y-1 text-xs">
                {selectedOrderDetail.lines?.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-slate-900/60 rounded flex items-center justify-between text-slate-300"
                  >
                    <div>
                      <div className="font-semibold text-white">{line.sku_name}</div>
                      <div className="text-[10px] text-slate-500">
                        Qty: {line.quantity} × ₹{line.unit_price}
                        {line.discount_percentage ? ` (Disc ${line.discount_percentage}%)` : ''}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-emerald-400">
                      ₹{Math.round(line.total).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800 font-mono">
              <span className="text-slate-400">Status: <strong className="text-emerald-400">{selectedOrderDetail.status}</strong></span>
              <span className="text-sm font-bold text-white">
                Grand Total: ₹{selectedOrderDetail.total_amount.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedOrderDetail(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {isOnboardingModalOpen && (
        <BEDistributorOnboardingModal
          isOpen={isOnboardingModalOpen}
          onClose={() => setIsOnboardingModalOpen(false)}
          onSuccess={(client, proceedToOrder) => {
            if (proceedToOrder) {
              handleOpenPunchForClient(client.id);
            }
          }}
        />
      )}

      {isPunchModalOpen && (
        <BEDistributorOrderPunchModal
          isOpen={isPunchModalOpen}
          onClose={() => {
            setIsPunchModalOpen(false);
            setSelectedPunchClientId(undefined);
          }}
          initialClientId={selectedPunchClientId}
          onOpenOnboarding={() => {
            setIsPunchModalOpen(false);
            setIsOnboardingModalOpen(true);
          }}
        />
      )}
    </div>
  );
};
