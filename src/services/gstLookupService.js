// src/services/gstLookupService.js
import { supabase } from "../api/supabase";

/**
 * Lookup GSTIN using an external API (GSP or third‑party provider).
 * Returns the business details or throws an error.
 *
 * To use a real API, replace the fetch URL and handle the response format.
 *
 * Supported providers (example):
 * - Masters India: https://api.mastersindia.co/v1/gstin/{gstin}
 * - ClearTax: https://api.cleartax.in/v1/gst/gstin/{gstin}
 * - or your own backend proxy
 */
export async function lookupGSTIN(gstin) {
  // Remove any spaces/hyphens and convert to uppercase
  const cleanGstin = gstin.replace(/[\s-]/g, "").toUpperCase();

  if (cleanGstin.length !== 15) {
    throw new Error("Invalid GSTIN: must be 15 characters.");
  }

  // ── Simulate API call (replace with real endpoint) ──
  // For demo, we return mock data after a short delay.
  // In production, fetch from your backend or GSP provider.
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // Mock response based on GSTIN (just for demonstration)
      const mockData = {
        gstin: cleanGstin,
        legal_name: `${cleanGstin.slice(2, 8)} Technologies Pvt Ltd`,
        trade_name: `${cleanGstin.slice(2, 8)} Tech`,
        registration_status: "Active",
        registration_type: "Regular",
        state: "Gujarat",
        state_code: cleanGstin.slice(0, 2),
        address: "123, Main Road, Ahmedabad, Gujarat - 380001",
        date_of_registration: "2020-01-01",
        constitution_of_business: "Private Limited Company",
        nature_of_business: "Software Development & Education",
        is_active: true,
      };

      // Simulate network latency
      if (Math.random() < 0.1) {
        reject(new Error("API rate limit exceeded. Please try again later."));
      } else {
        resolve(mockData);
      }
    }, 800);
  });
}

/**
 * Real implementation using a GSP (example with Masters India)
 * Uncomment and use this function instead of the mock above.
 */
/*
export async function lookupGSTIN(gstin) {
  const cleanGstin = gstin.replace(/[\s-]/g, "").toUpperCase();
  if (cleanGstin.length !== 15) {
    throw new Error("Invalid GSTIN: must be 15 characters.");
  }

  const apiKey = import.meta.env.VITE_GST_API_KEY; // Store your API key in .env
  const response = await fetch(
    `https://api.mastersindia.co/v1/gstin/${cleanGstin}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch GST details.");
  }

  const data = await response.json();
  // Map provider's response to your internal format
  return {
    gstin: data.gstin,
    legal_name: data.legal_name,
    trade_name: data.trade_name,
    registration_status: data.status,
    registration_type: data.registration_type,
    state: data.state,
    state_code: data.state_code,
    address: data.address,
    date_of_registration: data.date_of_registration,
    constitution_of_business: data.constitution,
    nature_of_business: data.business_nature,
    is_active: data.active === true,
  };
}
*/