import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Building, 
  Car, 
  CreditCard, 
  ChevronRight, 
  ArrowLeft,
  Calendar,
  IndianRupee,
  PieChart as PieChartIcon,
  Activity,
  ChevronDown,
  Info
} from "lucide-react";
import { 
  Asset, 
  Liability, 
  NetWorthSnapshot,
  getAssets,
  getLiabilities,
  getNetWorthHistory,
  addAsset,
  updateAsset,
  deleteAsset,
  addLiability,
  updateLiability,
  deleteLiability
} from "../lib/firestore";
import { calculateNetWorth, NetWorthSummary } from "../lib/net-worth-service";
import { useAuth } from "../contexts/AuthContext";
import { format } from "date-fns";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { toast } from "sonner";

const NetWorthPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { currentUser } = useAuth();
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "assets" | "liabilities">("overview");

  // Form states
  const [showAddModal, setShowAddModal] = useState<"asset" | "liability" | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    value: 0
  });

  const fetchData = async () => {
    if (!currentUser) return;
    try {
      const [sum, hist, asts, libs] = await Promise.all([
        calculateNetWorth(currentUser.uid),
        getNetWorthHistory(currentUser.uid),
        getAssets(currentUser.uid),
        getLiabilities(currentUser.uid)
      ]);
      setSummary(sum);
      setHistory(hist);
      setAssets(asts);
      setLiabilities(libs);
    } catch (error) {
      console.error("Error fetching net worth data:", error);
      toast.error("Failed to load net worth data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  const handleAddAsset = async () => {
    if (!currentUser || !formData.name || !formData.category) return;
    try {
      await addAsset(currentUser.uid, {
        name: formData.name,
        category: formData.category as any,
        currentValue: Number(formData.value)
      });
      toast.success("Asset added successfully!");
      setShowAddModal(null);
      fetchData();
    } catch (error) {
      toast.error("Failed to add asset.");
    }
  };

  const handleAddLiability = async () => {
    if (!currentUser || !formData.name || !formData.category) return;
    try {
      await addLiability(currentUser.uid, {
        name: formData.name,
        category: formData.category as any,
        outstandingAmount: Number(formData.value)
      });
      toast.success("Liability added successfully!");
      setShowAddModal(null);
      fetchData();
    } catch (error) {
      toast.error("Failed to add liability.");
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!currentUser) return;
    if (!confirm("Are you sure you want to delete this asset?")) return;
    try {
      await deleteAsset(currentUser.uid, id);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete asset.");
    }
  };

  const handleDeleteLiability = async (id: string) => {
    if (!currentUser) return;
    if (!confirm("Are you sure you want to delete this liability?")) return;
    try {
      await deleteLiability(currentUser.uid, id);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete liability.");
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(val);
  };

  // No longer returning a full-screen loader to ensure '0' is visible immediately
  // as per user request to show 0 until they add anything.

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border px-4 py-4 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-lg font-bold">Net Worth Tracker</h1>
        <div className="w-9" />
      </div>

      <div className="px-4 py-6 max-w-4xl mx-auto">
        {/* Net Worth Summary Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 rounded-3xl mb-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Activity className="w-32 h-32 text-primary rotate-12" />
          </div>
          
          <p className="text-sm font-medium text-muted-foreground mb-1 uppercase tracking-wider">Total Net Worth</p>
          <div className="flex items-end gap-3 mb-4">
            <h2 className="text-4xl font-black text-foreground">{formatCurrency(summary?.netWorth || 0)}</h2>
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold mb-1.5 ${
              (summary?.monthlyChange || 0) >= 0 ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
            }`}>
              {(summary?.monthlyChange || 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {formatCurrency(Math.abs(summary?.monthlyChange || 0))} 
              <span className="opacity-70 ml-1">MoM</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-border/50">
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Total Assets</p>
              <p className="text-lg font-bold text-success">{formatCurrency(summary?.totalAssets || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Total Liabilities</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(summary?.totalLiabilities || 0)}</p>
            </div>
          </div>
        </motion.div>

        {/* Tab Switcher */}
        <div className="flex bg-muted/30 p-1 rounded-2xl mb-6">
          {(["overview", "assets", "liabilities"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab ? "bg-background shadow-sm text-foreground scale-[1.02]" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6"
            >
              {/* History Chart */}
              <div className="glass-card p-4 sm:p-6 rounded-3xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    Growth Trend
                  </h3>
                </div>
                <div className="h-64 sm:h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                      <defs>
                        <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                      <XAxis 
                        dataKey="month" 
                        stroke="var(--muted-foreground)" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => format(new Date(val), "MMM yyyy")}
                      />
                      <YAxis 
                        stroke="var(--muted-foreground)" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => `₹${val/1000}k`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "var(--background)", 
                          borderColor: "var(--border)",
                          borderRadius: "16px",
                          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)"
                        }}
                        formatter={(val) => formatCurrency(val as number)}
                      />
                      <Legend />
                      <Area 
                        name="Net Worth"
                        type="monotone" 
                        dataKey="netWorth" 
                        stroke="var(--primary)" 
                        strokeWidth={4}
                        fillOpacity={1} 
                        fill="url(#colorNetWorth)" 
                      />
                      <Area 
                        name="Assets"
                        type="monotone" 
                        dataKey="totalAssets" 
                        stroke="var(--success)" 
                        strokeWidth={2}
                        fillOpacity={0} 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Asset Composition Bar */}
              <div className="glass-card p-6 rounded-3xl">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-success" />
                  Asset Composition
                </h3>
                <div className="flex h-3 w-full rounded-full overflow-hidden mb-6 bg-muted">
                  {Object.entries(summary?.assetsBreakdown || {}).map(([cat, val], i) => (
                    <div 
                      key={cat}
                      style={{ 
                        width: `${(val / (summary?.totalAssets || 1)) * 100}%`,
                        backgroundColor: i === 0 ? "var(--primary)" : i === 1 ? "var(--success)" : i === 2 ? "var(--warning)" : "var(--accent)"
                      }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(summary?.assetsBreakdown || {}).map(([cat, val], i) => (
                    <div key={cat} className="flex items-center gap-2">
                      <div 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: i === 0 ? "var(--primary)" : i === 1 ? "var(--success)" : i === 2 ? "var(--warning)" : "var(--accent)" }}
                      />
                      <span className="text-xs font-medium capitalize text-muted-foreground">{cat}</span>
                      <span className="text-xs font-bold ml-auto">{formatCurrency(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "assets" && (
            <motion.div
              key="assets"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <button 
                onClick={() => {
                  setFormData({ name: "", category: "liquid", value: 0 });
                  setShowAddModal("asset");
                }}
                className="w-full p-4 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add New Asset
              </button>

              {/* Bank Balance (Locked from profile) */}
              <div className="glass-card p-4 rounded-2xl border-l-4 border-l-primary flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-sm">Liquid Cash (Bank)</h4>
                  <p className="text-xs text-muted-foreground">Synced from profile</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatCurrency(summary?.assetsBreakdown.liquid || 0)}</p>
                </div>
              </div>

              {/* Asset List */}
              {assets.map(asset => (
                <div key={asset.id} className="glass-card p-4 rounded-2xl flex items-center gap-4 group">
                  <div className={`w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success font-bold`}>
                    {asset.category === "physical" ? <Building className="w-5 h-5" /> : asset.category === "investment" ? <TrendingUp className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm">{asset.name}</h4>
                    <p className="text-xs text-muted-foreground capitalize">{asset.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(asset.currentValue)}</p>
                  </div>
                  <button 
                    onClick={() => asset.id && handleDeleteAsset(asset.id)}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}

          {activeTab === "liabilities" && (
            <motion.div
              key="liabilities"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <button 
                onClick={() => {
                  setFormData({ name: "", category: "creditcard", value: 0 });
                  setShowAddModal("liability");
                }}
                className="w-full p-4 rounded-2xl border-2 border-dashed border-border hover:border-destructive/50 hover:bg-destructive/5 transition-all text-muted-foreground flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add New Liability
              </button>

              {liabilities.map(liability => (
                <div key={liability.id} className="glass-card p-4 rounded-2xl border-l-4 border-l-destructive flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive font-bold">
                    {liability.category === "creditcard" ? <CreditCard className="w-5 h-5" /> : <Car className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm">{liability.name}</h4>
                    <p className="text-xs text-muted-foreground capitalize">{liability.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{formatCurrency(liability.outstandingAmount)}</p>
                  </div>
                  <button 
                    onClick={() => liability.id && handleDeleteLiability(liability.id)}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-background/80 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-card p-6 w-full max-w-md rounded-3xl"
          >
            <h2 className="text-xl font-bold mb-4">Add {showAddModal === "asset" ? "Asset" : "Liability"}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full p-3 rounded-xl bg-muted/30 border border-border focus:border-primary outline-none transition-all"
                  placeholder={showAddModal === "asset" ? "e.g. Gold, HDFC Bank" : "e.g. Car Loan, Credit Card"}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">Category</label>
                <select 
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="nice-select"
                >
                  {showAddModal === "asset" ? (
                    <>
                      <option value="liquid">Liquid Assets</option>
                      <option value="investment">Investments</option>
                      <option value="physical">Physical Assets</option>
                      <option value="other">Other</option>
                    </>
                  ) : (
                    <>
                      <option value="homeloan">Home Loan</option>
                      <option value="carloan">Car Loan</option>
                      <option value="creditcard">Credit Card Due</option>
                      <option value="other">Other Dues</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase mb-1 block">
                  {showAddModal === "asset" ? "Current Value" : "Outstanding Amount"}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</div>
                  <input 
                    type="number" 
                    value={formData.value || ""}
                    onChange={(e) => setFormData({...formData, value: Number(e.target.value)})}
                    className="w-full pl-8 p-3 rounded-xl bg-muted/30 border border-border focus:border-primary outline-none transition-all"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowAddModal(null)}
                className="flex-1 py-3 rounded-xl hover:bg-muted font-bold transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={showAddModal === "asset" ? handleAddAsset : handleAddLiability}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:shadow-lg hover:shadow-primary/20 transition-all"
              >
                Add {showAddModal === "asset" ? "Asset" : "Liability"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default NetWorthPage;
