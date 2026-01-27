import { useState, useEffect, useMemo, useRef } from "react";
import type React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  User, 
  Download, 
  LogOut,
  ChevronRight,
  Camera,
  Mail,
  Phone,
  Globe,
  FileText,
  Check,
  X,
  Edit2,
  Tag
} from "lucide-react";
import { FinoraLogo } from "./FinoraLogo";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeToTransactions, subscribeToBudgets, Transaction, Budget } from "@/lib/firestore";
import { toast } from "sonner";
import { format } from "date-fns";
import { updateProfile } from "firebase/auth";
import jsPDF from "jspdf";
import { CategoryManagement } from "./CategoryManagement";

interface SettingsProfileProps {
  onLogout: () => void;
}

interface SettingItem {
  icon: React.ElementType;
  label: string;
  description?: string;
  action?: "toggle" | "link" | "select";
  value?: boolean | string;
  color?: string;
}

export const SettingsProfile = ({ onLogout }: SettingsProfileProps) => {
  const { currentUser, userProfile, logout, updateUserProfile } = useAuth();
  const [currency, setCurrency] = useState(userProfile?.currency || "INR");
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (currentUser) {
      setCurrency(userProfile?.currency || "INR");
      setPhoneInput(userProfile?.phone || "");
      setNameInput(userProfile?.name || currentUser.displayName || "");
    }
  }, [userProfile, currentUser]);

  // Load profile image from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedImage = localStorage.getItem("finora_profile_image");
    if (storedImage) {
      setProfileImage(storedImage);
    }
  }, []);


  useEffect(() => {
    if (!currentUser) return;

    const unsubscribeTransactions = subscribeToTransactions(currentUser.uid, (data) => {
      setTransactions(data);
      setLoading(false);
    });

    const unsubscribeBudgets = subscribeToBudgets(currentUser.uid, (data) => {
      setBudgets(data);
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeBudgets();
    };
  }, [currentUser]);

  // Calculate stats from real data
  const totalTransactions = transactions.length;
  const totalBudgets = budgets.length;
  
  // Calculate total savings (income - expenses)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyTransactions = transactions.filter((t) => {
    const date = t.date instanceof Date ? t.date : t.date.toDate();
    return date >= startOfMonth;
  });
  const totalIncome = monthlyTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = monthlyTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSavings = totalIncome - totalExpense;

  // Get member since date
  const memberSince = userProfile?.createdAt 
    ? format(userProfile.createdAt instanceof Date ? userProfile.createdAt : userProfile.createdAt.toDate(), "MMM yyyy")
    : currentUser?.metadata.creationTime 
    ? format(new Date(currentUser.metadata.creationTime), "MMM yyyy")
    : "Recently";

  const handleLogoutConfirm = async () => {
    try {
      await logout();
      setShowLogoutConfirm(false);
      onLogout();
      toast.success("Logged out successfully");
    } catch (error: any) {
      console.error("Logout error:", error);
      toast.error("Failed to logout. Please try again.");
    }
  };

  const handleCurrencyChange = async (newCurrency: string) => {
    try {
      await updateUserProfile({ currency: newCurrency });
      setCurrency(newCurrency);
      setShowCurrencyModal(false);
      toast.success("Currency updated successfully");
    } catch (error: any) {
      console.error("Currency update error:", error);
      toast.error("Failed to update currency");
    }
  };

  const handlePhoneSave = async () => {
    try {
      await updateUserProfile({ phone: phoneInput.trim() || undefined });
      setShowPhoneModal(false);
      toast.success("Phone number updated successfully");
    } catch (error: any) {
      console.error("Phone update error:", error);
      toast.error("Failed to update phone number");
    }
  };

  const currencies = [
    { code: "INR", symbol: "₹", name: "Indian Rupee" },
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "EUR", symbol: "€", name: "Euro" },
    { code: "GBP", symbol: "£", name: "British Pound" },
  ];

  const settingSections = useMemo(() => [
    {
      title: "Account",
      items: [
        { 
          icon: Mail, 
          label: "Email", 
          description: userProfile?.email || currentUser?.email || "Not set", 
          action: "link" as const 
        },
        { 
          icon: Phone, 
          label: "Phone", 
          description: userProfile?.phone || "Not set", 
          action: "link" as const 
        },
        { icon: Globe, label: "Currency", description: currency, action: "select" as const },
      ]
    },
    {
      title: "Data",
      items: [
        { icon: Download, label: "Export Data", description: isExporting ? "Exporting..." : "CSV, PDF", action: "link" as const },
        { icon: FileText, label: "Statements", action: "link" as const },
        { icon: Tag, label: "Manage Categories", action: "link" as const },
      ]
    }
  ], [userProfile, currentUser, currency, isExporting]);


  const handleNameSave = async () => {
    if (!currentUser || !nameInput.trim()) {
      toast.error("Please enter a valid name");
      return;
    }

    try {
      // Update Firebase Auth display name
      await updateProfile(currentUser, { displayName: nameInput.trim() });
      
      // Update Firestore profile
      await updateUserProfile({ name: nameInput.trim() });
      
      setShowNameModal(false);
      toast.success("Name updated successfully");
    } catch (error: any) {
      console.error("Name update error:", error);
      toast.error("Failed to update name. Please try again.");
    }
  };

  const handleExportData = async () => {
    if (!currentUser || isExporting) return;

    setIsExporting(true);
    toast.loading("Exporting data...", { id: "export-data" });

    try {
      // Export transactions as CSV
      const csvRows = [
        ["Date", "Title", "Category", "Type", "Amount", "Payment Method", "Note"],
        ...transactions.map(t => {
          const date = t.date instanceof Date ? t.date : t.date.toDate();
          return [
            format(date, "yyyy-MM-dd HH:mm"),
            t.title,
            t.category,
            t.type,
            t.amount.toString(),
            t.paymentMethod || "",
            t.note || ""
          ];
        })
      ];

      const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
      const csvBlob = new Blob([csvContent], { type: "text/csv" });
      const csvUrl = URL.createObjectURL(csvBlob);
      const csvLink = document.createElement("a");
      csvLink.href = csvUrl;
      csvLink.download = `finora_transactions_${format(new Date(), "yyyy-MM-dd")}.csv`;
      csvLink.click();
      URL.revokeObjectURL(csvUrl);

      // Export summary as PDF
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      let yPosition = margin;

      // Header
      pdf.setFillColor(20, 20, 30);
      pdf.rect(0, 0, pageWidth, 40, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text("Finora Data Export", pageWidth / 2, 18, { align: "center" });
      
      const userName = userProfile?.name || currentUser?.displayName || currentUser?.email?.split("@")[0] || "User";
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Exported for: ${userName}`, pageWidth / 2, 26, { align: "center" });
      pdf.setFontSize(9);
      pdf.setTextColor(200, 200, 200);
      pdf.text(`Exported on ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}`, pageWidth / 2, 32, { align: "center" });

      yPosition = 50;

      // Summary
      pdf.setFillColor(30, 30, 40);
      pdf.rect(margin, yPosition, pageWidth - 2 * margin, 8, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(13);
      pdf.setFont("helvetica", "bold");
      pdf.text("Summary", margin + 5, yPosition + 5.5);
      yPosition += 12;

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Total Transactions: ${transactions.length}`, margin + 5, yPosition);
      yPosition += 7;
      pdf.text(`Total Budgets: ${budgets.length}`, margin + 5, yPosition);
      yPosition += 7;
      pdf.text(`Monthly Income: ₹${totalIncome.toLocaleString()}`, margin + 5, yPosition);
      yPosition += 7;
      pdf.text(`Monthly Expenses: ₹${totalExpense.toLocaleString()}`, margin + 5, yPosition);
      yPosition += 7;
      pdf.setTextColor(totalSavings >= 0 ? 76 : 244, totalSavings >= 0 ? 175 : 67, totalSavings >= 0 ? 80 : 54);
      pdf.text(`Net Savings: ₹${totalSavings.toLocaleString()}`, margin + 5, yPosition);
      yPosition += 15;

      // Transactions list (first 50)
      if (transactions.length > 0) {
        pdf.setFillColor(30, 30, 40);
        pdf.rect(margin, yPosition, pageWidth - 2 * margin, 8, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "bold");
        pdf.text("Recent Transactions", margin + 5, yPosition + 5.5);
        yPosition += 12;

        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        const displayTransactions = transactions.slice(0, 50);
        displayTransactions.forEach((t, idx) => {
          if (yPosition > 270) {
            pdf.addPage();
            yPosition = margin;
          }
          const date = t.date instanceof Date ? t.date : t.date.toDate();
          const dateStr = format(date, "MMM d, yyyy");
          const amount = `₹${t.amount.toLocaleString()}`;
          pdf.text(`${idx + 1}. ${dateStr} - ${t.title} (${t.category}) - ${amount}`, margin + 5, yPosition);
          yPosition += 5;
        });

        if (transactions.length > 50) {
          yPosition += 3;
          pdf.setFont("helvetica", "italic");
          pdf.setTextColor(150, 150, 150);
          pdf.text(`... and ${transactions.length - 50} more transactions (see CSV file)`, margin + 5, yPosition);
        }
      }

      // Footer
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, 280, pageWidth - margin, 280);
        pdf.setTextColor(150, 150, 150);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Page ${i} of ${totalPages} | Finora Data Export`, pageWidth / 2, 285, { align: "center" });
      }

      const fileName = `finora_export_${userName.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      pdf.save(fileName);

      toast.success("Data exported successfully!", { id: "export-data" });
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data. Please try again.", { id: "export-data" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleProfileImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleProfileImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setProfileImage(result);
      if (typeof window !== "undefined") {
        localStorage.setItem("finora_profile_image", result);
      }
      toast.success("Profile picture updated");
    };
    reader.onerror = () => {
      toast.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const handleItemClick = (item: SettingItem) => {
    if (item.label === "Currency") {
      setShowCurrencyModal(true);
    } else if (item.label === "Phone") {
      setShowPhoneModal(true);
    } else if (item.label === "Email") {
      toast.info("Email cannot be changed. It's linked to your Google account.");
    } else if (item.label === "Manage Categories") {
      setShowCategoryManagement(true);
    } else if (item.label === "Export Data") {
      handleExportData();
    } else if (item.label === "Statements") {
      handleExportData();
    }
  };

  return (
    <motion.div
      className="min-h-screen bg-background pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-14 pb-4 sm:pb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-4 sm:mb-6">Settings</h1>

        {/* Profile Card */}
        <motion.div
          className="glass-card-elevated p-4 sm:p-5 rounded-2xl"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center overflow-hidden">
                {profileImage ? (
                  <img
                    src={profileImage}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 sm:w-10 sm:h-10 text-primary-foreground" />
                )}
              </div>
              <button 
                onClick={handleProfileImageClick}
                className="absolute -bottom-1 -right-1 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-card border-2 border-background flex items-center justify-center shadow-lg hover:bg-muted transition-colors"
              >
                <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProfileImageChange}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
                  {userProfile?.name || currentUser?.displayName || "User"}
                </h2>
                <button
                  onClick={() => {
                    setNameInput(userProfile?.name || currentUser?.displayName || "");
                    setShowNameModal(true);
                  }}
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-secondary flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                >
                  <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {userProfile?.email || currentUser?.email || "No email"}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                  Member
                </span>
                <span className="text-xs text-muted-foreground">Member since {memberSince}</span>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-border/30">
            <div className="text-center">
              <p className="text-lg sm:text-xl font-bold text-foreground">
                {loading ? "..." : totalTransactions}
              </p>
              <p className="text-xs text-muted-foreground">Transactions</p>
            </div>
            <div className="text-center border-x border-border/30">
              <p className="text-lg sm:text-xl font-bold text-foreground">
                {loading ? "..." : totalBudgets}
              </p>
              <p className="text-xs text-muted-foreground">Budgets</p>
            </div>
            <div className="text-center">
              <p className={`text-lg sm:text-xl font-bold ${totalSavings >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                {loading ? "..." : `${totalSavings >= 0 ? "₹" : "-₹"}${Math.abs(totalSavings).toLocaleString()}`}
              </p>
              <p className="text-xs text-muted-foreground">This Month</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Settings Sections */}
      <div className="px-4 sm:px-6 space-y-4 sm:space-y-6">
        {settingSections.map((section, sectionIndex) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + sectionIndex * 0.05 }}
          >
            <h3 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3 px-1">
              {section.title}
            </h3>
            <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border/30">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleItemClick(item)}
                  className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-muted/30 flex items-center justify-center flex-shrink-0">
                      <item.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${item.color || "text-muted-foreground"}`} />
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <p className="font-medium text-foreground text-sm sm:text-base truncate">{item.label}</p>
                      {item.description && (
                        <p className={`text-xs sm:text-sm truncate ${item.color || "text-muted-foreground"}`}>
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {item.action === "toggle" ? (
                    <div
                      className={`relative w-11 h-5.5 sm:w-12 sm:h-6 rounded-full transition-all flex-shrink-0 ${
                        item.value ? "bg-primary" : "bg-muted/50"
                      }`}
                    >
                      <motion.div
                        className="absolute top-0.5 sm:top-1 w-4 h-4 rounded-full bg-white shadow"
                        animate={{ left: item.value ? "calc(100% - 18px)" : "4px" }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </div>
                  ) : item.label === "Export Data" && isExporting ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full flex-shrink-0"
                    />
                  ) : (
                    <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Logout Button */}
        <motion.button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive font-medium hover:bg-destructive/20 transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <LogOut className="w-5 h-5" />
          Log Out
        </motion.button>

        {/* App Version */}
        <div className="text-center py-4">
          <div className="flex justify-center mb-2">
            <FinoraLogo size={24} />
          </div>
          <p className="text-xs text-muted-foreground">Version 1.0.0</p>
        </div>
      </div>

      {/* Currency Modal */}
      <AnimatePresence>
        {showCurrencyModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCurrencyModal(false)}
            />
            <motion.div
              className="relative w-full max-w-lg bg-card rounded-t-3xl p-6"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Select Currency</h2>
                <button
                  onClick={() => setShowCurrencyModal(false)}
                  className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-2">
                {currencies.map((curr) => (
                  <button
                    key={curr.code}
                    onClick={() => handleCurrencyChange(curr.code)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
                      currency === curr.code
                        ? "bg-primary/20 border border-primary/50"
                        : "bg-muted/20 border border-transparent hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{curr.symbol}</span>
                      <div className="text-left">
                        <p className="font-medium text-foreground">{curr.name}</p>
                        <p className="text-sm text-muted-foreground">{curr.code}</p>
                      </div>
                    </div>
                    {currency === curr.code && (
                      <Check className="w-5 h-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone Edit Modal */}
      <AnimatePresence>
        {showPhoneModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowPhoneModal(false)}
            />
            <motion.div
              className="relative w-full max-w-lg bg-card rounded-t-3xl p-6"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Update Phone Number</h2>
                <button
                  onClick={() => setShowPhoneModal(false)}
                  className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Phone Number</label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-muted/30 border border-border/50 rounded-xl py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
                <button
                  onClick={handlePhoneSave}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold"
                >
                  Save Phone Number
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Name Edit Modal */}
      <AnimatePresence>
        {showNameModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowNameModal(false)}
            />
            <motion.div
              className="relative w-full max-w-lg bg-card rounded-t-3xl p-6"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Update Name</h2>
                <button
                  onClick={() => setShowNameModal(false)}
                  className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Full Name</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-muted/30 border border-border/50 rounded-xl py-3 px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
                <button
                  onClick={handleNameSave}
                  disabled={!nameInput.trim()}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Name
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout Confirmation */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowLogoutConfirm(false)}
            />
            <motion.div
              className="relative w-full max-w-sm bg-card rounded-3xl p-6 text-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-destructive" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Log Out?</h3>
              <p className="text-muted-foreground mb-6">Are you sure you want to log out of your account?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-muted/30 text-foreground font-medium hover:bg-muted/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogoutConfirm}
                  className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors"
                >
                  Log Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Management */}
      <CategoryManagement
        isOpen={showCategoryManagement}
        onClose={() => setShowCategoryManagement(false)}
      />
    </motion.div>
  );
};
