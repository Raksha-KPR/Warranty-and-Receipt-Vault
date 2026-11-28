import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE = "http://127.0.0.1:5000/api";
const EXPIRING_SOON_DAYS = 30;

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function diffDaysFromToday(dateStr) {
  const target = parseLocalDate(dateStr);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target - today) / msPerDay);
}

function getWarrantyMeta(purchase) {
  const expiry = purchase.warranty_expiry || purchase.warranties?.[0]?.end_date;
  if (!expiry) {
    return { label: "Not recorded", tone: "muted", status: "none" };
  }
  const daysLeft = diffDaysFromToday(expiry);
  if (daysLeft === null) {
    return { label: `Until ${expiry}`, tone: "info", status: "active" };
  }
  if (daysLeft < 0) {
    return { label: `Expired (${expiry})`, tone: "danger", status: "expired" };
  }
  if (daysLeft <= EXPIRING_SOON_DAYS) {
    return {
      label: `${daysLeft}d left · Until ${expiry}`,
      tone: "warning",
      status: "expiring",
    };
  }
  return { label: `Active until ${expiry}`, tone: "success", status: "active" };
}

function getReturnMeta(purchase) {
  if (!purchase.return_deadline) {
    return { label: "Not set", tone: "muted", isExpiringSoon: false };
  }
  const daysLeft = diffDaysFromToday(purchase.return_deadline);
  if (daysLeft === null) {
    return { label: purchase.return_deadline, tone: "muted", isExpiringSoon: false };
  }
  if (daysLeft < 0) {
    return { label: "Closed", tone: "muted", isExpiringSoon: false };
  }
  return {
    label: `${daysLeft}d left (${purchase.return_deadline})`,
    tone: daysLeft <= 7 ? "warning" : "info",
    isExpiringSoon: daysLeft <= 7,
  };
}

function getServiceStatusTone(status) {
  if (status === "Completed") return "success";
  if (status === "In Progress") return "warning";
  return "info";
}

const initialPurchaseForm = {
  product_name: "",
  brand: "",
  category: "Electronics",
  store_name: "",
  city: "",
  purchase_date: new Date().toISOString().slice(0, 10),
  price: "",
  receipt_no: "",
  return_days: "7",
  warranty_type: "Standard",
  warranty_months: "12",
  warranty_start_date: "",
};

const initialServiceForm = {
  service_date: new Date().toISOString().slice(0, 10),
  issue: "",
  cost: "0",
  status: "Pending",
};

