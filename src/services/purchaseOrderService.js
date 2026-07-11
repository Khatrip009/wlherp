// src/services/purchaseOrderService.js
import { supabase } from "../api/supabase";

export async function getPurchaseOrders() {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*, purchase_order_items(*, inventory_items(item_name, unit))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// context: { branchId, financialYearId }
export async function createPurchaseOrder(payload, context) {
  const { branchId, financialYearId } = context;

  // Generate PO number
  const { data: poNum } = await supabase.rpc("generate_po_number");
  const poNumber = poNum;

  // Insert PO header
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      vendor: payload.vendor,
      order_date: payload.order_date,
      expected_date: payload.expected_date,
      notes: payload.notes,
      total_amount: payload.items.reduce((s, i) => s + (i.quantity * i.unit_price), 0),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;

  // Insert PO items
  const itemInserts = payload.items.map((item) => ({
    purchase_order_id: po.id,
    item_id: item.item_id,
    quantity_ordered: item.quantity,
    unit_price: item.unit_price,
    tax_rate_id: item.tax_rate_id || null,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  await supabase.from("purchase_order_items").insert(itemInserts);

  return po;
}

// context: { branchId, financialYearId }
export async function updatePurchaseOrderStatus(id, status, context) {
  const { branchId, financialYearId } = context;
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);
  if (error) throw error;
}

// Receive stock against a PO
// context: { branchId, financialYearId }
export async function receiveStock(poId, itemReceipts, context) {
  const { branchId, financialYearId } = context;

  // itemReceipts: [{ item_id, quantity_received }]
  for (const receipt of itemReceipts) {
    // 1. Update PO item
    const { data: poItem } = await supabase
      .from("purchase_order_items")
      .select("quantity_received, quantity_ordered, unit_price, item_id, tax_rate_id")
      .eq("purchase_order_id", poId)
      .eq("item_id", receipt.item_id)
      .single();

    const newQtyReceived = (poItem.quantity_received || 0) + receipt.quantity_received;
    await supabase
      .from("purchase_order_items")
      .update({
        quantity_received: newQtyReceived,
        branch_id: branchId,
        financial_year_id: financialYearId,
      })
      .eq("purchase_order_id", poId)
      .eq("item_id", receipt.item_id);

    // 2. Create inventory transaction (stock in)
    await supabase.from("inventory_transactions").insert({
      item_id: receipt.item_id,
      transaction_type: "purchase",
      quantity: receipt.quantity_received,
      unit_price: poItem.unit_price,
      reference: `PO-${poId}`,
      notes: `Received against PO #${poId}`,
      branch_id: branchId,
      financial_year_id: financialYearId,
    });
  }

  // 3. Update PO status
  const { data: items } = await supabase
    .from("purchase_order_items")
    .select("quantity_ordered, quantity_received")
    .eq("purchase_order_id", poId);

  const allFullyReceived = items?.every((i) => i.quantity_received >= i.quantity_ordered);
  const anyReceived = items?.some((i) => i.quantity_received > 0);

  let newStatus = "Issued";
  if (allFullyReceived) newStatus = "Received";
  else if (anyReceived) newStatus = "Partially Received";

  // Pass context to the status update
  await updatePurchaseOrderStatus(poId, newStatus, context);
}