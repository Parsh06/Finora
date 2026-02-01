/**
 * Gemini API Service for Bill Scanning and OCR
 * Uses Google's Gemini API for image understanding and bill data extraction
 * Based on Gemini Image Understanding documentation
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_GOOGLE_GENAI_API_KEY;
// Using Gemini 3 Flash Preview for better OCR and image understanding
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface BillData {
  amount: number;
  date: string; // ISO date string
  merchant: string;
  category: string;
  confidence: number;
  paymentMethod?: string;
  items?: string[];
}

/**
 * Convert image file to base64
 */
const imageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(",")[1];
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
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
  };
  return mimeTypes[extension || ""] || "image/jpeg";
};

/**
 * Map merchant/category keywords to expense categories
 */
const categorizeExpense = (merchant: string, items?: string[]): string => {
  const merchantLower = merchant.toLowerCase();
  const itemsText = items?.join(" ").toLowerCase() || "";

  // Food & Dining
  if (
    merchantLower.includes("restaurant") ||
    merchantLower.includes("cafe") ||
    merchantLower.includes("food") ||
    merchantLower.includes("pizza") ||
    merchantLower.includes("burger") ||
    merchantLower.includes("swiggy") ||
    merchantLower.includes("zomato") ||
    merchantLower.includes("uber eats") ||
    itemsText.includes("food") ||
    itemsText.includes("meal")
  ) {
    return "food";
  }

  // Shopping
  if (
    merchantLower.includes("amazon") ||
    merchantLower.includes("flipkart") ||
    merchantLower.includes("myntra") ||
    merchantLower.includes("shop") ||
    merchantLower.includes("store") ||
    merchantLower.includes("mall")
  ) {
    return "shopping";
  }

  // Transport
  if (
    merchantLower.includes("uber") ||
    merchantLower.includes("ola") ||
    merchantLower.includes("taxi") ||
    merchantLower.includes("petrol") ||
    merchantLower.includes("fuel") ||
    merchantLower.includes("gas") ||
    merchantLower.includes("metro") ||
    merchantLower.includes("bus")
  ) {
    return "transport";
  }

  // Entertainment
  if (
    merchantLower.includes("netflix") ||
    merchantLower.includes("spotify") ||
    merchantLower.includes("movie") ||
    merchantLower.includes("cinema") ||
    merchantLower.includes("theater") ||
    merchantLower.includes("entertainment")
  ) {
    return "entertainment";
  }

  // Bills
  if (
    merchantLower.includes("electricity") ||
    merchantLower.includes("water") ||
    merchantLower.includes("gas bill") ||
    merchantLower.includes("internet") ||
    merchantLower.includes("phone") ||
    merchantLower.includes("utility")
  ) {
    return "bills";
  }

  // Health
  if (
    merchantLower.includes("pharmacy") ||
    merchantLower.includes("medical") ||
    merchantLower.includes("hospital") ||
    merchantLower.includes("clinic") ||
    merchantLower.includes("doctor")
  ) {
    return "health";
  }

  // Education
  if (
    merchantLower.includes("school") ||
    merchantLower.includes("university") ||
    merchantLower.includes("college") ||
    merchantLower.includes("course") ||
    merchantLower.includes("education")
  ) {
    return "education";
  }

  // Default
  return "other";
};

/**
 * Extract bill data from image using Gemini API
 * Uses inline image data method for bills (typically < 20MB)
 */
