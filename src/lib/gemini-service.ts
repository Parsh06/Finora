/**
 * Gemini API Service for Bill Scanning and OCR
 * Optimized for efficiency, maintainability, and accuracy
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_GENAI_API_KEY,
  model: "gemini-3-flash-preview",
  maxFileSize: 20 * 1024 * 1024, // 20MB
  temperature: 0.1,
  maxOutputTokens: 1024,
} as const;

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent`;

// ============================================================================
// TYPES
// ============================================================================

export interface BillData {
  amount: number;
  date: string;
  merchant: string;
  category: string;
  confidence: number;
  paymentMethod?: string;
  items?: string[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface RawBillData {
  amount?: number | string;
  date?: string;
  merchant?: string;
  items?: string[];
  paymentMethod?: string;
  category?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const CATEGORY_KEYWORDS = {
  food: ["restaurant", "cafe", "food", "pizza", "burger", "swiggy", "zomato", "uber eats", "meal"],
  shopping: ["amazon", "flipkart", "myntra", "shop", "store", "mall"],
  transport: ["uber", "ola", "taxi", "petrol", "fuel", "gas", "metro", "bus"],
  entertainment: ["netflix", "spotify", "movie", "cinema", "theater", "entertainment"],
  bills: ["electricity", "water", "gas bill", "internet", "phone", "utility"],
  health: ["pharmacy", "medical", "hospital", "clinic", "doctor"],
  education: ["school", "university", "college", "course", "education"],
} as const;

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: "cash",
  card: "card",
  debit: "card",
  credit: "card",
  upi: "upi",
  phonepe: "upi",
  paytm: "upi",
  gpay: "upi",
  online: "online",
  "net banking": "online",
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert image file to base64
 */
const imageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Get MIME type from file
 */
const getMimeType = (file: File): string => {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return MIME_TYPES[ext] || "image/jpeg";
};

/**
 * Get today's date in YYYY-MM-DD format
 */
const getTodayDate = (): string => new Date().toISOString().split("T")[0];

/**
 * Categorize expense based on merchant and items
 */
const categorizeExpense = (merchant: string, items: string[] = []): string => {
  const searchText = `${merchant} ${items.join(" ")}`.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => searchText.includes(keyword))) {
      return category;
    }
  }

  return "other";
};

/**
 * Normalize payment method
 */
const normalizePaymentMethod = (method?: string): string | undefined => {
  if (!method || typeof method !== "string") return undefined;

  const normalized = method.toLowerCase().trim();

  for (const [keyword, value] of Object.entries(PAYMENT_METHOD_MAP)) {
    if (normalized.includes(keyword)) return value;
  }

  return "other";
};

/**
 * Validate and parse date string
 */
const parseDate = (dateStr?: string): string => {
  if (!dateStr || typeof dateStr !== "string") return getTodayDate();

  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? getTodayDate() : date.toISOString().split("T")[0];
  } catch {
    return getTodayDate();
  }
};

/**
 * Parse and validate amount
 */
const parseAmount = (amount?: number | string): number => {
  if (amount === undefined || amount === null) return 0;

  const cleaned = String(amount).replace(/[₹$€£,\s]/g, "");
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
};

/**
 * Extract JSON from response text (handles markdown code blocks)
 */
const extractJson = (text: string): any => {
  let jsonString = text.trim();

  // Remove markdown code blocks
  const codeBlockMatch = jsonString.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1];
  } else {
    const objectMatch = jsonString.match(/(\{[\s\S]*\})/);
    if (objectMatch) {
      jsonString = objectMatch[1];
    }
  }

  return JSON.parse(jsonString);
};

/**
 * Calculate confidence score based on data completeness
 */
const calculateConfidence = (data: {
  amount: number;
  merchant: string;
  date: string;
  items: string[];
  paymentMethod?: string;
}): number => {
  let score = 60; // Base confidence

  if (data.amount > 0) score += 15;
  if (data.merchant !== "Unknown Merchant" && data.merchant.length > 2) score += 10;
  if (data.date !== getTodayDate()) score += 5;
  if (data.items.length > 0) score += 5;
  if (data.paymentMethod) score += 5;

  return Math.min(Math.max(score, 50), 95);
};

// ============================================================================
// PROMPT GENERATION
// ============================================================================

/**
 * Generate optimized prompt for Gemini API
 */
