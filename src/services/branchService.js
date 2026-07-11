// src/services/branchService.js
import { supabase } from "../api/supabase";

/**
 * Fetch all active branches for the current organisation.
 * The RLS policy ensures the user only sees their own organisation’s branches.
 */
export async function getBranches() {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("is_active", true)
    .order("branch_name");
  if (error) throw error;
  return data || [];
}

/**
 * Get a single branch by ID.
 */
export async function getBranch(id) {
  const { data, error } = await supabase
    .from("branches")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Create a new branch under the current organisation.
 * @param {Object} branchData - { branch_name, address, city, state, pincode, phone, email }
 * @param {number} organizationId - The current organisation ID (from context or get_user_org())
 */
export async function createBranch(branchData, organizationId) {
  // The organisation_id is set by the backend via RLS or explicitly provided.
  // We pass it so the form context is clear; RLS will enforce it anyway.
  const { data, error } = await supabase
    .from("branches")
    .insert([{ ...branchData, organization_id: organizationId }])
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("A branch with this name already exists in your organisation.");
    }
    throw error;
  }
  return data;
}

/**
 * Update an existing branch.
 * @param {number} branchId
 * @param {Object} updates - Fields to update (branch_name, address, etc.)
 */
export async function updateBranch(branchId, updates) {
  const { data, error } = await supabase
    .from("branches")
    .update(updates)
    .eq("id", branchId)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("A branch with this name already exists in your organisation.");
    }
    throw error;
  }
  return data;
}

/**
 * Soft‑delete a branch by setting is_active = false.
 */
export async function deleteBranch(branchId) {
  const { error } = await supabase
    .from("branches")
    .update({ is_active: false })
    .eq("id", branchId);
  if (error) throw error;
}