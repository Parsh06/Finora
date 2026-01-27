import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Camera, 
  Upload, 
  X, 
  Check, 
  Scan, 
  FileText,
  Calendar,
  Building2,
  IndianRupee,
  Edit2,
  Sparkles,
  AlertCircle,
  Users
} from "lucide-react";
import { scanBill, BillData } from "@/lib/gemini-service";
import { useAuth } from "@/contexts/AuthContext";
import { addTransaction } from "@/lib/firestore";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface BillScannerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DetectedField {
  label: string;
  value: string;
  confidence: number;
  icon: React.ElementType;
  editable: boolean;
  fieldKey: keyof BillData | "splitBetween";
  isSplitField?: boolean;
}

const categoryLabels: Record<string, string> = {
  food: "Food",
  transport: "Transport",
  shopping: "Shopping",
  entertainment: "Entertainment",
  bills: "Bills",
  health: "Health",
  education: "Education",
  other: "Other",
};

// Editable Field Component
const EditableField = ({
  field,
  index,
  onEdit,
  splitBetween,
  onSplitChange,
  totalAmount,
}: {
  field: DetectedField;
  index: number;
  onEdit: (fieldKey: keyof BillData | "splitBetween", newValue: string) => void;
  splitBetween?: number;
  onSplitChange?: (value: number) => void;
  totalAmount?: number;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(field.value);

  const handleSave = () => {
    onEdit(field.fieldKey, editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(field.value);
    setIsEditing(false);
  };

  const getInputType = () => {
    if (field.fieldKey === "date") return "date";
    if (field.fieldKey === "amount" || field.fieldKey === "splitBetween") return "number";
    return "text";
  };

  const getInputValue = () => {
    if (field.fieldKey === "date" && field.value) {
      try {
        return format(parseISO(field.value), "yyyy-MM-dd");
      } catch {
        return field.value;
      }
    }
    if (field.fieldKey === "amount") {
      return field.value.replace(/[₹,\s]/g, "");
    }
    if (field.fieldKey === "splitBetween") {
      return splitBetween?.toString() || "1";
    }
    return editValue;
  };

  // Handle split field specially
  if (field.isSplitField && field.fieldKey === "splitBetween") {
    const splitAmount = totalAmount && splitBetween ? totalAmount / splitBetween : totalAmount || 0;
    
    return (
      <motion.div
        className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-muted/20 border border-border/50 gap-2"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.1 }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <field.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{field.label}</p>
            {isEditing ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    // Allow empty string for editing
                    if (inputValue === "") {
                      setEditValue("");
                      return;
                    }
                    // Parse the number
                    const numValue = parseInt(inputValue);
                    // Only update if it's a valid number between 1 and 100
                    if (!isNaN(numValue) && numValue > 0 && numValue <= 100) {
                      setEditValue(numValue.toString());
                    } else if (!isNaN(numValue) && numValue > 100) {
                      // If exceeds max, set to max
                      setEditValue("100");
                    }
                    // Don't update splitBetween state until blur/enter
                  }}
                  onBlur={() => {
                    // Validate and save on blur
                    const numValue = parseInt(editValue);
                    if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
                      if (onSplitChange) {
                        onSplitChange(numValue);
                      }
                      handleSave();
                    } else {
                      // If invalid, reset to current splitBetween value
                      setEditValue((splitBetween || 1).toString());
                      handleCancel();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const numValue = parseInt(editValue);
                      if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
                        if (onSplitChange) {
                          onSplitChange(numValue);
                        }
                        handleSave();
                      } else {
                        setEditValue((splitBetween || 1).toString());
                        handleCancel();
                      }
                    }
                    if (e.key === "Escape") {
                      setEditValue((splitBetween || 1).toString());
                      handleCancel();
                    }
                  }}
                  onFocus={(e) => {
                    // Select all text when focused for easier editing
                    e.target.select();
                  }}
                  className="flex-1 bg-background border border-primary/50 rounded-lg px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-0"
                  autoFocus
                  min="1"
                  max="100"
                />
                <span className="text-xs text-muted-foreground">people</span>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-foreground text-sm sm:text-base">
                  {splitBetween || 1} {splitBetween === 1 ? "person" : "people"}
                </p>
                {splitBetween && splitBetween > 1 && totalAmount && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your share: ₹{(splitAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => {
              setIsEditing(true);
              setEditValue((splitBetween || 1).toString());
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex items-center justify-between p-3 sm:p-4 rounded-xl bg-muted/20 border border-border/50 gap-2"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <field.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{field.label}</p>
          {isEditing && field.editable ? (
            <div className="flex items-center gap-1 mt-1">
              {field.fieldKey === "amount" && <span className="text-sm text-muted-foreground">₹</span>}
              {field.fieldKey === "category" ? (
                <select
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSave}
                  className="flex-1 bg-background border border-primary/50 rounded-lg px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-0"
                  autoFocus
                >
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <option key={key} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={getInputType()}
                  value={getInputValue()}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") handleCancel();
                  }}
                  className="flex-1 bg-background border border-primary/50 rounded-lg px-2 py-1 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-0"
                  autoFocus
                  step={field.fieldKey === "amount" ? "0.01" : undefined}
                  min={field.fieldKey === "amount" ? "0.01" : undefined}
                />
              )}
            </div>
          ) : (
            <p className="font-semibold text-foreground text-sm sm:text-base truncate">{field.value}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <span className="text-xs text-muted-foreground">{field.confidence}%</span>
        {field.editable && !isEditing && (
          <button
            onClick={() => {
              setIsEditing(true);
              setEditValue(field.value);
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted/30 flex items-center justify-center hover:bg-muted/50 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

// Editable Fields List Component
const EditableFieldsList = ({
  fields,
  onFieldEdit,
  splitBetween,
  onSplitChange,
  totalAmount,
}: {
  fields: DetectedField[];
  onFieldEdit: (fieldKey: keyof BillData | "splitBetween", newValue: string) => void;
  splitBetween?: number;
  onSplitChange?: (value: number) => void;
  totalAmount?: number;
}) => {
  return (
    <div className="space-y-2 sm:space-y-3">
      {fields.map((field, index) => (
        <EditableField 
          key={field.label} 
          field={field} 
          index={index} 
          onEdit={onFieldEdit}
          splitBetween={splitBetween}
          onSplitChange={onSplitChange}
          totalAmount={totalAmount}
        />
      ))}
    </div>
  );
};

export const BillScanner = ({ isOpen, onClose }: BillScannerProps) => {
  const { currentUser } = useAuth();
  const [stage, setStage] = useState<"upload" | "scanning" | "preview" | "confirm">("upload");
  const [scanProgress, setScanProgress] = useState(0);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [splitBetween, setSplitBetween] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Cleanup preview image URL on unmount or when modal closes
  useEffect(() => {
    return () => {
      if (previewImage) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Clean up preview image
      if (previewImage) {
        URL.revokeObjectURL(previewImage);
        setPreviewImage(null);
      }
      setStage("upload");
      setScanProgress(0);
      setBillData(null);
      setDetectedFields([]);
      setError("");
      setIsProcessing(false);
      setSplitBetween(1);
    }
  }, [isOpen, previewImage]);

  const handleFileSelect = async (file: File) => {
    if (!file) {
      toast.error("No file selected");
      return;
    }

    // Validate file type - check both MIME type and file extension
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const validExtensions = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
    
    const isValidType = validTypes.includes(file.type) || (fileExtension && validExtensions.includes(fileExtension));
    
    if (!isValidType) {
      toast.error("Please select a valid image file (JPEG, PNG, WEBP, HEIC, HEIF)");
      return;
    }

    // Validate file size (max 20MB for inline image data)
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Image size should be less than 20MB. Please compress the image or use a smaller file.");
      return;
    }

    // Check if file is empty
    if (file.size === 0) {
      toast.error("Selected file is empty. Please choose a valid image.");
      return;
    }

    // Create preview URL for the image
    const imageUrl = URL.createObjectURL(file);
    setPreviewImage(imageUrl);

    setStage("scanning");
    setScanProgress(0);
    setError("");
    setIsProcessing(true);

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Simulate progress for better UX
      progressInterval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 90) {
            if (progressInterval) {
              clearInterval(progressInterval);
            }
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      // Call Gemini API for OCR and data extraction
      const extractedData = await scanBill(file);
      
      // Clear progress interval
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setScanProgress(100);

      // Validate extracted data
      if (!extractedData || extractedData.amount <= 0) {
        throw new Error("Could not extract valid bill data. Please ensure the image shows a clear bill with visible amount.");
      }

      // Reset split to 1 for new scan
      setSplitBetween(1);

      // Format detected fields for display
      const fields: DetectedField[] = [
        {
          label: "Total Amount",
          value: `₹${extractedData.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          confidence: extractedData.confidence,
          icon: IndianRupee,
          editable: true,
          fieldKey: "amount",
        },
        {
          label: "Date",
          value: (() => {
            try {
              return format(parseISO(extractedData.date), "MMM d, yyyy");
            } catch {
              return extractedData.date;
            }
          })(),
          confidence: Math.max(extractedData.confidence - 5, 50),
          icon: Calendar,
          editable: true,
          fieldKey: "date",
        },
        {
          label: "Merchant",
          value: extractedData.merchant || "Unknown Merchant",
          confidence: Math.max(extractedData.confidence - 10, 50),
          icon: Building2,
          editable: true,
          fieldKey: "merchant",
        },
        {
          label: "Category",
          value: categoryLabels[extractedData.category] || extractedData.category || "Other",
          confidence: Math.max(extractedData.confidence - 15, 50),
          icon: FileText,
          editable: true,
          fieldKey: "category",
        },
        {
          label: "Split Between",
          value: "1 person",
          confidence: 100,
          icon: Users,
          editable: true,
          fieldKey: "splitBetween",
          isSplitField: true,
        },
      ];

      setBillData(extractedData);
      setDetectedFields(fields);
      
      // Show success message
      toast.success("Bill scanned successfully! Review the details below.");
      
      setTimeout(() => {
        setStage("preview");
        setIsProcessing(false);
      }, 500);
    } catch (error: any) {
      // Clear progress interval on error
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      const errorMessage = error.message || "Failed to scan bill. Please try again with a clearer image.";
      setError(errorMessage);
      setIsProcessing(false);
      setStage("upload");
      toast.error(errorMessage);
      
      console.error("Bill scanning error:", error);
    }
  };

  const handleCameraClick = () => {
    // Reset the input first to ensure it triggers change event even if same file is selected
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
      cameraInputRef.current.click();
    }
  };

  const handleUploadClick = () => {
    // Reset the input first to ensure it triggers change event even if same file is selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
    // Reset input so same file can be selected again
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileSelect(file);
    }
    // Reset input so same file can be selected again
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleSplitChange = (value: number) => {
    if (value >= 1 && value <= 100) {
      setSplitBetween(value);
      // Update the split field display
      const updatedFields = detectedFields.map(field => {
        if (field.fieldKey === "splitBetween") {
          return {
            ...field,
            value: `${value} ${value === 1 ? "person" : "people"}`,
          };
        }
        return field;
      });
      setDetectedFields(updatedFields);
    }
  };

  const handleFieldEdit = (fieldKey: keyof BillData | "splitBetween", newValue: string) => {
    if (!billData) return;

    // Handle split field separately
    if (fieldKey === "splitBetween") {
      const splitValue = parseInt(newValue) || 1;
      if (splitValue >= 1 && splitValue <= 100) {
        handleSplitChange(splitValue);
      }
      return;
    }

    const updatedBillData = { ...billData };
    
    if (fieldKey === "amount") {
      const numValue = parseFloat(newValue.replace(/[₹,\s]/g, ""));
      if (!isNaN(numValue) && numValue > 0) {
        updatedBillData.amount = numValue;
      } else {
        toast.error("Please enter a valid amount");
        return;
      }
    } else if (fieldKey === "date") {
      // Handle date input (YYYY-MM-DD format from date input)
      try {
        let dateStr = newValue;
        // If it's already in ISO format, use it; otherwise try to parse
        if (!dateStr.includes("-") || dateStr.length !== 10) {
          const parsedDate = parseISO(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            dateStr = format(parsedDate, "yyyy-MM-dd");
          } else {
            toast.error("Please enter a valid date");
            return;
          }
        }
        updatedBillData.date = dateStr;
      } catch {
        toast.error("Please enter a valid date");
        return;
      }
    } else if (fieldKey === "merchant") {
      if (newValue.trim()) {
        updatedBillData.merchant = newValue.trim();
      } else {
        toast.error("Merchant name cannot be empty");
        return;
      }
    } else if (fieldKey === "category") {
      // Find category by label
      const categoryKey = Object.entries(categoryLabels).find(
        ([_, label]) => label.toLowerCase() === newValue.toLowerCase()
      )?.[0] || newValue.toLowerCase();
      
      // Validate category exists
      if (categoryLabels[categoryKey] || categoryKey === "other") {
        updatedBillData.category = categoryKey;
      } else {
        toast.error("Please select a valid category");
        return;
      }
    }

    setBillData(updatedBillData);

    // Update detected fields display
    const updatedFields = detectedFields.map(field => {
      if (field.fieldKey === fieldKey) {
        if (fieldKey === "amount") {
          return {
            ...field,
            value: `₹${updatedBillData.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          };
        } else if (fieldKey === "date") {
          try {
            return {
              ...field,
              value: format(parseISO(updatedBillData.date), "MMM d, yyyy"),
            };
          } catch {
            return { ...field, value: updatedBillData.date };
          }
        } else if (fieldKey === "category") {
          return {
            ...field,
            value: categoryLabels[updatedBillData.category] || updatedBillData.category,
          };
        }
        return { ...field, value: newValue };
      }
      return field;
    });

    setDetectedFields(updatedFields);
    toast.success(`${fieldKey === "amount" ? "Amount" : fieldKey === "date" ? "Date" : fieldKey === "merchant" ? "Merchant" : "Category"} updated`);
  };

  const handleConfirm = async () => {
    if (!currentUser) {
      toast.error("Please sign in to add transactions");
      return;
    }

    if (!billData) {
      toast.error("No bill data available. Please scan a bill first.");
      return;
    }

    // Validate amount
    if (!billData.amount || billData.amount <= 0 || isNaN(billData.amount)) {
      toast.error("Invalid amount. Please check the bill amount.");
      return;
    }

    // Validate split
    if (!splitBetween || splitBetween < 1 || splitBetween > 100) {
      toast.error("Invalid split value. Please enter a number between 1 and 100.");
      return;
    }

    setIsProcessing(true);
    setStage("confirm");

    try {
      // Parse date - use bill date if recent, otherwise use today's date
      // For expense tracking, we use the date when the expense is recorded (today)
      // unless the bill date is recent (within last 30 days)
      let transactionDate: Date;
      try {
        const billDate = parseISO(billData.date);
        if (isNaN(billDate.getTime())) {
          console.warn("Invalid date parsed, using current date");
          transactionDate = new Date();
        } else {
          const now = new Date();
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          // Check if date is too far in the future (more than 1 year)
          const oneYearFromNow = new Date();
          oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
          
          if (billDate > oneYearFromNow) {
            console.warn("Date is too far in the future, using current date");
            transactionDate = new Date();
          } else if (billDate < thirtyDaysAgo) {
            // If bill date is more than 30 days old, use today's date
            // This ensures the transaction appears in recent transactions
            console.warn("Bill date is too old, using current date for transaction");
            transactionDate = new Date();
          } else {
            // Use bill date if it's within the last 30 days
            transactionDate = billDate;
          }
        }
      } catch (error) {
        console.warn("Date parsing error, using current date:", error);
        transactionDate = new Date();
      }

      // Ensure date is set to start of day for consistency
      transactionDate.setHours(0, 0, 0, 0);

      // Calculate split amount
      const splitAmount = splitBetween > 1 ? billData.amount / splitBetween : billData.amount;
      
      // Validate split amount
      if (isNaN(splitAmount) || splitAmount <= 0) {
        throw new Error("Invalid split amount calculated");
      }

      // Round to 2 decimal places
      const roundedAmount = Math.round(splitAmount * 100) / 100;
      
      // Create transaction with split amount
      const transactionData: any = {
        title: `${billData.merchant || "Bill"} Expense${splitBetween > 1 ? ` (Split ${splitBetween} ways)` : ""}`,
        category: billData.category || "other",
        amount: roundedAmount,
        type: "expense" as const,
        date: transactionDate,
      };

      // Add optional fields
      if (billData.paymentMethod && billData.paymentMethod.trim()) {
        transactionData.paymentMethod = billData.paymentMethod.trim();
      }

      // Build note with items and original bill date if different from transaction date
      const noteParts: string[] = [];
      if (billData.items && billData.items.length > 0) {
        noteParts.push(`Items: ${billData.items.slice(0, 3).join(", ")}`);
      }
      // Add original bill date if it's different from transaction date
      const originalBillDate = parseISO(billData.date);
      if (!isNaN(originalBillDate.getTime()) && originalBillDate.toDateString() !== transactionDate.toDateString()) {
        noteParts.push(`Bill Date: ${format(originalBillDate, "MMM d, yyyy")}`);
      }
      if (noteParts.length > 0) {
        transactionData.note = noteParts.join(" | ");
      }

      console.log("Preparing to add transaction:", {
        transactionData,
        userId: currentUser.uid,
        date: transactionDate,
        dateISO: transactionDate.toISOString(),
      });

      // Add transaction to Firestore
      let transactionId: string;
      try {
        transactionId = await addTransaction(currentUser.uid, transactionData);
        
        console.log("✅ Transaction added successfully!");
        console.log("Transaction ID:", transactionId);
        console.log("Transaction details:", {
          id: transactionId,
          title: transactionData.title,
          amount: transactionData.amount,
          category: transactionData.category,
          type: transactionData.type,
          date: transactionDate.toISOString(),
          paymentMethod: transactionData.paymentMethod,
          note: transactionData.note,
        });

        // Verify transaction was saved by checking if we got an ID
        if (!transactionId || transactionId.trim() === "") {
          throw new Error("Transaction ID is empty - transaction may not have been saved");
        }

        const successMessage = splitBetween > 1
          ? `Expense of ₹${roundedAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} added successfully! (Split ${splitBetween} ways from ₹${billData.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
          : `Expense of ₹${billData.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} added successfully!`;
        
        toast.success(successMessage);

        // Wait a bit to show success message, then close
        setTimeout(() => {
          resetAndClose();
          setIsProcessing(false);
        }, 1500);
      } catch (saveError: any) {
        // Re-throw to be caught by outer catch block
        console.error("Failed to save transaction:", saveError);
        throw saveError;
      }
    } catch (error: any) {
      console.error("❌ Error adding transaction:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
        name: error.name,
      });
      
      // Provide more specific error messages
      let errorMessage = "Failed to add transaction. Please try again.";
      if (error.code === "permission-denied") {
        errorMessage = "Permission denied. Please check your Firestore security rules.";
      } else if (error.code === "unavailable") {
        errorMessage = "Service temporarily unavailable. Please check your internet connection.";
      } else if (error.code === "invalid-argument") {
        errorMessage = `Invalid data: ${error.message}`;
      } else if (error.message) {
        errorMessage = error.message.includes("required") || error.message.includes("Invalid")
          ? error.message
          : `Error: ${error.message}`;
      }
      
      toast.error(errorMessage, {
        duration: 5000,
        description: "Please check the console for more details.",
      });
      setIsProcessing(false);
      setStage("preview");
    }
  };

  const resetAndClose = () => {
    // Clean up preview image URL
    if (previewImage) {
      URL.revokeObjectURL(previewImage);
      setPreviewImage(null);
    }
    onClose();
    setStage("upload");
    setScanProgress(0);
    setBillData(null);
    setDetectedFields([]);
    setError("");
    setSplitBetween(1);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={resetAndClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-lg bg-card rounded-t-3xl overflow-hidden max-h-[90vh]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border/50">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Scan className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-foreground">Scan Bill</h2>
                  <p className="text-xs text-muted-foreground">Auto-detect expense details</p>
                </div>
              </div>
              <button
                onClick={resetAndClose}
                className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <AnimatePresence mode="wait">
                {/* Upload Stage */}
                {stage === "upload" && (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-4"
                  >
                    {/* Hidden file inputs */}
                    {/* Camera input - uses capture="environment" for rear camera on mobile */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                      capture="environment"
                      onChange={handleCameraChange}
                      className="hidden"
                      id="camera-input"
                    />
                    {/* File upload input - for selecting from gallery */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-input"
                    />

                    {/* Camera Option */}
                    <button
                      onClick={handleCameraClick}
                      disabled={isProcessing}
                      className="w-full p-4 sm:p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex flex-col items-center gap-2 sm:gap-3">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Camera className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-foreground text-sm sm:text-base">Take Photo</p>
                          <p className="text-xs sm:text-sm text-muted-foreground">Capture bill with camera</p>
                        </div>
                      </div>
                    </button>

                    {/* Upload Option */}
                    <button
                      onClick={handleUploadClick}
                      disabled={isProcessing}
                      className="w-full p-4 sm:p-6 rounded-2xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex flex-col items-center gap-2 sm:gap-3">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-muted/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Upload className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                          <p className="font-medium text-foreground text-sm sm:text-base">Upload Image</p>
                          <p className="text-xs sm:text-sm text-muted-foreground">Select from gallery</p>
                        </div>
                      </div>
                    </button>

                    {/* AI Info */}
                    <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-accent/10 border border-accent/20">
                      <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-accent flex-shrink-0 mt-0.5" />
                      <p className="text-xs sm:text-sm text-accent">
                        AI automatically detects amount, date, and merchant from your bills
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Scanning Stage */}
                {stage === "scanning" && (
                  <motion.div
                    key="scanning"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="py-8"
                  >
                    <div className="flex flex-col items-center gap-4 sm:gap-6">
                      {/* Preview Image */}
                      {previewImage && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-full max-w-xs rounded-xl overflow-hidden border-2 border-primary/20 shadow-lg"
                        >
                          <img
                            src={previewImage}
                            alt="Bill preview"
                            className="w-full h-auto object-contain max-h-48"
                          />
                        </motion.div>
                      )}

                      {/* Scanning Animation */}
                      <div className="relative w-24 h-24 sm:w-32 sm:h-32">
                        <motion.div
                          className="absolute inset-0 rounded-2xl border-2 border-primary/30"
                          animate={{ 
                            boxShadow: ["0 0 20px rgba(59, 130, 246, 0.3)", "0 0 40px rgba(59, 130, 246, 0.5)", "0 0 20px rgba(59, 130, 246, 0.3)"]
                          }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                        <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                          <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
                        </div>
                        <motion.div
                          className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
                          animate={{ top: ["10%", "90%", "10%"] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        />
                      </div>

                      {/* Progress */}
                      <div className="w-full max-w-xs">
                        <div className="flex justify-between text-xs sm:text-sm mb-2">
                          <span className="text-muted-foreground">Scanning document...</span>
                          <span className="text-primary font-medium">{scanProgress}%</span>
                        </div>
                        <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${scanProgress}%` }}
                          />
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-muted-foreground text-center px-4">
                        AI is extracting bill details...
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Preview Stage */}
                {stage === "preview" && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-4"
                  >
                    {/* Success Badge */}
                    <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <Check className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">Bill scanned successfully!</span>
                    </div>

                    {/* Error Message */}
                    {error && (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                        <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                        <p className="text-xs sm:text-sm text-destructive">{error}</p>
                      </div>
                    )}

                    {/* Detected Fields */}
                    <EditableFieldsList
                      fields={detectedFields}
                      onFieldEdit={handleFieldEdit}
                      splitBetween={splitBetween}
                      onSplitChange={handleSplitChange}
                      totalAmount={billData?.amount}
                    />

                    {/* Action Buttons */}
                    <div className="flex gap-2 sm:gap-3 pt-3 sm:pt-4">
                      <button
                        onClick={() => {
                          // Clean up preview image
                          if (previewImage) {
                            URL.revokeObjectURL(previewImage);
                            setPreviewImage(null);
                          }
                          setStage("upload");
                          setBillData(null);
                          setDetectedFields([]);
                          setError("");
                        }}
                        disabled={isProcessing}
                        className="flex-1 py-3 sm:py-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors font-medium text-foreground text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Rescan
                      </button>
                      <button
                        onClick={handleConfirm}
                        disabled={!billData || isProcessing || billData.amount <= 0 || splitBetween < 1}
                        className="flex-1 py-3 sm:py-4 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold shadow-lg shadow-primary/25 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing 
                          ? "Adding..." 
                          : splitBetween > 1 
                            ? `Add ₹${((billData?.amount || 0) / splitBetween).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "Add Expense"
                        }
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Confirm Stage */}
                {stage === "confirm" && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="py-8 sm:py-12 flex flex-col items-center gap-3 sm:gap-4"
                  >
                    <motion.div
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500/20 flex items-center justify-center"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", damping: 10, stiffness: 200 }}
                    >
                      <Check className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-400" />
                    </motion.div>
                    <div className="text-center px-4">
                      <h3 className="text-lg sm:text-xl font-semibold text-foreground">Expense Added!</h3>
                      {billData && (
                        <p className="text-sm sm:text-base text-muted-foreground mt-1">
                          ₹{billData.amount.toLocaleString()} added to {categoryLabels[billData.category] || billData.category}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
