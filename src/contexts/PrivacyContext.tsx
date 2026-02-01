
import React, { createContext, useContext, useState, useEffect } from "react";

interface PrivacyContextType {
    isPrivacyEnabled: boolean;
    togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isPrivacyEnabled, setIsPrivacyEnabled] = useState(() => {
        // Persist state in localStorage
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem("finora_privacy_enabled");
            return stored === "true";
        }
        return false;
    });

    useEffect(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem("finora_privacy_enabled", String(isPrivacyEnabled));

            // Add/remove global class for easier styling if needed,
            // though we'll primarily use the hook or CSS module
            if (isPrivacyEnabled) {
                document.body.classList.add("privacy-mode-active");
            } else {
                document.body.classList.remove("privacy-mode-active");
            }
        }
    }, [isPrivacyEnabled]);

    const togglePrivacy = () => setIsPrivacyEnabled(prev => !prev);

    return (
        <PrivacyContext.Provider value={{ isPrivacyEnabled, togglePrivacy }}>
            {children}
        </PrivacyContext.Provider>
    );
};

export const usePrivacy = () => {
    const context = useContext(PrivacyContext);
    if (context === undefined) {
        throw new Error("usePrivacy must be used within a PrivacyProvider");
    }
    return context;
};
