// src/services/purchaseOrderService.js
import { supabase } from "../api/supabase";
import { sendTemplateEmail } from "./emailService"; // 👈 Added

// ─── Helpers ──────────────────────────────────────────────────────────

async function getOrganizationFromBranch(branchId) {
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("organization_id")
    .eq("id", branchId)
    .single();
  if (branchError) throw branchError;

  const { data: org, error: orgError } = await supabase
    .from("organization")
    .select("id, company_name")
    .eq("id", branch.organization_id)
    .single();
  if (orgError) throw orgError;
  return org;
}

async function getAdminEmails(organizationId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "super_admin", "organization_admin"])
    .eq("is_active", true);
  if (error) throw error;
  return data?.map(p => p.email).filter(Boolean) || [];
}

/**
 * Send PO finalization notification (to vendor and admins).
 */
async function sendPOSentNotification(po, context) {
  const { branchId, financialYearId } = context;
  try {
    const org = await getOrganizationFromBranch(branchId);

    // Fetch PO items with inventory item names
    let itemsQuery = supabase
      .from("purchase_order_items")
      .select(`
        quantity_ordered,
        unit_price,
        inventory_items(item_name)
      `)
      .eq("purchase_order_id", po.id);
    if (branchId) itemsQuery = itemsQuery.eq("branch_id", branchId);
    if (financialYearId) itemsQuery = itemsQuery.eq("financial_year_id", financialYearId);

    const { data: items, error: itemsError } = await itemsQuery;
    if (itemsError) throw itemsError;

    // Build items list string
    const itemsList = (items || [])
      .map(item => {
        const name = item.inventory_items?.item_name || 'Unknown Item';
        return `${name} x ${item.quantity_ordered} @ ₹${item.unit_price}`;
      })
      .join('; ');

    const contextEmail = {
      academyName: org.company_name,
      vendor_name: po.vendor || 'Vendor',
      po_number: po.po_number,
      order_date: po.order_date,
      expected_date: po.expected_date || 'Not specified',
      total_amount: po.total_amount || 0,
      items_list: itemsList || 'No items',
    };

    // Send to vendor if email exists
    if (po.vendor_email) {
      await sendTemplateEmail({
        to: po.vendor_email,
        organizationId: org.id,
        slug: "po_sent",
        context: contextEmail,
        branchId,
      });
      console.log(`✅ PO sent email sent to ${po.vendor_email} for ${po.po_number}`);
    } else {
      console.warn(`No vendor email for PO ${po.po_number}, skipping vendor email.`);
    }

    // Also notify admins via system_announcement
    const adminEmails = await getAdminEmails(org.id);
    if (adminEmails.length > 0) {
      const adminMessage = `Purchase Order ${po.po_number} has been finalized.\n` +
        `Vendor: ${po.vendor}\n` +
        `Total Amount: ₹${Number(po.total_amount).toLocaleString('en-IN')}\n` +
        `Order Date: ${po.order_date}`;
      await sendTemplateEmail({
        to: adminEmails,
        organizationId: org.id,
        slug: "system_announcement",
        context: {
          academyName: org.company_name,
          title: `Purchase Order Finalized: ${po.po_number}`,
          message: adminMessage,
          target_type: "Admin",
        },
        branchId,
      });
      console.log(`✅ Admin notification sent for PO ${po.po_number}`);
    }
  } catch (error) {
    console.error("❌ Failed to send PO notification:", error);
  }
}

// ─── Main Service Functions ──────────────────────────────────────────

export async function getPurchaseOrders(branchId, financialYearId) {
  let query = supabase
    .from("purchase_orders")
    .select("*, purchase_order_items(*, inventory_items(item_name, unit))")
    .order("created_at", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (financialYearId) query = query.eq("financial_year_id", financialYearId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// context: { branchId, financialYearId }
export async function createPurchaseOrder(payload, context) {
  const { branchId, financialYearId } = context;

  // Generate PO number
  const { data: poNum } = await supabase.rpc("generate_po_number");
  const poNumber = poNum;

  // Insert PO header (including optional fields)
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

  // If status is "Final", send notification
  if (po.status === "Final") {
    await sendPOSentNotification(po, context);
  }

  return po;
}

// context: { branchId, financialYearId }
export async function updatePurchaseOrderStatus(id, status, context) {
  const { branchId, financialYearId } = context;

  // Fetch current PO (for old status and email) – scoped
  let fetchQuery = supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", id);
  if (branchId) fetchQuery = fetchQuery.eq("branch_id", branchId);
  if (financialYearId) fetchQuery = fetchQuery.eq("financial_year_id", financialYearId);
  const { data: po, error: fetchError } = await fetchQuery.single();
  if (fetchError) throw fetchError;

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

  // If new status is "Final" and it changed from something else, send notification
  if (status === "Final" && po.status !== "Final") {
    // Re‑fetch the updated PO to get latest data
    let updatedQuery = supabase
      .from("purchase_orders")
      .select("*")
      .eq("id", id);
    if (branchId) updatedQuery = updatedQuery.eq("branch_id", branchId);
    if (financialYearId) updatedQuery = updatedQuery.eq("financial_year_id", financialYearId);
    const { data: updatedPO } = await updatedQuery.single();
    if (updatedPO) {
      await sendPOSentNotification(updatedPO, context);
    }
  }
}

// Receive stock against a PO
// context: { branchId, financialYearId }
export async function receiveStock(poId, itemReceipts, context) {
  const { branchId, financialYearId } = context;

  // itemReceipts: [{ item_id, quantity_received }]
  for (const receipt of itemReceipts) {
    // 1. Fetch PO item – scoped
    let itemQuery = supabase
      .from("purchase_order_items")
      .select("quantity_received, quantity_ordered, unit_price, item_id, tax_rate_id")
      .eq("purchase_order_id", poId)
      .eq("item_id", receipt.item_id);

    if (branchId) itemQuery = itemQuery.eq("branch_id", branchId);
    if (financialYearId) itemQuery = itemQuery.eq("financial_year_id", financialYearId);

    const { data: poItem } = await itemQuery.single();

    const newQtyReceived = (poItem.quantity_received || 0) + receipt.quantity_received;

    // Update PO item – scoped
    let updateItemQuery = supabase
      .from("purchase_order_items")
      .update({
        quantity_received: newQtyReceived,
        branch_id: branchId,
        financial_year_id: financialYearId,
      })
      .eq("purchase_order_id", poId)
      .eq("item_id", receipt.item_id);

    if (branchId) updateItemQuery = updateItemQuery.eq("branch_id", branchId);
    if (financialYearId) updateItemQuery = updateItemQuery.eq("financial_year_id", financialYearId);

    await updateItemQuery;

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

  // 3. Recalculate status – scoped select
  let allItemsQuery = supabase
    .from("purchase_order_items")
    .select("quantity_ordered, quantity_received")
    .eq("purchase_order_id", poId);

  if (branchId) allItemsQuery = allItemsQuery.eq("branch_id", branchId);
  if (financialYearId) allItemsQuery = allItemsQuery.eq("financial_year_id", financialYearId);

  const { data: items } = await allItemsQuery;

  const allFullyReceived = items?.every((i) => i.quantity_received >= i.quantity_ordered);
  const anyReceived = items?.some((i) => i.quantity_received > 0);

  let newStatus = "Issued";
  if (allFullyReceived) newStatus = "Received";
  else if (anyReceived) newStatus = "Partially Received";

  // updatePurchaseOrderStatus already scoped internally
  await updatePurchaseOrderStatus(poId, newStatus, context);
}