export const scanBill = async (imageFile: File, userCategories?: string[]): Promise<BillData> => {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.");
  }

  try {
    // Validate file size (max 20MB for inline data)
    if (imageFile.size > 20 * 1024 * 1024) {
      throw new Error("Image size exceeds 20MB limit. Please use a smaller image.");
    }

    // Convert image to base64
    const base64Image = await imageToBase64(imageFile);
    const mimeType = getMimeType(imageFile);

    // Enhanced prompt for better OCR and bill extraction
    const todayDate = new Date().toISOString().split("T")[0];
    const categoryPrompt = userCategories && userCategories.length > 0
      ? `\nClassification Rules:\n- Classify the expense into one of these EXACT categories: ${userCategories.join(", ")}\n- If it doesn't fit any, use "Other"`
      : `\nClassification Rules:\n- Classify the expense into a standard category (e.g., Food, Transport, Shopping, Bills, etc.)`;

    const prompt = `You are an expert at reading and extracting information from bills, receipts, and invoices. 
    
Analyze this bill/receipt image carefully and extract all visible information. Pay special attention to:
- Total amount (final amount to pay, including taxes)
- Transaction date (use the date on the bill, not today's date)
- Merchant/store/vendor name
- Items purchased (if visible)
- Payment method (cash, card, UPI, online, etc.)
${categoryPrompt}

Return the extracted information in JSON format with the following structure:
{
  "amount": <total amount as a number without currency symbol or commas, e.g., 1249.50>,
  "date": <date in YYYY-MM-DD format from the bill>,
  "merchant": <merchant/store name as it appears on the bill>,
  "items": [<array of main items purchased, maximum 5 items>],
  "paymentMethod": <payment method: "cash", "card", "upi", "online", or "other" if visible>,
  "category": <the classified category based on the rules above>
}

CRITICAL INSTRUCTIONS:
1. Extract the TOTAL/FINAL amount (the amount that was paid or needs to be paid)
2. Use the DATE from the bill itself, not today's date. Only use today's date (${todayDate}) if no date is visible on the bill
3. Merchant name should be exactly as shown on the bill (store name, restaurant name, etc.)
4. If items are listed, extract the main items (up to 5 most prominent ones)
5. Amount must be a pure number (no currency symbols, no commas, no spaces)
6. Return ONLY valid JSON, no markdown formatting, no code blocks, no explanations
7. If any field is not visible or unclear, use appropriate defaults:
   - amount: 0
   - date: "${todayDate}"
   - merchant: "Unknown Merchant"
   - items: []
   - paymentMethod: null

Now analyze the image and return the JSON:`;

    // Make API request following Gemini API documentation format
    const response = await fetch(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
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
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Image,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1, // Low temperature for consistent, accurate extraction
            topK: 32,
            topP: 1,
            maxOutputTokens: 1024,
            responseMimeType: "application/json", // Request JSON response
          },
        }),
      }
    );

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;

        // Provide helpful error messages
        if (response.status === 400) {
          errorMessage = `Invalid request: ${errorMessage}. Please check your image format.`;
        } else if (response.status === 401 || response.status === 403) {
          errorMessage = `Authentication failed: ${errorMessage}. Please check your API key.`;
        } else if (response.status === 429) {
          errorMessage = "Rate limit exceeded. Please try again in a moment.";
        } else if (response.status >= 500) {
          errorMessage = "Gemini API service is temporarily unavailable. Please try again later.";
        }
      } catch {
        // If error response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Extract text from response
    let billJson: any = {};

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      const responseText = data.candidates[0].content.parts[0].text.trim();

      // Parse JSON response (handle markdown code blocks if present)
      try {
        let jsonString = responseText;

        // Remove markdown code blocks if present
        if (jsonString.includes("```")) {
          const jsonMatch = jsonString.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (jsonMatch) {
            jsonString = jsonMatch[1];
          } else {
            // Try to extract JSON object
            const objectMatch = jsonString.match(/(\{[\s\S]*\})/);
            if (objectMatch) {
              jsonString = objectMatch[1];
            }
          }
        }

        billJson = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Failed to parse JSON response:", responseText);
        console.error("Parse error:", parseError);
        throw new Error("Failed to parse bill data from AI response. The image might be unclear or not a valid bill.");
      }
    } else {
      console.error("Unexpected API response structure:", data);
      throw new Error("No valid response from Gemini API. Please try again.");
    }

    // Validate and extract data with better error handling
    let amount = 0;
    if (billJson.amount !== undefined && billJson.amount !== null) {
      // Handle string amounts with currency symbols
      const amountStr = String(billJson.amount).replace(/[₹$€£,\s]/g, "");
      amount = parseFloat(amountStr);
      if (isNaN(amount) || amount < 0) {
        amount = 0;
      }
    }

    const merchant = (billJson.merchant || "").trim() || "Unknown Merchant";
    let dateStr = billJson.date || todayDate;

    // Validate date format
    if (dateStr && typeof dateStr === "string") {
      // Try to parse and reformat date
      try {
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) {
          dateStr = todayDate;
        } else {
          dateStr = dateObj.toISOString().split("T")[0];
        }
      } catch {
        dateStr = todayDate;
      }
    } else {
      dateStr = todayDate;
    }

    const items = Array.isArray(billJson.items)
      ? billJson.items.slice(0, 5).filter((item: any) => item && String(item).trim())
      : [];

    let paymentMethod = billJson.paymentMethod;
    if (paymentMethod && typeof paymentMethod === "string") {
      paymentMethod = paymentMethod.toLowerCase().trim();
      // Normalize payment method values
      if (paymentMethod.includes("cash")) {
        paymentMethod = "cash";
      } else if (paymentMethod.includes("card") || paymentMethod.includes("debit") || paymentMethod.includes("credit")) {
        paymentMethod = "card";
      } else if (paymentMethod.includes("upi") || paymentMethod.includes("phonepe") || paymentMethod.includes("paytm") || paymentMethod.includes("gpay")) {
        paymentMethod = "upi";
      } else if (paymentMethod.includes("online") || paymentMethod.includes("net banking")) {
        paymentMethod = "online";
      } else {
        paymentMethod = "other";
      }
    } else {
      paymentMethod = undefined;
    }

    // Categorize using AI result if available, otherwise fallback
    // Note: We prefer the AI's classification if we provided user categories
    let category = "other";
    if (billJson.category && typeof billJson.category === "string") {
      // If we passed user categories, try to match exactly (case insensitive)
      if (userCategories && userCategories.length > 0) {
        const match = userCategories.find(c => c.toLowerCase() === billJson.category.toLowerCase());
        category = match ? match.toLowerCase() : (categorizeExpense(merchant, items) || "other");
      } else {
        // Otherwise use our static categorizer as fallback or validity check
        const staticCat = categorizeExpense(merchant, items);
        category = staticCat !== "other" ? staticCat : billJson.category.toLowerCase();
      }
    } else {
      category = categorizeExpense(merchant, items);
    }

    // Calculate confidence based on data completeness and quality
    let confidence = 60; // Base confidence
    if (amount > 0) confidence += 15;
    if (merchant !== "Unknown Merchant" && merchant.length > 2) confidence += 10;
    if (dateStr && dateStr !== todayDate) confidence += 5; // Higher confidence if date was extracted from bill
    if (items.length > 0) confidence += 5;
    if (paymentMethod) confidence += 5;

    // Ensure confidence is within reasonable bounds
    confidence = Math.min(Math.max(confidence, 50), 95);

    return {
      amount,
      date: dateStr,
      merchant,
      category,
      confidence,
      paymentMethod,
      items,
    };
  } catch (error: any) {
    console.error("Bill scanning error:", error);

    // Provide user-friendly error messages
    if (error.message.includes("API key")) {
      throw new Error("Gemini API key is not configured. Please set VITE_GEMINI_API_KEY in your .env file.");
    } else if (error.message.includes("parse") || error.message.includes("unclear")) {
      throw new Error("Could not read the bill clearly. Please ensure the image is clear, well-lit, and shows the full bill.");
    } else if (error.message.includes("size")) {
      throw new Error("Image is too large. Please use an image smaller than 20MB.");
    } else {
      throw new Error(
        error.message || "Failed to scan bill. Please try again with a clearer image."
      );
    }
  }
};

