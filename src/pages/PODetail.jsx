// src/pages/PODetail.jsx
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, Printer, Truck } from "lucide-react";

import { supabase } from "../api/supabase";
import { receivePO } from "../services/poService";
import { getOrganization } from "../services/organizationService";
import { useOrg } from "../context/OrganizationContext";

// Indian English number‑to‑words converter
function numberToWords(num) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function convert(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + convert(n % 10000000) : "");
  }
  return num === 0 ? "Zero" : convert(num);
}

export default function PODetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  // ── Get organisation and branch/FY for print header and scoping ──
  const { org: currentOrg, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const { data: org } = useQuery({
    queryKey: ["organization", currentOrg?.id],
    queryFn: () => getOrganization(currentOrg?.id),
    enabled: !!currentOrg?.id,
  });

  const context = { branchId, financialYearId };

  // Fetch purchase order – scoped
  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order", id, branchId, financialYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select(
          `*,
          purchase_order_items(
            *,
            inventory_items(item_name, unit),
            tax_rates(name, rate)
          )`
        )
        .eq("id", id)
        .eq("branch_id", branchId)
        .eq("financial_year_id", financialYearId)
        .single();
      return data;
    },
    enabled: !!id && !!branchId && !!financialYearId,
  });

  // Receive PO mutation (already uses context)
  const receiveMut = useMutation({
    mutationFn: () => receivePO(id, context),
    onSuccess: () => {
      toast.success("PO received – stock updated");
      queryClient.invalidateQueries(["purchase-orders"]);
      queryClient.invalidateQueries(["purchase-order", id]);
    },
    onError: () => toast.error("Receive failed"),
  });

  const handlePrint = () => {
    const printContent = document.getElementById("po-print-area")?.innerHTML;
    if (!printContent) return;

    const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
    const orgName = org?.company_name || "ShreeVidhya Academy";
    const orgAddress = org?.address || "";
    const orgPhone = org?.phone || "";
    const orgEmail = org?.email || "";
    const orgGstin = org?.gstin || "";

    const printWindow = window.open("", "_blank", "width=900,height=650");
    printWindow.document.write(`
      <html>
        <head>
          <title>PO ${po?.po_number}</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: Montserrat, sans-serif; color: #222; font-size: 10px; }
            .header { display: flex; align-items: center; border-bottom: 2px solid #0D47A1; padding-bottom: 8px; margin-bottom: 15px; }
            .header img { height: 40px; margin-right: 15px; }
            .org-name { font-size: 16px; font-weight: 700; color: #0D47A1; }
            .org-details { font-size: 8px; color: #555; }
            h1 { text-align: center; color: #0D47A1; margin: 10px 0; font-size: 14px; }
            .two-col { display: flex; justify-content: space-between; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #bbb; font-size: 9px; margin-bottom: 12px; }
            th, td { padding: 4px 6px; border: 1px solid #bbb; }
            th { background-color: #E3F2FD; }
            .text-right { text-align: right; }
            .footer { margin-top: 20px; font-size: 8px; color: #888; text-align: center; border-top: 1px solid #ddd; padding-top: 8px; }
            .terms { font-size: 8px; margin-top: 15px; }
            .signature { display: flex; justify-content: space-between; margin-top: 30px; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'" />
            <div>
              <div class="org-name">${orgName}</div>
              <div class="org-details">${orgAddress}</div>
              <div class="org-details">Ph: ${orgPhone}  |  Email: ${orgEmail}  |  GSTIN: ${orgGstin}</div>
            </div>
          </div>
          ${printContent}
          <div class="footer">Computer‑generated document – ${orgName}</div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (isLoading) return <><div className="p-8 text-center">Loading PO…</div></>;
  if (!po) return <><div className="p-8 text-center text-red-600">PO not found</div></>;

  const items = po.purchase_order_items || [];
  const subtotal = items.reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0);

  // Calculate tax totals per rate
  const taxSummary = {};
  items.forEach((item) => {
    const rate = item.tax_rates;
    const rateName = rate ? `${rate.name} (${rate.rate}%)` : "No Tax";
    const ratePercent = rate ? parseFloat(rate.rate) : 0;
    const itemTotal = item.quantity_ordered * item.unit_price;
    const taxAmount = itemTotal * (ratePercent / 100);
    if (!taxSummary[rateName]) {
      taxSummary[rateName] = { ratePercent, taxAmount: 0, taxableValue: 0 };
    }
    taxSummary[rateName].taxAmount += taxAmount;
    taxSummary[rateName].taxableValue += itemTotal;
  });

  const totalTax = Object.values(taxSummary).reduce((s, t) => s + t.taxAmount, 0);
  const grandTotal = subtotal + totalTax;
  const amountWords = numberToWords(Math.round(grandTotal)) + " Only";

  return (
    <>
      <div className="flex justify-between items-center mb-6 no-print">
        <Link to="/purchase-orders" className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark text-sm">
          <ArrowLeft size={18} /> Back to POs
        </Link>
        <div className="flex gap-2">
          {po.status !== "Received" && po.status !== "Cancelled" && (
            <button onClick={() => receiveMut.mutate()} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <Truck size={16} /> Receive
            </button>
          )}
          <button onClick={handlePrint} className="bg-primary text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      <div id="po-print-area" className="bg-white rounded-xl p-6 shadow-sm">
        {/* Title */}
        <h1 className="text-2xl font-righteous text-primary-dark text-center mb-2">Purchase Order</h1>
        <p className="text-center text-sm font-medium mb-6">{po.po_number}</p>

        {/* Two‑column: Org & Vendor */}
        <div className="two-col" style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ width: "48%" }}>
            <h2 className="font-bold text-sm text-primary-dark mb-1">Vendor Details</h2>
            <p className="text-xs"><strong>{po.vendor}</strong></p>
            {po.vendor_address && <p className="text-xs">{po.vendor_address}</p>}
            {po.vendor_gstin && <p className="text-xs"><strong>GSTIN:</strong> {po.vendor_gstin}</p>}
          </div>
          <div style={{ width: "48%", textAlign: "right" }}>
            <p className="text-xs"><strong>Order Date:</strong> {po.order_date}</p>
            <p className="text-xs"><strong>Expected Date:</strong> {po.expected_date || "—"}</p>
            <p className="text-xs">
              <strong>Status:</strong>{" "}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                po.status === "Received" ? "bg-green-100 text-green-700" :
                po.status === "Partially Received" ? "bg-yellow-100 text-yellow-700" :
                po.status === "Cancelled" ? "bg-red-100 text-red-700" :
                "bg-blue-100 text-blue-700"
              }`}>{po.status}</span>
            </p>
          </div>
        </div>

        {po.notes && <p className="text-xs mb-4"><strong>Notes:</strong> {po.notes}</p>}

        {/* Items Table */}
        <table className="w-full text-sm border">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left border">#</th>
              <th className="p-2 text-left border">Item</th>
              <th className="p-2 text-center border">Qty</th>
              <th className="p-2 text-right border">Unit Price</th>
              <th className="p-2 text-right border">Tax Rate</th>
              <th className="p-2 text-right border">CGST</th>
              <th className="p-2 text-right border">SGST</th>
              <th className="p-2 text-right border">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const rate = item.tax_rates;
              const ratePercent = rate ? parseFloat(rate.rate) : 0;
              const itemTotal = item.quantity_ordered * item.unit_price;
              const taxAmount = itemTotal * (ratePercent / 100);
              const cgst = taxAmount / 2;
              const sgst = taxAmount / 2;
              return (
                <tr key={idx} className="border-t">
                  <td className="p-2 border">{idx + 1}</td>
                  <td className="p-2 border">{item.inventory_items?.item_name || `Item #${item.item_id}`}</td>
                  <td className="p-2 border text-center">{item.quantity_ordered}</td>
                  <td className="p-2 border text-right">₹ {Number(item.unit_price).toLocaleString("en-IN")}</td>
                  <td className="p-2 border text-right">{rate ? `${rate.rate}%` : "—"}</td>
                  <td className="p-2 border text-right">₹ {cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 border text-right">₹ {sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 border text-right font-medium">₹ {(itemTotal + taxAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
          <div style={{ width: "300px" }}>
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="p-1 text-right">Subtotal:</td>
                  <td className="p-1 text-right font-medium">₹ {subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
                {Object.entries(taxSummary).map(([name, data]) => (
                  <tr key={name}>
                    <td className="p-1 text-right">{name}:</td>
                    <td className="p-1 text-right">₹ {data.taxAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t">
                  <td className="p-1 text-right">Grand Total:</td>
                  <td className="p-1 text-right">₹ {grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-right mt-2"><strong>Amount in Words:</strong> {amountWords}</p>
          </div>
        </div>

        {/* Terms & Conditions */}
        <div className="terms mt-6 text-xs text-gray-600 border-t pt-4">
          <h3 className="font-bold text-primary-dark mb-1">Terms & Conditions</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>All prices are inclusive of taxes unless specified otherwise.</li>
            <li>Delivery must be made within the expected date.</li>
            <li>Goods once received will not be returned unless defective.</li>
            <li>Payment is due within 15 days of invoice receipt.</li>
            <li>Any discrepancies must be reported within 48 hours of delivery.</li>
          </ol>
        </div>

        {/* Signatures */}
        <div className="signature" style={{ display: "flex", justifyContent: "space-between", marginTop: "40px" }}>
          <div style={{ width: "40%" }}>
            <div style={{ borderBottom: "1px solid #0D47A1", marginBottom: "4px" }}></div>
            <p className="text-xs text-center">Authorized Signatory</p>
          </div>
          <div style={{ width: "40%" }}>
            <div style={{ borderBottom: "1px solid #0D47A1", marginBottom: "4px" }}></div>
            <p className="text-xs text-center">Vendor / Supplier</p>
          </div>
        </div>
      </div>
    </>
  );
}