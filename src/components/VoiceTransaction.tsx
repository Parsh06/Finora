import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mic, 
  X, 
  Check, 
  Edit2,
  AlertCircle,
  IndianRupee,
  Calendar,
  Building2,
  FileText,
  CreditCard,
  Loader2
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { addTransaction } from "@/lib/firestore";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface VoiceTransactionProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExtractedTransaction {
  type: "expense" | "income";
  amount: number;
  category: string;
  description: string;
  paymentMethod?: string;
  date: string; // ISO date string
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
  salary: "Salary",
  freelance: "Freelance",
  business: "Business",
  investment: "Investment",
  gift: "Gift",
  refund: "Refund",
  bonus: "Bonus",
};

// Map category labels back to keys
const categoryKeys: Record<string, string> = {
  "Food": "food",
  "Transport": "transport",
  "Shopping": "shopping",
  "Entertainment": "entertainment",
  "Bills": "bills",
  "Health": "health",
  "Education": "education",
  "Other": "other",
  "Salary": "salary",
  "Freelance": "freelance",
  "Business": "business",
  "Investment": "investment",
  "Gift": "gift",
  "Refund": "refund",
  "Bonus": "bonus",
};

export const VoiceTransaction = ({ isOpen, onClose }: VoiceTransactionProps) => {
  const { currentUser } = useAuth();
  const [stage, setStage] = useState<"idle" | "listening" | "processing" | "confirm">("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [extractedData, setExtractedData] = useState<ExtractedTransaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!isOpen) return;

    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in your browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN"; // Indian English

    recognition.onresult = (event) => {
      const transcriptText = event.results[0][0].transcript;
      setTranscript(transcriptText);
      handleTranscript(transcriptText);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setPermissionDenied(true);
        setError("Microphone permission denied. Please enable it in your browser settings.");
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsRecording(false);
      setStage("idle");
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (stage === "listening") {
        setStage("idle");
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isOpen, stage]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStage("idle");
      setTranscript("");
      setExtractedData(null);
      setError("");
      setIsRecording(false);
      setPermissionDenied(false);
    }
  }, [isOpen]);

  const handleTranscript = async (text: string) => {
    setStage("processing");
    setIsProcessing(true);
    setError("");

    try {
      // Normalize the transcript
      const normalizedText = normalizeTranscript(text);
      
      // Extract transaction data using AI
      const extracted = await extractTransactionData(normalizedText);
      
      setExtractedData(extracted);
      setStage("confirm");
      setIsProcessing(false);
    } catch (error: any) {
      console.error("Error extracting transaction:", error);
      setError(error.message || "Failed to understand your transaction. Please try again.");
      setIsProcessing(false);
      setStage("idle");
      toast.error("Could not understand transaction. Please try speaking again.");
    }
  };

  const normalizeTranscript = (text: string): string => {
    // Normalize currency mentions
    let normalized = text
      .toLowerCase()
      .replace(/rupees?/gi, "rs")
      .replace(/₹/g, "rs")
      .replace(/rs\s*(\d+)/gi, "rs $1")
      .replace(/(\d+)\s*rupees?/gi, "rs $1");

    // Normalize common words
    normalized = normalized
      .replace(/paid for/gi, "paid")
      .replace(/bought/gi, "purchased")
      .replace(/spent on/gi, "spent");

    return normalized.trim();
  };

  const extractTransactionData = async (text: string): Promise<ExtractedTransaction> => {
    const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_GENAI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      throw new Error("Gemini API key is not configured.");
    }

    const prompt = `You are a finance assistant AI. Analyze the user's spoken sentence and extract structured transaction data.

User said: "${text}"

Extract the following information:
1. Type: "expense" or "income" (default to expense unless clearly income)
2. Amount: numeric value only (extract from "rs X", "X rupees", "₹X", etc.)
3. Category: one of: food, transport, shopping, entertainment, bills, health, education, other, salary, freelance, business, investment, gift, refund, bonus
4. Description: brief description of the transaction
5. Payment Method: "cash", "card", "upi", "online", or null if not mentioned
6. Date: use today's date in YYYY-MM-DD format: ${new Date().toISOString().split("T")[0]}

Rules:
- If amount not found, throw error
- If multiple amounts mentioned, use the most relevant one
- Category should match common expense/income types
- Description should be concise (max 50 chars)
- Default to expense if unclear

Return ONLY valid JSON in this format:
{
  "type": "expense" | "income",
  "amount": number,
  "category": string,
  "description": string,
  "paymentMethod": string | null,
  "date": "YYYY-MM-DD"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            topK: 32,
            topP: 1,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`AI analysis failed: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error("No response from AI");
    }

    // Parse JSON response
    let parsed: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText);
      throw new Error("Failed to parse transaction data");
    }

    // Validate extracted data
    if (!parsed.amount || parsed.amount <= 0) {
      throw new Error("Could not extract a valid amount. Please mention the amount clearly.");
    }

    if (!parsed.category) {
      parsed.category = "other";
    }

    if (!parsed.description) {
      parsed.description = "Voice transaction";
    }

    return {
      type: parsed.type || "expense",
      amount: Number(parsed.amount),
      category: parsed.category.toLowerCase(),
      description: parsed.description,
      paymentMethod: parsed.paymentMethod || undefined,
      date: parsed.date || new Date().toISOString().split("T")[0],
    };
  };

  const startListening = () => {
    if (!recognitionRef.current) {
      setError("Speech recognition not available");
      return;
    }

    setError("");
    setTranscript("");
    setExtractedData(null);
    setStage("listening");
    setIsRecording(true);

    try {
      recognitionRef.current.start();
    } catch (error: any) {
      console.error("Error starting recognition:", error);
      if (error.message?.includes("already started")) {
        recognitionRef.current.stop();
        setTimeout(() => {
          recognitionRef.current?.start();
        }, 100);
      } else {
        setError("Failed to start listening. Please try again.");
        setIsRecording(false);
        setStage("idle");
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFieldEdit = (field: keyof ExtractedTransaction, value: any) => {
    if (!extractedData) return;

    const updated = { ...extractedData };
    
    if (field === "amount") {
      updated.amount = Number(value) || 0;
    } else if (field === "type") {
      updated.type = value as "expense" | "income";
    } else if (field === "category") {
      updated.category = categoryKeys[value] || value.toLowerCase();
    } else if (field === "description") {
      updated.description = value;
    } else if (field === "paymentMethod") {
      updated.paymentMethod = value || undefined;
    } else if (field === "date") {
      updated.date = value;
    }

    setExtractedData(updated);
  };

  const handleConfirm = async () => {
    if (!currentUser || !extractedData) {
      toast.error("Please sign in to add transactions");
      return;
    }

    if (extractedData.amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);

    try {
      const transactionDate = parseISO(extractedData.date);
      if (isNaN(transactionDate.getTime())) {
        transactionDate.setTime(Date.now());
      }
      transactionDate.setHours(0, 0, 0, 0);

      const transactionData: any = {
        title: extractedData.description,
        category: extractedData.category,
        amount: extractedData.amount,
        type: extractedData.type,
        date: transactionDate,
        note: "Added via voice",
      };

      if (extractedData.paymentMethod) {
        transactionData.paymentMethod = extractedData.paymentMethod;
      }

      await addTransaction(currentUser.uid, transactionData);

      toast.success(
        `${extractedData.type === "income" ? "Income" : "Expense"} of ₹${extractedData.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} added successfully!`
      );

      setTimeout(() => {
        resetAndClose();
        setIsProcessing(false);
      }, 1500);
    } catch (error: any) {
      console.error("Error adding transaction:", error);
      toast.error("Failed to add transaction. Please try again.");
      setIsProcessing(false);
    }
  };

  const resetAndClose = () => {
    stopListening();
    onClose();
    setStage("idle");
    setTranscript("");
    setExtractedData(null);
    setError("");
    setIsProcessing(false);
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
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-success/20 flex items-center justify-center flex-shrink-0">
                  <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-foreground">Voice Transaction</h2>
                  <p className="text-xs text-muted-foreground">Speak your transaction</p>
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
                {/* Idle/Listening Stage */}
                {(stage === "idle" || stage === "listening") && (
                  <motion.div
                    key="listening"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="py-8"
                  >
                    <div className="flex flex-col items-center gap-4 sm:gap-6">
                      {/* Microphone Animation */}
                      <div className="relative w-32 h-32 sm:w-40 sm:h-40">
                        <motion.div
                          className="absolute inset-0 rounded-full border-4 border-success/30"
                          animate={isRecording ? {
                            scale: [1, 1.2, 1],
                            opacity: [0.5, 0.8, 0.5],
                          } : {}}
                          transition={{ duration: 1.5, repeat: isRecording ? Infinity : 0 }}
                        />
                        <div className="absolute inset-4 rounded-full bg-success/20 flex items-center justify-center">
                          <Mic className={`w-16 h-16 sm:w-20 sm:h-20 text-success ${isRecording ? "animate-pulse" : ""}`} />
                        </div>
                      </div>

                      {/* Status Text */}
                      <div className="text-center">
                        <p className="text-lg sm:text-xl font-semibold text-foreground mb-2">
                          {isRecording ? "Listening..." : "Tap to speak"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {isRecording 
                            ? "Speak your transaction clearly"
                            : "Say something like 'I paid 500 rupees for lunch'"
                          }
                        </p>
                      </div>

                      {/* Transcript Preview */}
                      {transcript && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="w-full p-4 rounded-xl bg-muted/20 border border-border/50"
                        >
                          <p className="text-sm text-muted-foreground mb-1">You said:</p>
                          <p className="text-base font-medium text-foreground">{transcript}</p>
                        </motion.div>
                      )}

                      {/* Error Message */}
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 w-full"
                        >
                          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                          <p className="text-xs sm:text-sm text-destructive flex-1">{error}</p>
                        </motion.div>
                      )}

                      {/* Permission Denied Message */}
                      {permissionDenied && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="w-full p-4 rounded-xl bg-warning/10 border border-warning/20"
                        >
                          <p className="text-sm text-warning font-medium mb-2">Microphone Permission Required</p>
                          <p className="text-xs text-muted-foreground">
                            Please enable microphone access in your browser settings to use voice transactions.
                          </p>
                        </motion.div>
                      )}

                      {/* Action Button */}
                      <button
                        onClick={isRecording ? stopListening : startListening}
                        disabled={isProcessing || permissionDenied}
                        className={`w-full py-4 sm:py-5 rounded-xl font-semibold text-lg transition-all ${
                          isRecording
                            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            : "bg-success text-success-foreground hover:bg-success/90"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {isRecording ? "Stop Recording" : "Start Recording"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Processing Stage */}
                {stage === "processing" && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="py-12"
                  >
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="w-12 h-12 text-primary animate-spin" />
                      <p className="text-lg font-medium text-foreground">Understanding your transaction...</p>
                      <p className="text-sm text-muted-foreground">This may take a few seconds</p>
                    </div>
                  </motion.div>
                )}

                {/* Confirmation Stage */}
                {stage === "confirm" && extractedData && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-4"
                  >
                    {/* Success Badge */}
                    <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <Check className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">We understood this from your voice</span>
                    </div>

                    {/* Transaction Fields */}
                    <div className="space-y-3">
                      {/* Amount */}
                      <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Amount</p>
                        <div className="flex items-center gap-2">
                          <IndianRupee className="w-5 h-5 text-primary" />
                          <input
                            type="number"
                            value={extractedData.amount}
                            onChange={(e) => handleFieldEdit("amount", e.target.value)}
                            className="flex-1 bg-background border border-primary/50 rounded-lg px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50"
                            min="0.01"
                            step="0.01"
                          />
                        </div>
                      </div>

                      {/* Type */}
                      <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-2">Type</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFieldEdit("type", "expense")}
                            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                              extractedData.type === "expense"
                                ? "bg-destructive text-destructive-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            Expense
                          </button>
                          <button
                            onClick={() => handleFieldEdit("type", "income")}
                            className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                              extractedData.type === "income"
                                ? "bg-success text-success-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            Income
                          </button>
                        </div>
                      </div>

                      {/* Category */}
                      <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-2">Category</p>
                        <select
                          value={categoryLabels[extractedData.category] || extractedData.category}
                          onChange={(e) => handleFieldEdit("category", e.target.value)}
                          className="w-full bg-background border border-primary/50 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                        >
                          {Object.entries(categoryLabels).map(([key, label]) => (
                            <option key={key} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Description */}
                      <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Description</p>
                        <input
                          type="text"
                          value={extractedData.description}
                          onChange={(e) => handleFieldEdit("description", e.target.value)}
                          className="w-full bg-background border border-primary/50 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                          placeholder="Transaction description"
                        />
                      </div>

                      {/* Payment Method */}
                      {extractedData.paymentMethod && (
                        <div className="p-4 rounded-xl bg-muted/20 border border-border/50">
                          <p className="text-xs text-muted-foreground mb-2">Payment Method</p>
                          <select
                            value={extractedData.paymentMethod}
                            onChange={(e) => handleFieldEdit("paymentMethod", e.target.value)}
                            className="w-full bg-background border border-primary/50 rounded-lg px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                            <option value="upi">UPI</option>
                            <option value="online">Online</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => {
                          setStage("idle");
                          setExtractedData(null);
                          setTranscript("");
                        }}
                        disabled={isProcessing}
                        className="flex-1 py-3 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors font-medium disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirm}
                        disabled={isProcessing || extractedData.amount <= 0}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? "Adding..." : "Add Transaction"}
                      </button>
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

