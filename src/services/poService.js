// src/services/poService.js
import { supabase } from "../api/supabase";

export async function getPurchaseOrders(filters = {}, branchId, financialYearId) {
  let query = supabase.from("purchase_orders").select("*");

  // Scope by branch & FY
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) {
    query = query.or(`po_number.ilike.%${filters.search}%,vendor.ilike.%${filters.search}%`);
  }

  const { data: pos, error } = await query;
  if (error) throw error;
  if (!pos || pos.length === 0) return [];

  // Sort client‑side by order_date descending
  pos.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));

  const poIds = pos.map((po) => po.id);

  // Fetch items – also scoped
  let itemsQuery = supabase
    .from("purchase_order_items")
    .select("*")
    .in("purchase_order_id", poIds);

  if (branchId) itemsQuery = itemsQuery.eq("branch_id", branchId);
  if (financialYearId) itemsQuery = itemsQuery.eq("financial_year_id", financialYearId);

  const { data: items } = await itemsQuery;

  const itemMap = {};
  (items || []).forEach((item) => {
    if (!itemMap[item.purchase_order_id]) itemMap[item.purchase_order_id] = [];
    itemMap[item.purchase_order_id].push(item);
  });

  return pos.map((po) => ({
    ...po,
    purchase_order_items: itemMap[po.id] || [],
  }));
}