const generatePrompt = (userCategories?: string[]): string => {
  const todayDate = getTodayDate();
  const categoryInstruction = userCategories?.length
    ? `Classify into one of these EXACT categories: ${userCategories.join(", ")}. Use "Other" if no match.`
    : `Classify into a standard category (Food, Transport, Shopping, Bills, etc.)`;

  return `Extract bill information from this image. Return ONLY valid JSON with this structure:

{
  "amount": <total amount as number>,
  "date": <date in YYYY-MM-DD format>,
  "merchant": <store/vendor name>,
  "items": [<max 5 main items>],
  "paymentMethod": <"cash"|"card"|"upi"|"online"|"other"|null>,
  "category": <classified category>
}

Rules:
- Extract TOTAL/FINAL amount (no currency symbols, commas, or spaces)
- Use date FROM THE BILL. Only use ${todayDate} if no date visible
- ${categoryInstruction}
- If unclear, use: amount=0, date="${todayDate}", merchant="Unknown Merchant", items=[], paymentMethod=null

Return JSON only, no markdown or explanations.`;
};

// ============================================================================
// API INTERACTION
// ============================================================================

/**
 * Make API request to Gemini
 */
const callGeminiApi = async (base64Image: string, mimeType: string, prompt: string): Promise<GeminiResponse> => {
  const response = await fetch(`${GEMINI_API_URL}?key=${CONFIG.apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: CONFIG.temperature,
        topK: 32,
        topP: 1,
        maxOutputTokens: CONFIG.maxOutputTokens,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    throw await handleApiError(response);
  }

  return response.json();
};

/**
 * Handle API errors with user-friendly messages
 */
const handleApiError = async (response: Response): Promise<Error> => {
  const status = response.status;
  let message = `API request failed with status ${status}`;

  try {
    const errorData = await response.json();
    message = errorData.error?.message || message;
  } catch {
    message = response.statusText || message;
  }

  const errorMessages: Record<number, string> = {
    400: `Invalid request: ${message}. Check your image format.`,
    401: `Authentication failed. Check your API key.`,
    403: `Authentication failed. Check your API key.`,
    429: "Rate limit exceeded. Please try again in a moment.",
    500: "Gemini API service temporarily unavailable. Try again later.",
  };

  return new Error(errorMessages[status] || message);
};

// ============================================================================
// DATA PROCESSING
// ============================================================================

/**
 * Process raw bill data into structured format
 */
const processBillData = (rawData: RawBillData, userCategories?: string[]): BillData => {
  const todayDate = getTodayDate();

  // Parse basic fields
  const amount = parseAmount(rawData.amount);
  const merchant = (rawData.merchant || "").trim() || "Unknown Merchant";
  const date = parseDate(rawData.date);
  const items = Array.isArray(rawData.items)
    ? rawData.items.slice(0, 5).filter(item => item && String(item).trim())
    : [];
  const paymentMethod = normalizePaymentMethod(rawData.paymentMethod);

  // Determine category
  let category = "other";
  if (rawData.category && typeof rawData.category === "string") {
    const aiCategory = rawData.category.toLowerCase();

    if (userCategories?.length) {
      // Match user categories (case insensitive)
      const match = userCategories.find(c => c.toLowerCase() === aiCategory);
      category = match ? match.toLowerCase() : categorizeExpense(merchant, items);
    } else {
      // Use AI category or fallback to auto-categorization
      const autoCategory = categorizeExpense(merchant, items);
      category = autoCategory !== "other" ? autoCategory : aiCategory;
    }
  } else {
    category = categorizeExpense(merchant, items);
  }

  // Calculate confidence
  const confidence = calculateConfidence({ amount, merchant, date, items, paymentMethod });

  return {
    amount,
    date,
    merchant,
    category,
    confidence,
    paymentMethod,
    items,
  };
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Scan bill image and extract data using Gemini API
 */
export const scanBill = async (imageFile: File, userCategories?: string[]): Promise<BillData> => {
  // Validate API key
  if (!CONFIG.apiKey) {
    throw new Error("Gemini API key not configured. Set VITE_GEMINI_API_KEY in your .env file.");
  }

  // Validate file size
  if (imageFile.size > CONFIG.maxFileSize) {
    throw new Error("Image exceeds 20MB limit. Use a smaller image.");
  }

  try {
    // Convert image to base64
    const base64Image = await imageToBase64(imageFile);
    const mimeType = getMimeType(imageFile);

    // Generate prompt and call API
    const prompt = generatePrompt(userCategories);
    const response = await callGeminiApi(base64Image, mimeType, prompt);

    // Extract and parse response
    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("No valid response from Gemini API. Please try again.");
    }

    const rawData: RawBillData = extractJson(responseText);

    // Process and return structured data
    return processBillData(rawData, userCategories);

  } catch (error: any) {
    console.error("Bill scanning error:", error);

    // User-friendly error messages
    if (error.message.includes("API key")) {
      throw error;
    } else if (error.message.includes("parse") || error.message.includes("JSON")) {
      throw new Error("Could not read the bill clearly. Ensure the image is clear, well-lit, and shows the full bill.");
    } else if (error.message.includes("size") || error.message.includes("20MB")) {
      throw error;
    } else {
      throw new Error(error.message || "Failed to scan bill. Try again with a clearer image.");
    }
  }
};