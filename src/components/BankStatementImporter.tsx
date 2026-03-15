import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileText, 
  Upload, 
  X, 
  Search, 
  Check, 
  AlertCircle, 
  Plus, 
  ChevronRight,
  Loader2,
  Trash2,
  Save,
  Clock
} from "lucide-react";
import { analyzeBankStatement, BillData } from "@/lib/gemini-service";
import { addTransaction } from "@/lib/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

interface BankStatementImporterProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "upload" | "analyze" | "review" | "importing" | "success";

export const BankStatementImporter: React.FC<BankStatementImporterProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extractedTransactions, setExtractedTransactions] = useState<BillData[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 20 * 1024 * 1024) {
        toast.error("File is too large (max 20MB)");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleStartAnalysis = async () => {
    if (!file) return;
    setStep("analyze");
    try {
      const data = await analyzeBankStatement(file);
      setExtractedTransactions(data);
      setSelectedIndices(new Set(data.keys()));
      setStep("review");
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast.error(error.message || "Failed to analyze statement");
      setStep("upload");
    }
  };

  const handleToggleSelect = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const handleImport = async () => {
    if (!currentUser) return;
    const toImport = extractedTransactions.filter((_, i) => selectedIndices.has(i));
    if (toImport.length === 0) {
      toast.error("No transactions selected for import");
      return;
    }

    setStep("importing");
    setImportProgress({ current: 0, total: toImport.length });

    let successCount = 0;
    for (let i = 0; i < toImport.length; i++) {
      const t = toImport[i];
      try {
        await addTransaction(currentUser.uid, {
          title: t.merchant,
          amount: t.amount,
          category: t.category,
          date: new Date(t.date),
          type: (t as any).type || "expense",
          note: "Bulk imported from bank statement"
        });
        successCount++;
      } catch (error) {
        console.error("Failed to import transaction:", t, error);
      }
      setImportProgress(prev => ({ ...prev, current: i + 1 }));
    }

    toast.success(`Successfully imported ${successCount} transactions`);
    setStep("success");
  };

  const reset = () => {
    setStep("upload");
    setFile(null);
    setExtractedTransactions([]);
    setSelectedIndices(new Set());
    setImportProgress({ current: 0, total: 0 });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="glass-card-elevated w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Bank Statement Importer</h2>
              <p className="text-xs text-muted-foreground">Bulk import transactions via AI</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-secondary rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            {step === "upload" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer ${
                    file ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-secondary/50"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="application/pdf,image/*"
                    className="hidden"
                  />
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${file ? "bg-primary/20" : "bg-secondary"}`}>
                    <Upload className={`w-8 h-8 ${file ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-foreground">
                      {file ? file.name : "Click to upload bank statement"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      PDF, PNG or JPG (Max 20MB)
                    </p>
                  </div>
                </div>

                {file && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-primary/10 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-primary" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setFile(null)}
                      className="p-1.5 hover:bg-primary/20 rounded-md transition-colors"
                    >
                      <X className="w-4 h-4 text-primary" />
                    </button>
                  </motion.div>
                )}

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-primary" />
                    How it works
                  </h4>
                  <ul className="text-xs text-muted-foreground space-y-2 list-disc pl-4">
                    <li>Upload your bank statement PDF or a clear photo of it.</li>
                    <li>Gemini AI will scan the statement for transaction details.</li>
                    <li>Review and categorize the detected transactions.</li>
                    <li>Import selected transactions directly to your ledger.</li>
                  </ul>
                </div>

                <button
                  disabled={!file}
                  onClick={handleStartAnalysis}
                  className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/30"
                >
                  Confirm & Analyze
                  <ChevronRight className="w-5 h-5" />
                </button>
              </motion.div>
            )}

            {step === "analyze" && (
              <motion.div
                key="analyze"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="relative mb-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Search className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Analyzing Statement...</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Our AI is currently reading the transactions from your statement. This may take up to 20-30 seconds depending on the file size.
                </p>
              </motion.div>
            )}

            {step === "review" && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground">Extracted Transactions ({extractedTransactions.length})</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedIndices(new Set(extractedTransactions.keys()))}
                      className="text-xs text-primary font-medium hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-muted-foreground text-xs">•</span>
                    <button 
                      onClick={() => setSelectedIndices(new Set())}
                      className="text-xs text-primary font-medium hover:underline"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {extractedTransactions.map((t, i) => (
                    <div 
                      key={i}
                      onClick={() => handleToggleSelect(i)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                        selectedIndices.has(i) ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-secondary/20 grayscale opacity-60"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center ${selectedIndices.has(i) ? "bg-primary text-primary-foreground" : "border-2 border-muted-foreground/30"}`}>
                        {selectedIndices.has(i) && <Check className="w-3 h-3" />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate">{t.merchant}</p>
                          <p className={`font-bold text-sm ${(t as any).type === "income" ? "text-success" : "text-foreground"}`}>
                            {(t as any).type === "income" ? "+" : "-"}₹{t.amount.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(t.date), "MMM d, yyyy")}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground uppercase tracking-wider">
                            {t.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleImport}
                  className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/30 mt-6"
                >
                  <Save className="w-5 h-5" />
                  Import Selected ({selectedIndices.size})
                </button>
              </motion.div>
            )}

            {step === "importing" && (
              <motion.div
                key="importing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center"
              >
                <div className="w-full max-w-xs space-y-4">
                  <div className="relative w-24 h-24 mx-auto mb-8">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <circle
                        className="text-secondary stroke-current"
                        strokeWidth="8"
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                      />
                      <circle
                        className="text-primary stroke-current"
                        strokeWidth="8"
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 * (1 - importProgress.current / importProgress.total)}
                        strokeLinecap="round"
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-bold text-xl">
                      {Math.round((importProgress.current / importProgress.total) * 100)}%
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-foreground">Importing Transactions...</h3>
                  <p className="text-sm text-muted-foreground">
                    Saving {importProgress.current} of {importProgress.total} transactions to your ledger.
                  </p>
                </div>
              </motion.div>
            )}

            {step === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center space-y-6"
              >
                <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
                  <Check className="w-10 h-10 text-success" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">Import Complete!</h3>
                  <p className="text-muted-foreground">
                    Your transactions have been successfully added to your ledger.
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="w-full max-w-xs py-4 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30"
                >
                  Done
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
