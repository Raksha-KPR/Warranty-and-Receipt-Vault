import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Wrench,
  Search,
  X,
  AlertCircle,
  Check,
  FileText,
  ShieldCheck,
  Clock,
  Sparkles,
  Calendar
} from 'lucide-react';

const emptyPurchaseForm = {
  product_name: '',
  brand: '',
  category: 'Electronics',
  store_name: '',
  city: '',
  price: '',
  receipt_no: '',
  purchase_date: '',
  warranty_type: 'Standard',
  warranty_months: '12'
};

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return result;
}

export default function App() {
  const [items, setItems] = useState([]);
  const [expiring, setExpiring] = useState({ warranties: [], return_windows: [] });
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'EXPIRING' | 'EXPIRED'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [formData, setFormData] = useState({ ...emptyPurchaseForm });

  const [serviceForm, setServiceForm] = useState({
    date: '',
    issue: '',
    cost: ''
  });

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const loadPurchases = async () => {
    const data = await requestJson('/api/purchases');
    setItems(data);
  };

  const loadExpiring = async () => {
    const data = await requestJson('/api/expiring');
    setExpiring(data);
  };

  useEffect(() => {
    let active = true;
    const loadInitialData = async () => {
      try {
        const [purchaseData, expiringData] = await Promise.all([
          requestJson('/api/purchases'),
          requestJson('/api/expiring'),
        ]);
        if (active) {
          setItems(purchaseData);
          setExpiring(expiringData);
        }
      } catch (error) {
        if (active) showToast(error.message, 'error');
      }
    };
    loadInitialData();
    return () => {
      active = false;
    };
  }, [showToast]);

  const getDaysRemaining = (dateString) => {
    if (!dateString) return null;
    const parseUtcDate = (value) => {
      const [year, month, day] = value.split('-').map(Number);
      return Date.UTC(year, month - 1, day);
    };
    const days = (parseUtcDate(dateString) - parseUtcDate(new Date().toISOString().slice(0, 10))) /
      (1000 * 60 * 60 * 24);
    return Number.isFinite(days) ? days : null;
  };

  const isExpiringSoon = (item) => {
    const wDays = getDaysRemaining(item.warranty_expiry);
    const rDays = getDaysRemaining(item.return_deadline);
    return (wDays !== null && wDays >= 0 && wDays <= 30) ||
      (rDays !== null && rDays >= 0 && rDays <= 7);
  };

  const isExpired = (item) => {
    const days = getDaysRemaining(item.warranty_expiry);
    return days !== null && days < 0;
  };

  const handleAddPurchase = async (e) => {
    e.preventDefault();
    try {
      await requestJson('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          price: Number(formData.price),
          warranty_months: Number(formData.warranty_months),
          warranty_start_date: formData.purchase_date,
        }),
      });
      setFormData({ ...emptyPurchaseForm });
      setIsAddModalOpen(false);
      showToast('Purchase saved to the vault.', 'success');
      await Promise.all([loadPurchases(), loadExpiring()]);
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const handleOpenServices = async (purchaseId) => {
    setSelectedItemId(purchaseId);
    setServices([]);
    setServicesLoading(true);
    setServicesError('');
    try {
      setServices(await requestJson(`/api/purchases/${purchaseId}/services`));
    } catch (error) {
      setServicesError(error.message);
      showToast(error.message, 'error');
    } finally {
      setServicesLoading(false);
    }
  };

  const handleAddServiceLog = async (e) => {
    e.preventDefault();
    const targetItem = items.find((i) => i.id === selectedItemId);
    if (!targetItem) return;
    try {
      const service = await requestJson(`/api/purchases/${selectedItemId}/services`, {
        method: 'POST',
        body: JSON.stringify({
          service_date: serviceForm.date,
          issue: serviceForm.issue,
          cost: Number(serviceForm.cost) || 0,
          status: 'Pending',
        }),
      });
      setServices((previous) => [service, ...previous]);
      setItems((previous) =>
        previous.map((item) =>
          item.id === selectedItemId
            ? { ...item, service_count: item.service_count + 1 }
            : item
        )
      );
      setServiceForm({ date: '', issue: '', cost: '' });
      showToast('Service record saved.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.product_name.toLowerCase().includes(q) ||
      (item.receipt_no || '').toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (activeTab === 'EXPIRING') return isExpiringSoon(item);
    if (activeTab === 'EXPIRED') return isExpired(item);
    return true;
  });

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const expiringCount = expiring.warranties.length + expiring.return_windows.length;
  const activeCount = items.filter((i) => {
    const days = getDaysRemaining(i.warranty_expiry);
    return days !== null && days >= 0;
  }).length;
  const expiredCount = items.filter(isExpired).length;

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-100 font-sans antialiased relative overflow-x-hidden">
      {/* Subtle Top White/Cyan Highlight */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-56 bg-gradient-to-b from-white/[0.05] via-cyan-400/[0.02] to-transparent blur-2xl" />

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#1E1E22] bg-[#050505]/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-neutral-700 to-white p-[1px]">
              <div className="w-full h-full rounded-[11px] bg-[#0A0A0C] flex items-center justify-center">
                <FileText size={16} className="text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-white">
                  VaultLedger
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-neutral-200 border border-white/15">
                  DBMS
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 hidden sm:block">
                Warranty deadlines, return windows & service logs
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 bg-white hover:bg-neutral-200 text-black font-semibold text-xs px-4 py-2 rounded-lg transition cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.5} />
            New Purchase
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-6xl mx-auto px-6 py-8 space-y-7">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-[#0E0E10] border border-[#222226] p-4 hover:border-neutral-600 transition">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Vault Inventory</span>
              <Sparkles size={14} className="text-neutral-300" />
            </div>
            <div className="text-2xl font-bold text-white mt-2 tabular-nums">{items.length}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Registered receipts</div>
          </div>

          <div className="rounded-xl bg-[#0E0E10] border border-amber-500/35 p-4 hover:border-amber-400/55 transition">
            <div className="flex items-center justify-between text-xs text-amber-300">
              <span>Expiring Soon</span>
              <Clock size={14} className="text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-200 mt-2 tabular-nums">{expiringCount}</div>
            <div className="text-[11px] text-amber-300/65 mt-1">Action window open</div>
          </div>

          <div className="rounded-xl bg-[#0E0E10] border border-[#222226] p-4 hover:border-cyan-500/40 transition">
            <div className="flex items-center justify-between text-xs text-cyan-300">
              <span>Active Coverage</span>
              <ShieldCheck size={14} className="text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white mt-2 tabular-nums">{activeCount}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Within warranty period</div>
          </div>

          <div className="rounded-xl bg-[#0E0E10] border border-[#222226] p-4 hover:border-neutral-700 transition">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Expired</span>
              <Calendar size={14} className="text-neutral-500" />
            </div>
            <div className="text-2xl font-bold text-neutral-300 mt-2 tabular-nums">{expiredCount}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Past warranty date</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex items-center bg-[#0E0E10] border border-[#222226] rounded-xl p-1 self-start">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-white text-black font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              All Items ({items.length})
            </button>
            <button
              onClick={() => setActiveTab('EXPIRING')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'EXPIRING'
                  ? 'bg-amber-400 text-black font-semibold'
                  : 'text-neutral-400 hover:text-amber-300'
              }`}
            >
              Expiring Soon ({expiringCount})
            </button>
            <button
              onClick={() => setActiveTab('EXPIRED')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'EXPIRED'
                  ? 'bg-neutral-800 text-white border border-neutral-600'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Expired ({expiredCount})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search product, category, receipt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-[38px] bg-[#0E0E10] border border-[#222226] rounded-xl pl-9 pr-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 transition"
            />
          </div>
        </div>

        {/* Vault Table */}
        <div className="rounded-xl bg-[#0E0E10] border border-[#222226] shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#222226] bg-[#09090B] text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  <th className="py-3.5 px-5">Product & Category</th>
                  <th className="py-3.5 px-5">Receipt No.</th>
                  <th className="py-3.5 px-5">Purchase Date</th>
                  <th className="py-3.5 px-5">Return Window</th>
                  <th className="py-3.5 px-5">Warranty Status</th>
                  <th className="py-3.5 px-5 text-right">Service & Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1F] text-xs">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-14 text-center text-neutral-500">
                      No matching items found in the vault.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const wDays = getDaysRemaining(item.warranty_expiry);
                    const rDays = getDaysRemaining(item.return_deadline);

                    return (
                      <tr key={item.id} className="hover:bg-white/[0.025] transition">
                        <td className="py-4 px-5">
                          <div className="font-semibold text-white text-[13px]">{item.product_name}</div>
                          <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-md bg-[#16161A] text-neutral-300 border border-[#26262C]">
                            {item.category}
                          </span>
                        </td>

                        <td className="py-4 px-5 font-mono text-cyan-300/90">
                          {item.receipt_no}
                        </td>

                        <td className="py-4 px-5 font-mono text-neutral-300 tabular-nums">
                          {item.purchase_date}
                        </td>

                        <td className="py-4 px-5 tabular-nums">
                          {rDays !== null && rDays > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              {rDays}d left ({item.return_deadline})
                            </span>
                          ) : (
                            <span className="text-neutral-500 font-mono">Closed</span>
                          )}
                        </td>

                        <td className="py-4 px-5 tabular-nums">
                          {wDays === null ? (
                            <span className="text-neutral-500">Not recorded</span>
                          ) : wDays < 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#16161A] text-neutral-400 border border-[#26262C]">
                              Expired ({item.warranty_expiry})
                            </span>
                          ) : wDays <= 30 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/35 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              {wDays}d left ({item.warranty_expiry})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/12 text-cyan-300 border border-cyan-500/30 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                              Active until {item.warranty_expiry}
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => handleOpenServices(item.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2C2C32] bg-[#151519] hover:bg-[#1E1E24] text-white font-medium transition cursor-pointer"
                            >
                              <Wrench size={12} className="text-cyan-400" />
                              Logs ({item.service_count})
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add Purchase Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0E0E10] border border-[#26262C] shadow-2xl">
            <div className="px-6 py-4 border-b border-[#222226] flex items-center justify-between bg-[#09090B]">
              <div>
                <h2 className="text-sm font-semibold text-white">Log New Purchase</h2>
                <p className="text-[11px] text-neutral-400">Add purchase details and warranty duration</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-[#1B1B20] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddPurchase} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-neutral-300 font-medium mb-1.5">Product Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Dyson V8 Absolute"
                    value={formData.product_name}
                    onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Brand</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white focus:outline-none focus:border-white"
                  >
                    <option value="Electronics">Electronics</option>
                    <option value="Appliances">Appliances</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Tools">Tools</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Store</label>
                  <input
                    type="text"
                    required
                    placeholder="Store name"
                    value={formData.store_name}
                    onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Store City</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Receipt Number</label>
                  <input
                    type="text"
                    placeholder="INV-2026-04"
                    value={formData.receipt_no}
                    onChange={(e) => setFormData({ ...formData, receipt_no: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 font-mono text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Purchase Date</label>
                  <input
                    type="date"
                    required
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white [color-scheme:dark]"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Warranty Type</label>
                  <select
                    value={formData.warranty_type}
                    onChange={(e) => setFormData({ ...formData, warranty_type: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Extended">Extended</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1.5">Warranty (months)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.warranty_months}
                    onChange={(e) => setFormData({ ...formData, warranty_months: e.target.value })}
                    className="w-full h-[38px] bg-[#050505] border border-[#26262C] rounded-lg px-3 text-white"
                  />
                </div>
              </div>
              <p className="text-[11px] text-neutral-500">
                The database sets the return deadline and warranty end date automatically.
              </p>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-[#222226]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="h-[36px] px-4 rounded-lg border border-[#2B2B30] text-neutral-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-[36px] px-4 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold cursor-pointer"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Service History Drawer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#0E0E10] border-l border-[#222226] h-full flex flex-col justify-between overflow-y-auto shadow-2xl">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between border-b border-[#222226] pb-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                    Service History
                  </span>
                  <h3 className="text-base font-semibold text-white mt-0.5">
                    {selectedItem.product_name}
                  </h3>
                  <p className="text-xs font-mono text-neutral-400 mt-1">
                    {selectedItem.receipt_no || 'No receipt'} • Warranty ends {selectedItem.warranty_expiry || 'Not recorded'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedItemId(null)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#1B1B20] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={handleAddServiceLog}
                className="p-4 rounded-xl bg-[#050505] border border-[#222226] space-y-3 text-xs"
              >
                <div className="font-semibold text-white">Log Service Entry</div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-neutral-400 mb-1">Service Date</label>
                    <input
                      type="date"
                      required
                      value={serviceForm.date}
                      onChange={(e) => setServiceForm({ ...serviceForm, date: e.target.value })}
                      className="w-full h-[36px] bg-[#0E0E10] border border-[#26262C] rounded-lg px-2.5 text-white [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 mb-1">Billed Cost (₹)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={serviceForm.cost}
                      onChange={(e) => setServiceForm({ ...serviceForm, cost: e.target.value })}
                      className="w-full h-[36px] bg-[#0E0E10] border border-[#26262C] rounded-lg px-2.5 text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Issue / Work Performed</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Hinge calibration or part replacement"
                    value={serviceForm.issue}
                    onChange={(e) => setServiceForm({ ...serviceForm, issue: e.target.value })}
                    className="w-full h-[36px] bg-[#0E0E10] border border-[#26262C] rounded-lg px-2.5 text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full h-[36px] bg-white hover:bg-neutral-200 text-black font-semibold rounded-lg transition cursor-pointer"
                >
                  Add Service Log
                </button>
              </form>

              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Past Logs ({services.length})
                </div>
                {servicesLoading ? (
                  <p className="text-xs text-neutral-500 py-4">Loading service history...</p>
                ) : servicesError ? (
                  <p className="text-xs text-rose-300 py-4">{servicesError}</p>
                ) : services.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-4">No service entries recorded yet.</p>
                ) : (
                  services.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl bg-[#050505] border border-[#222226] flex items-start justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-mono text-neutral-400">{log.date}</div>
                        <div className="text-white font-medium mt-0.5">{log.issue}</div>
                      </div>
                      <span className="font-mono px-2 py-0.5 rounded bg-cyan-500/12 text-cyan-300 border border-cyan-500/25 shrink-0">
                        ₹{log.cost}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs shadow-2xl backdrop-blur-md ${
            toast.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
              : 'bg-[#0E0E10]/95 border-[#32323A] text-white'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={15} className="text-rose-400 shrink-0" />
          ) : (
            <Check size={15} className="text-cyan-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}