// context: { branchId, financialYearId }
export async function createPO(payload, context) {
  const { branchId, financialYearId } = context;
  const { data: poNumber } = await supabase.rpc("generate_po_number");

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      vendor: payload.vendor,
      vendor_address: payload.vendor_address || null,
      vendor_gstin: payload.vendor_gstin || null,
      vendor_contact_person: payload.vendor_contact_person || null,
      vendor_phone: payload.vendor_phone || null,
      vendor_email: payload.vendor_email || null,
      order_date: payload.order_date,
      expected_date: payload.expected_date || null,
      status: payload.status || "Draft",
      notes: payload.notes || null,
      total_amount: payload.total_amount || 0,
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .select()
    .single();
  if (error) throw error;

  const items = (payload.items || []).map((item) => ({
    purchase_order_id: po.id,
    item_id: item.item_id || null,
    quantity_ordered: item.quantity_ordered,
    unit_price: item.unit_price,
    tax_rate_id: item.tax_rate_id || null,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  if (items.length > 0) {
    await supabase.from("purchase_order_items").insert(items);
  }
  return po;
}

// context: { branchId, financialYearId }
export async function updatePOStatus(id, status, context) {
  const { branchId, financialYearId } = context;

  let query = supabase
    .from("purchase_orders")
    .update({
      status,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", id);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { error } = await query;
  if (error) throw error;
}

// context: { branchId, financialYearId }
export async function receivePO(poId, context) {
  const { branchId, financialYearId } = context;

  // Fetch PO – scoped
  let poQuery = supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", poId);

  if (branchId) poQuery = poQuery.eq("branch_id", branchId);
  if (financialYearId) poQuery = poQuery.eq("financial_year_id", financialYearId);

  const { data: po } = await poQuery.single();
  if (!po) throw new Error("PO not found");

  // Fetch items – scoped
  let itemsQuery = supabase
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", poId);

  if (branchId) itemsQuery = itemsQuery.eq("branch_id", branchId);
  if (financialYearId) itemsQuery = itemsQuery.eq("financial_year_id", financialYearId);

  const { data: items } = await itemsQuery;

  for (const item of items || []) {
    if (!item.item_id) continue;
    const qtyToReceive = item.quantity_ordered - (item.quantity_received || 0);
    if (qtyToReceive <= 0) continue;

    // Insert inventory transaction
    await supabase.from("inventory_transactions").insert({
      item_id: item.item_id,
      transaction_type: "purchase",
      quantity: qtyToReceive,
      unit_price: item.unit_price,
      reference: `PO ${po.po_number}`,
      notes: `Received from ${po.vendor || "vendor"}`,
      branch_id: branchId,
      financial_year_id: financialYearId,
    });

    // Update received quantity on PO item – scoped update
    let itemUpdateQuery = supabase
      .from("purchase_order_items")
      .update({
        quantity_received: (item.quantity_received || 0) + qtyToReceive,
        branch_id: branchId,
        financial_year_id: financialYearId,
      })
      .eq("id", item.id);

    if (branchId) itemUpdateQuery = itemUpdateQuery.eq("branch_id", branchId);
    if (financialYearId) itemUpdateQuery = itemUpdateQuery.eq("financial_year_id", financialYearId);

    await itemUpdateQuery;
  }

  // Check if all items fully received – scoped
  let updatedItemsQuery = supabase
    .from("purchase_order_items")
    .select("quantity_ordered, quantity_received")
    .eq("purchase_order_id", poId);

  if (branchId) updatedItemsQuery = updatedItemsQuery.eq("branch_id", branchId);
  if (financialYearId) updatedItemsQuery = updatedItemsQuery.eq("financial_year_id", financialYearId);

  const { data: updatedItems } = await updatedItemsQuery;

  const fullyReceived = (updatedItems || []).every(
    (it) => (it.quantity_received || 0) >= it.quantity_ordered
  );

  let poUpdateQuery = supabase
    .from("purchase_orders")
    .update({
      status: fullyReceived ? "Received" : "Partially Received",
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", poId);

  if (branchId) poUpdateQuery = poUpdateQuery.eq("branch_id", branchId);
  if (financialYearId) poUpdateQuery = poUpdateQuery.eq("financial_year_id", financialYearId);

  await poUpdateQuery;
}

// Hard delete – now scoped
export async function deletePO(id, branchId, financialYearId) {
  let query = supabase.from("purchase_orders").delete().eq("id", id);
  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);
  const { error } = await query;
  if (error) throw error;
}

// Fetch a single PO with items – scoped
export async function getPOById(poId, branchId, financialYearId) {
  let query = supabase
    .from("purchase_orders")
    .select("*, purchase_order_items(*)")
    .eq("id", poId);

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data: po } = await query.single();
  return po;
}

// Update PO header and items – context required, scoped
export async function updatePO(poId, payload, context) {
  const { branchId, financialYearId } = context;

  // Update header – scoped
  let headerUpdateQuery = supabase
    .from("purchase_orders")
    .update({
      vendor: payload.vendor,
      vendor_address: payload.vendor_address || null,
      vendor_gstin: payload.vendor_gstin || null,
      vendor_contact_person: payload.vendor_contact_person || null,
      vendor_phone: payload.vendor_phone || null,
      vendor_email: payload.vendor_email || null,
      order_date: payload.order_date,
      expected_date: payload.expected_date,
      status: payload.status,
      notes: payload.notes,
      total_amount: payload.total_amount || 0,
      updated_at: new Date(),
      branch_id: branchId,
      financial_year_id: financialYearId,
    })
    .eq("id", poId);

  if (branchId) headerUpdateQuery = headerUpdateQuery.eq("branch_id", branchId);
  if (financialYearId) headerUpdateQuery = headerUpdateQuery.eq("financial_year_id", financialYearId);

  await headerUpdateQuery;

  // Delete old items – scoped
  let deleteItemsQuery = supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", poId);

  if (branchId) deleteItemsQuery = deleteItemsQuery.eq("branch_id", branchId);
  if (financialYearId) deleteItemsQuery = deleteItemsQuery.eq("financial_year_id", financialYearId);

  await deleteItemsQuery;

  // Insert new items
  const items = (payload.items || []).map((item) => ({
    purchase_order_id: poId,
    item_id: item.item_id || null,
    quantity_ordered: item.quantity_ordered,
    unit_price: item.unit_price,
    tax_rate_id: item.tax_rate_id || null,
    branch_id: branchId,
    financial_year_id: financialYearId,
  }));
  if (items.length > 0) {
    await supabase.from("purchase_order_items").insert(items);
  }
}