// src/services/gstService.js
import { supabase } from "../api/supabase";

/**
 * Fetch GSTR‑1 report data for a given period.
 * Returns aggregated B2B, B2C, and HSN summaries from finalized/paid invoices.
 */
export async function getGSTR1Data(startDate, endDate, branchId, financialYearId) {
  // Build the base query – invoices that are GST‑applicable and within date range
  let invoiceQuery = supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      invoice_date,
      place_of_supply,
      reverse_charge,
      status,
      students ( gstin, first_name, last_name ),
      invoice_items ( taxable_amount, cgst_amount, sgst_amount, igst_amount, cess_amount, hsn_sac_code, description, quantity, unit_price )
    `)
    .eq("gst_applicable", true)
    .gte("invoice_date", startDate)
    .lte("invoice_date", endDate)
    // ✅ Accept both Final and Paid invoices
    .in("status", ["Final", "Paid"]);

  if (branchId) invoiceQuery = invoiceQuery.eq("branch_id", branchId);
  if (financialYearId) invoiceQuery = invoiceQuery.eq("financial_year_id", financialYearId);

  const { data: invoices, error } = await invoiceQuery;
  if (error) throw error;

  // Process invoices to build B2B, B2C, and HSN summaries
  const b2b = [];
  const b2cs = [];
  const hsnMap = new Map();

  (invoices || []).forEach((inv) => {
    const studentGstin = inv.students?.gstin;
    const pos = inv.place_of_supply || "24"; // default to Gujarat

    // Determine if B2B (has GSTIN) or B2C
    if (studentGstin) {
      // B2B
      const b2bEntry = {
        ctin: studentGstin,
        inum: inv.invoice_number,
        idt: inv.invoice_date,
        val: 0,
        pos: pos,
        rchrg: inv.reverse_charge ? "Y" : "N",
        itms: [],
      };
      inv.invoice_items.forEach((item) => {
        const taxable = Number(item.taxable_amount);
        const totalTax = Number(item.cgst_amount) + Number(item.sgst_amount) + Number(item.igst_amount);
        b2bEntry.val += taxable + totalTax;
        b2bEntry.itms.push({
          num: item.id,
          itm_det: {
            txval: taxable,
            rt: totalTax / taxable * 100 || 0,
            iamt: Number(item.igst_amount),
            camt: Number(item.cgst_amount),
            samt: Number(item.sgst_amount),
            csamt: Number(item.cess_amount),
          },
        });
      });
      b2b.push(b2bEntry);
    } else {
      // B2C
      const b2cEntry = {
        inum: inv.invoice_number,
        idt: inv.invoice_date,
        val: 0,
        pos: pos,
        etin: "",
        itms: [],
      };
      inv.invoice_items.forEach((item) => {
        const taxable = Number(item.taxable_amount);
        const totalTax = Number(item.cgst_amount) + Number(item.sgst_amount) + Number(item.igst_amount);
        b2cEntry.val += taxable + totalTax;
        b2cEntry.itms.push({
          num: item.id,
          itm_det: {
            txval: taxable,
            rt: totalTax / taxable * 100 || 0,
            iamt: Number(item.igst_amount),
            camt: Number(item.cgst_amount),
            samt: Number(item.sgst_amount),
            csamt: Number(item.cess_amount),
          },
        });
      });
      b2cs.push(b2cEntry);
    }

    // HSN summary
    inv.invoice_items.forEach((item) => {
      const hsn = item.hsn_sac_code || "—";
      if (!hsnMap.has(hsn)) {
        hsnMap.set(hsn, {
          hsn_sc: hsn,
          desc: item.description || "",
          qty: 0,
          unit: "NOS",
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        });
      }
      const entry = hsnMap.get(hsn);
      entry.qty += Number(item.quantity) || 1;
      entry.txval += Number(item.taxable_amount);
      entry.iamt += Number(item.igst_amount);
      entry.camt += Number(item.cgst_amount);
      entry.samt += Number(item.sgst_amount);
      entry.csamt += Number(item.cess_amount);
    });
  });

  const hsn = Array.from(hsnMap.values());

  return {
    b2b,
    b2cs,
    hsn,
    totalInvoices: invoices?.length || 0,
    b2bCount: b2b.length,
    b2cCount: b2cs.length,
    totalTaxable: hsn.reduce((s, h) => s + h.txval, 0),
    totalGST: hsn.reduce((s, h) => s + h.iamt + h.camt + h.samt, 0),
  };
}

/**
 * Generate GSTR‑1 JSON for offline utility.
 */
export function generateGSTR1JSON(gstrData, orgGstin, period) {
  const fp = period.replace(/-/g, "").slice(0, 6); // e.g., 202601
  return {
    gstin: orgGstin,
    fp,
    version: "1.0.0",
    b2b: gstrData.b2b,
    b2cs: gstrData.b2cs,
    b2cl: [],
    nil: {
      sply_ty: "INTER",
      etin: "",
      typ: "regular",
      itms: [],
    },
    hsn: gstrData.hsn,
    exp: [],
    cdnr: [],
  };
}