export default function App() {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filterTab, setFilterTab] = useState("all"); // all | expiring | expired
  const [searchQuery, setSearchQuery] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState(initialPurchaseForm);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editForm, setEditForm] = useState({
    price: "",
    receipt_no: "",
    return_deadline: "",
    warranty_type: "Standard",
    warranty_months: "12",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState(null);
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceForm, setServiceForm] = useState(initialServiceForm);
  const [submittingService, setSubmittingService] = useState(false);

  const servicesSectionRef = useRef(null);

  async function loadPurchases() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load purchases");
      setPurchases(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPurchases();
  }, []);

  const enrichedPurchases = useMemo(() => {
    return purchases.map((item) => {
      const warranty = getWarrantyMeta(item);
      const returnWindow = getReturnMeta(item);
      const isExpiringSoon =
        warranty.status === "expiring" || returnWindow.isExpiringSoon;
      const isExpired = warranty.status === "expired";
      return {
        ...item,
        warranty,
        returnWindow,
        isExpiringSoon,
        isExpired,
      };
    });
  }, [purchases]);

  const stats = useMemo(() => {
    const total = enrichedPurchases.length;
    const expiringSoon = enrichedPurchases.filter((p) => p.isExpiringSoon).length;
    const activeCoverage = enrichedPurchases.filter(
      (p) => p.warranty.status === "active" || p.warranty.status === "expiring"
    ).length;
    const expired = enrichedPurchases.filter((p) => p.isExpired).length;
    return { total, expiringSoon, activeCoverage, expired };
  }, [enrichedPurchases]);

  const filteredPurchases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedPurchases.filter((item) => {
      if (filterTab === "expiring" && !item.isExpiringSoon) return false;
      if (filterTab === "expired" && !item.isExpired) return false;
      if (!q) return true;
      const haystack = [
        item.product_name,
        item.brand,
        item.category,
        item.store_name,
        item.city,
        item.receipt_no,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [enrichedPurchases, filterTab, searchQuery]);

  const totalServiceCost = useMemo(() => {
    return services.reduce((sum, s) => sum + Number(s.cost || 0), 0);
  }, [services]);

  function openEditModal(item) {
    const firstWarranty = item.warranties?.[0];
    setEditingPurchase(item);
    setEditForm({
      price: item.price ?? "",
      receipt_no: item.receipt_no ?? "",
      return_deadline: item.return_deadline ?? "",
      warranty_type: firstWarranty?.type || "Standard",
      warranty_months: String(firstWarranty?.warranty_months || 12),
    });
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingPurchase) return;
    setSavingEdit(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${editingPurchase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: editForm.price === "" ? null : Number(editForm.price),
          receipt_no: editForm.receipt_no.trim() || null,
          return_deadline: editForm.return_deadline || null,
          warranty_type: editForm.warranty_type,
          warranty_months: Number(editForm.warranty_months),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update purchase");

      setEditingPurchase(null);
      await loadPurchases();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function openServices(purchaseId) {
    setSelectedPurchaseId(purchaseId);
    setLoadingServices(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}/services`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load service logs");
      setServices(Array.isArray(data) ? data : []);
      requestAnimationFrame(() => {
        servicesSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingServices(false);
    }
  }

  async function handleCreatePurchase(e) {
    e.preventDefault();
    setSubmittingPurchase(true);
    setError("");
    try {
      const payload = {
        ...purchaseForm,
        price: Number(purchaseForm.price),
        warranty_months: Number(purchaseForm.warranty_months),
        return_days:
          purchaseForm.return_days === "" ? null : Number(purchaseForm.return_days),
        brand: purchaseForm.brand.trim() || null,
        city: purchaseForm.city.trim() || null,
        receipt_no: purchaseForm.receipt_no.trim() || null,
        warranty_start_date: purchaseForm.warranty_start_date || null,
      };
      const res = await fetch(`${API_BASE}/purchases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save purchase");

      setPurchaseForm(initialPurchaseForm);
      setIsModalOpen(false);
      await loadPurchases();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingPurchase(false);
    }
  }

  async function handleDeletePurchase(purchaseId, productName) {
    if (!window.confirm(`Delete "${productName || `#${purchaseId}`}" and its logs?`)) {
      return;
    }
    setError("");
    try {
      const res = await fetch(`${API_BASE}/purchases/${purchaseId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete purchase");

      if (selectedPurchaseId === purchaseId) {
        setSelectedPurchaseId(null);
        setServices([]);
      }
      await loadPurchases();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateService(e) {
    e.preventDefault();
    if (!selectedPurchaseId) return;
    setSubmittingService(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/purchases/${selectedPurchaseId}/services`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...serviceForm,
            cost: Number(serviceForm.cost || 0),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add service log");

      setServices((prev) => [data, ...prev]);
      setPurchases((prev) =>
        prev.map((p) =>
          p.id === selectedPurchaseId
            ? { ...p, service_count: (p.service_count || 0) + 1 }
            : p
        )
      );
      setServiceForm(initialServiceForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingService(false);
    }
  }

  async function handleStatusChange(serviceId, nextStatus) {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/services/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update status");

      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, status: data.status } : s))
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteService(serviceId) {
    if (!window.confirm("Delete this service record?")) return;
    setError("");
    try {
      const res = await fetch(`${API_BASE}/services/${serviceId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete service log");

      setServices((prev) => prev.filter((s) => s.id !== serviceId));
      if (selectedPurchaseId != null) {
        setPurchases((prev) =>
          prev.map((p) =>
            p.id === selectedPurchaseId
              ? { ...p, service_count: Math.max(0, (p.service_count || 1) - 1) }
              : p
          )
        );
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function handleExportCsv() {
    window.location.href = `${API_BASE}/export.csv`;
  }

  const selectedPurchase = purchases.find((p) => p.id === selectedPurchaseId);

  return (
    <div className="vault-shell">
      <header className="vault-header">
        <div>
          <div className="brand-row">
            <h1>RECEIPTBOX</h1>
            <span className="db-badge">DBMS</span>
          </div>
          <p className="subtitle">
            Warranty deadlines, return windows &amp; service logs
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCsv}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsModalOpen(true)}
          >
            + New Purchase
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <section className="kpi-grid" aria-label="Vault summary">
        <div className="kpi-card">
          <span className="kpi-label">Vault Inventory</span>
          <strong className="kpi-value">{stats.total}</strong>
          <span className="kpi-sub">Registered receipts</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Expiring Soon</span>
          <strong className="kpi-value warn-text">{stats.expiringSoon}</strong>
          <span className="kpi-sub">Action window open</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Active Coverage</span>
          <strong className="kpi-value ok-text">{stats.activeCoverage}</strong>
          <span className="kpi-sub">Within warranty period</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Expired</span>
          <strong className="kpi-value">{stats.expired}</strong>
          <span className="kpi-sub">Past warranty date</span>
        </div>
      </section>

      <section className="toolbar">
        <div className="filter-tabs" role="tablist">
          <button
            type="button"
            className={filterTab === "all" ? "tab active" : "tab"}
            onClick={() => setFilterTab("all")}
          >
            All Items ({stats.total})
          </button>
          <button
            type="button"
            className={filterTab === "expiring" ? "tab active" : "tab"}
            onClick={() => setFilterTab("expiring")}
          >
            Expiring Soon ({stats.expiringSoon})
          </button>
          <button
            type="button"
            className={filterTab === "expired" ? "tab active" : "tab"}
            onClick={() => setFilterTab("expired")}
          >
            Expired ({stats.expired})
          </button>
        </div>

        <input
          type="search"
          className="search-input"
          placeholder="Search product, category, store, receipt..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </section>

      <section className="table-card">
        {loading ? (
          <p className="empty-state">Loading purchases from SQLite...</p>
        ) : filteredPurchases.length === 0 ? (
          <p className="empty-state">No matching purchases found.</p>
        ) : (
          <div className="table-wrap">
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Product &amp; Category</th>
                  <th>Receipt No.</th>
                  <th>Purchase Date</th>
                  <th>Return Window</th>
                  <th>Warranty Status</th>
                  <th>Service &amp; Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="product-title">{item.product_name}</div>
                      <div className="product-meta">
                        <span className="pill">{item.category}</span>
                        {item.store_name && <span>{item.store_name}</span>}
                        {item.price != null && (
                          <span>₹{Number(item.price).toLocaleString()}</span>
                        )}
                      </div>
                    </td>
                    <td className="mono">{item.receipt_no || `#${item.id}`}</td>
                    <td className="mono">{item.purchase_date}</td>
                    <td>
                      <span className={`badge ${item.returnWindow.tone}`}>
                        {item.returnWindow.label}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${item.warranty.tone}`}>
                        {item.warranty.label}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => openServices(item.id)}
                        >
                          Logs ({item.service_count ?? 0})
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => openEditModal(item)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => handleDeletePurchase(item.id, item.product_name)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedPurchaseId && (
        <section ref={servicesSectionRef} className="service-panel">
          <div className="panel-header">
            <div>
              <h2>
                Service Records —{" "}
                {selectedPurchase?.product_name || `Purchase #${selectedPurchaseId}`}
              </h2>
              <p className="subtitle">
                Purchase #{selectedPurchaseId} ·{" "}
                {selectedPurchase?.store_name || "Store"} · Total Service Spend: ₹
                {totalServiceCost.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSelectedPurchaseId(null)}
            >
              Close
            </button>
          </div>

          <form className="service-form" onSubmit={handleCreateService}>
            <input
              type="date"
              required
              value={serviceForm.service_date}
              onChange={(e) =>
                setServiceForm((f) => ({ ...f, service_date: e.target.value }))
              }
            />
            <input
              type="text"
              required
              placeholder="Issue or repair description"
              value={serviceForm.issue}
              onChange={(e) =>
                setServiceForm((f) => ({ ...f, issue: e.target.value }))
              }
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Cost"
              value={serviceForm.cost}
              onChange={(e) =>
                setServiceForm((f) => ({ ...f, cost: e.target.value }))
              }
            />
            <select
              value={serviceForm.status}
              onChange={(e) =>
                setServiceForm((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
            <button
              type="submit"
              className="btn-primary"
              disabled={submittingService}
            >
              {submittingService ? "Saving..." : "Add Service"}
            </button>
          </form>

          {loadingServices ? (
            <p className="empty-state">Loading service logs...</p>
          ) : services.length === 0 ? (
            <p className="empty-state">
              No service records logged for this item yet.
            </p>
          ) : (
            <ul className="service-list">
              {services.map((srv) => (
                <li key={srv.id} className="service-item">
                  <div>
                    <strong>{srv.issue}</strong>
                    <div className="product-meta">
                      <span className="mono">{srv.date}</span>
                      <span>Cost: ₹{Number(srv.cost || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <span className={`badge ${getServiceStatusTone(srv.status)}`}>
                      {srv.status}
                    </span>
                    <select
                      aria-label={`Status for ${srv.issue}`}
                      value={srv.status}
                      onChange={(e) => handleStatusChange(srv.id, e.target.value)}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => handleDeleteService(srv.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h2>Add Purchase &amp; Warranty</h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form className="modal-form" onSubmit={handleCreatePurchase}>
              <label>
                Product Name *
                <input
                  type="text"
                  required
                  value={purchaseForm.product_name}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({
                      ...f,
                      product_name: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Brand
                <input
                  type="text"
                  value={purchaseForm.brand}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({ ...f, brand: e.target.value }))
                  }
                />
              </label>

              <label>
                Category *
                <input
                  type="text"
                  required
                  value={purchaseForm.category}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({ ...f, category: e.target.value }))
                  }
                />
              </label>

              <label>
                Store Name *
                <input
                  type="text"
                  required
                  value={purchaseForm.store_name}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({ ...f, store_name: e.target.value }))
                  }
                />
              </label>

              <label>
                City
                <input
                  type="text"
                  value={purchaseForm.city}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </label>

              <label>
                Receipt No.
                <input
                  type="text"
                  value={purchaseForm.receipt_no}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({ ...f, receipt_no: e.target.value }))
                  }
                />
              </label>

              <label>
                Purchase Date *
                <input
                  type="date"
                  required
                  value={purchaseForm.purchase_date}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({
                      ...f,
                      purchase_date: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Price *
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={purchaseForm.price}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({ ...f, price: e.target.value }))
                  }
                />
              </label>

              <label>
                Return Window (Days)
                <input
                  type="number"
                  min="0"
                  value={purchaseForm.return_days}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({
                      ...f,
                      return_days: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Warranty Type *
                <select
                  value={purchaseForm.warranty_type}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({
                      ...f,
                      warranty_type: e.target.value,
                    }))
                  }
                >
                  <option value="Standard">Standard</option>
                  <option value="Extended">Extended</option>
                </select>
              </label>

              <label>
                Warranty Months *
                <input
                  type="number"
                  required
                  min="1"
                  value={purchaseForm.warranty_months}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({
                      ...f,
                      warranty_months: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Warranty Start Date (optional)
                <input
                  type="date"
                  value={purchaseForm.warranty_start_date}
                  onChange={(e) =>
                    setPurchaseForm((f) => ({
                      ...f,
                      warranty_start_date: e.target.value,
                    }))
                  }
                />
              </label>

              <div className="modal-actions full-span">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingPurchase}
                >
                  {submittingPurchase ? "Saving..." : "Save to Vault"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingPurchase && (
        <div
          className="modal-backdrop"
          onClick={() => setEditingPurchase(null)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h2>Edit — {editingPurchase.product_name}</h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setEditingPurchase(null)}
              >
                ✕
              </button>
            </div>

            <form className="modal-form" onSubmit={handleSaveEdit}>
              <label>
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.price}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, price: e.target.value }))
                  }
                />
              </label>

              <label>
                Receipt No.
                <input
                  type="text"
                  value={editForm.receipt_no}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, receipt_no: e.target.value }))
                  }
                />
              </label>

              <label>
                Return Deadline
                <input
                  type="date"
                  value={editForm.return_deadline}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      return_deadline: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Warranty Type
                <select
                  value={editForm.warranty_type}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      warranty_type: e.target.value,
                    }))
                  }
                >
                  <option value="Standard">Standard</option>
                  <option value="Extended">Extended</option>
                </select>
              </label>

              <label className="full-span">
                Warranty Months
                <input
                  type="number"
                  min="1"
                  value={editForm.warranty_months}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      warranty_months: e.target.value,
                    }))
                  }
                />
              </label>

              <div className="modal-actions full-span">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setEditingPurchase(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingEdit}
                >
                  {savingEdit ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}