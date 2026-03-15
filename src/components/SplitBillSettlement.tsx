import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  QrCode, 
  X, 
  Check, 
  Copy, 
  ExternalLink, 
  Wallet,
  ArrowRight,
  User,
  Info,
  Smartphone
} from "lucide-react";
import { toast } from "sonner";

interface SplitBillSettlementProps {
  isOpen: boolean;
  onClose: () => void;
  debt: {
    from: string;
    to: string;
    amount: number;
    groupId: string;
  };
  onSettle: (from: string, to: string, amount: number) => Promise<void>;
}

export const SplitBillSettlement: React.FC<SplitBillSettlementProps> = ({ isOpen, onClose, debt, onSettle }) => {
  const [upiId, setUpiId] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Load saved UPI ID for the person who is owed money if possible
  useEffect(() => {
    if (debt.to) {
      const savedUpi = localStorage.getItem(`upi_${debt.to.toLowerCase()}`);
      if (savedUpi) setUpiId(savedUpi);
    }
  }, [debt.to]);

  const saveUpi = (id: string) => {
    setUpiId(id);
    if (id.includes("@")) {
      localStorage.setItem(`upi_${debt.to.toLowerCase()}`, id);
    }
  };

  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(debt.to)}&am=${debt.amount}&cu=INR&tn=${encodeURIComponent(`Settling debt in ${debt.groupId}`)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(upiUrl);
    toast.success("UPI link copied to clipboard");
  };

  const handleConfirmSettlement = async () => {
    setIsSettling(true);
    try {
      await onSettle(debt.from, debt.to, debt.amount);
      toast.success("Debt marked as settled!");
      onClose();
    } catch (error) {
      toast.error("Failed to settle debt");
    } finally {
      setIsSettling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="glass-card-elevated w-full max-w-md overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold">Settle Up</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Debt Summary */}
          <div className="bg-secondary/30 p-4 rounded-2xl border border-border flex items-center justify-between">
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-bold text-xs uppercase">
                {debt.from.substring(0, 2)}
              </div>
              <span className="text-[10px] text-muted-foreground">{debt.from}</span>
            </div>
            
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl font-bold text-primary">₹{debt.amount.toLocaleString()}</span>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <ArrowRight className="w-3 h-3" />
                <span>owes</span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs uppercase">
                {debt.to.substring(0, 2)}
              </div>
              <span className="text-[10px] text-muted-foreground">{debt.to}</span>
            </div>
          </div>

          {!showQr ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-2">
                  Recipient's UPI ID (to generate QR)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => saveUpi(e.target.value)}
                    placeholder="example@upi"
                    className="w-full bg-secondary p-3 rounded-xl outline-none border border-transparent focus:border-primary/50 transition-all font-mono text-sm"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Smartphone className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Optional: Only needed if you want to pay via QR/Link now.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  disabled={!upiId.includes("@")}
                  onClick={() => setShowQr(true)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:grayscale"
                >
                  <QrCode className="w-6 h-6 text-primary" />
                  <span className="text-xs font-semibold">Generate QR</span>
                </button>
                <button
                  onClick={handleConfirmSettlement}
                  disabled={isSettling}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-success/20 bg-success/5 hover:bg-success/10 transition-colors"
                >
                  <Check className="w-6 h-6 text-success" />
                  <span className="text-xs font-semibold">Mark as Paid</span>
                </button>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6"
            >
              <div className="p-4 bg-white rounded-2xl shadow-xl">
                <img src={qrUrl} alt="UPI QR Code" className="w-48 h-48" />
              </div>

              <div className="flex gap-2 w-full">
                <button
                  onClick={handleCopy}
                  className="flex-1 py-3 px-4 rounded-xl border border-border flex items-center justify-center gap-2 text-sm font-medium hover:bg-secondary transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Link
                </button>
                <a
                  href={upiUrl}
                  className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-primary/30"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open App
                </a>
              </div>

              <div className="bg-success/10 p-4 rounded-xl border border-success/20 w-full text-center">
                <p className="text-xs text-success-foreground font-medium mb-3">
                  Once you've made the payment, click below to update the group balance.
                </p>
                <button
                  onClick={handleConfirmSettlement}
                  disabled={isSettling}
                  className="w-full py-2 bg-success text-success-foreground rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                >
                  {isSettling ? "Settling..." : "Paid & Confirm Settlement"}
                </button>
              </div>

              <button
                onClick={() => setShowQr(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Go Back
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
