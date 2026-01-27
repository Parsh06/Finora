import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { X, ArrowDownLeft, ArrowUpRight, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { addTransaction } from "@/lib/firestore";
import { toast } from "sonner";
import { useCategories } from "@/hooks/useCategories";

interface AddTransactionProps {
  isOpen: boolean;
  onClose: () => void;
}

const paymentMethods = [
  { id: "cash", label: "Cash", icon: "💵" },
  { id: "card", label: "Card", icon: "💳" },
  { id: "online", label: "Online", icon: "📱" },
];

export const AddTransaction = ({ isOpen, onClose }: AddTransactionProps) => {
  const { currentUser } = useAuth();
  const { expenseCategories, incomeCategories, loading: categoriesLoading } = useCategories();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPayment, setSelectedPayment] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Reset category when type changes
  const handleTypeChange = (newType: "expense" | "income") => {
    setType(newType);
    setSelectedCategory(""); // Reset category when switching types
  };

  // Reset category when categories change (e.g., after adding new category)
  useEffect(() => {
    if (!categoriesLoading) {
      const currentCategories = type === "expense" ? expenseCategories : incomeCategories;
      // If selected category no longer exists, reset it
      if (selectedCategory && !currentCategories.find(cat => cat.name === selectedCategory)) {
        setSelectedCategory("");
      }
    }
  }, [expenseCategories, incomeCategories, type, categoriesLoading, selectedCategory]);

  const handleSave = async () => {
    if (!amount || !selectedCategory || !currentUser) return;
    
    setIsSaving(true);
    
    try {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        toast.error("Please enter a valid amount");
        setIsSaving(false);
        return;
      }

      // Get category name for title
      const categories = type === "expense" ? expenseCategories : incomeCategories;
      const categoryName = categories.find(cat => cat.name === selectedCategory)?.name || selectedCategory;

      const transactionData: any = {
        title: `${categoryName} ${type === "income" ? "Income" : "Expense"}`,
        category: selectedCategory, // Store category name
        amount: amountNum,
        type: type,
        date: new Date(),
      };

      // Only add optional fields if they have values (payment method only for expenses)
      if (type === "expense" && selectedPayment && selectedPayment.trim() !== "") {
        transactionData.paymentMethod = selectedPayment;
      }
      if (note && note.trim() !== "") {
        transactionData.note = note;
      }

      await addTransaction(currentUser.uid, transactionData);

      setIsSaving(false);
      setIsSaved(true);
      toast.success("Transaction added successfully!");
      
      setTimeout(() => {
        setIsSaved(false);
        onClose();
        // Reset form
        setAmount("");
        setSelectedCategory("");
        setSelectedPayment("");
        setNote("");
      }, 1000);
    } catch (error: any) {
      console.error("Error adding transaction:", error);
      toast.error("Failed to add transaction. Please try again.");
      setIsSaving(false);
    }
  };

  // Get current categories based on type, formatted for display
  const currentCategories = (type === "expense" ? expenseCategories : incomeCategories).map(cat => ({
    id: cat.name, // Use name as id for consistency
    label: cat.name,
    icon: cat.icon,
    color: cat.color,
  }));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="bottom-sheet max-h-[90vh] overflow-y-auto z-50"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 rounded-full bg-muted" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">Add Transaction</h2>
              <button 
                onClick={onClose}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
              </button>
            </div>

            {/* Type Toggle */}
            <div className="px-4 sm:px-5 mb-4 sm:mb-6">
              <div className="flex gap-2 sm:gap-3 p-1 sm:p-1.5 bg-secondary rounded-2xl">
                <button
                  onClick={() => handleTypeChange("expense")}
                  className={`flex-1 py-2.5 sm:py-3 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 font-medium transition-all text-sm sm:text-base ${
                    type === "expense"
                      ? "bg-destructive/20 text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Expense
                </button>
                <button
                  onClick={() => handleTypeChange("income")}
                  className={`flex-1 py-2.5 sm:py-3 rounded-xl flex items-center justify-center gap-1.5 sm:gap-2 font-medium transition-all text-sm sm:text-base ${
                    type === "income"
                      ? "bg-success/20 text-success"
                      : "text-muted-foreground"
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Income
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="px-4 sm:px-5 mb-4 sm:mb-6">
              <label className="text-xs sm:text-sm text-muted-foreground mb-2 block">Amount</label>
              <div className="glass-card p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl text-muted-foreground flex-shrink-0">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-transparent text-2xl sm:text-3xl font-bold flex-1 outline-none text-foreground placeholder:text-muted min-w-0"
                />
              </div>
            </div>

            {/* Category Selection */}
            <div className="px-4 sm:px-5 mb-4 sm:mb-6">
              <label className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 block">Category</label>
              {categoriesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full"
                  />
                </div>
              ) : currentCategories.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No categories available. Add categories in Settings.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {currentCategories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`category-chip text-xs sm:text-sm ${selectedCategory === category.id ? "active" : ""}`}
                      style={selectedCategory === category.id ? { 
                        backgroundColor: `${category.color}20`,
                        borderColor: category.color,
                      } : {}}
                    >
                      <span>{category.icon}</span>
                      <span>{category.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Payment Method - Only show for expenses */}
            {type === "expense" && (
              <div className="px-4 sm:px-5 mb-4 sm:mb-6">
                <label className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 block">Payment Method</label>
                <div className="flex gap-2 sm:gap-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedPayment(method.id)}
                      className={`flex-1 glass-card p-3 sm:p-4 flex flex-col items-center gap-1.5 sm:gap-2 transition-all ${
                        selectedPayment === method.id
                          ? "border-primary bg-primary/10"
                          : ""
                      }`}
                    >
                      <span className="text-xl sm:text-2xl">{method.icon}</span>
                      <span className="text-xs sm:text-sm font-medium">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Note */}
            <div className="px-4 sm:px-5 mb-4 sm:mb-6">
              <label className="text-xs sm:text-sm text-muted-foreground mb-2 block">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note..."
                className="w-full glass-card p-3 sm:p-4 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-sm sm:text-base"
              />
            </div>

            {/* Save Button */}
            <div className="px-4 sm:px-5 pb-6 sm:pb-8">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={!amount || !selectedCategory || isSaving}
                className={`w-full py-3 sm:py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all text-sm sm:text-base ${
                  isSaved
                    ? "bg-success text-success-foreground"
                    : "text-primary-foreground disabled:opacity-50"
                }`}
                style={!isSaved ? { background: "var(--gradient-primary)" } : undefined}
              >
                {isSaving ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : isSaved ? (
                  <>
                    <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                    Saved!
                  </>
                ) : (
                  "Save Transaction"
                )}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AddTransaction;
