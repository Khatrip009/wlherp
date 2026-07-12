// src/pages/InvoiceForm.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import {
  getInvoice,
  createInvoice,
  updateInvoice,
  finalizeInvoice,
} from "../services/invoiceService";
import { getOrganization } from "../services/organizationService";
import { getTaxRates } from "../services/feeService";
import toast from "react-hot-toast";
import AdminLayout from "../layouts/AdminLayout";
import { ArrowLeft, Save, Plus, Trash2, CheckCircle, Loader } from "lucide-react";
import GSTLookup from "../components/GSTLookup";
import { useOrg } from "../context/OrganizationContext";   // NEW

// Helper to split GST
const splitGST = (rate, placeOfSupply, orgState) => {
  if (!rate) return { cgst: 0, sgst: 0, igst: 0 };
  if (placeOfSupply === orgState) {
    const half = rate / 2;
    return { cgst: half, sgst: half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: rate };
};

export default function InvoiceForm() {
  const { id } = useParams();
  const isEditing = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Branch & Financial Year context ──
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;
  const ctx = { branchId, financialYearId };

  const [form, setForm] = useState({
    student_id: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    payment_terms: "",
    gst_applicable: false,
    place_of_supply: "",
    reverse_charge: false,
  });
  const [items, setItems] = useState([
    {
      item_type: "fee_structure",
      item_id: "",
      description: "",
      hsn_sac_code: "",
      quantity: 1,
      unit_price: 0,
      tax_rate_id: "",
    },
  ]);
  const [studentDetails, setStudentDetails] = useState(null);
  const [orgState, setOrgState] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch organization state
  const { data: org } = useQuery({
    queryKey: ["organization", branchId, financialYearId], // not strictly needed but good for consistency
    queryFn: () => getOrganization(branchId, financialYearId), // if organizationService accepts, else keep original; but getOrganization is org-wide
    enabled: !!branchId && !!financialYearId,
  });

  useEffect(() => {
    if (org?.state_code) setOrgState(org.state_code);
  }, [org]);

  // ── STUDENTS DROPDOWN (scoped) ──
  const {
    data: students = [],
    error: studentsError,
    isLoading: studentsLoading,
  } = useQuery({
    queryKey: ["students-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, gstin, state_code");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      try {
        // Check if 'status' column exists
        const { data: check } = await supabase
          .from("students")
          .select("status")
          .limit(1);
        query = query.ilike("status", "active");
      } catch (e) {
        // column missing, fetch all
        console.warn("Status column not found, fetching all students", e);
      }

      query = query.order("first_name");

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (studentsError) console.error("Error loading students:", studentsError);
  }, [studentsError]);

  // Fetch tax rates – scoped
  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates-invoice", branchId, financialYearId],
    queryFn: () => getTaxRates(branchId, financialYearId),
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch fee structures – scoped
  const { data: feeStructures = [] } = useQuery({
    queryKey: ["fee-structures-dropdown", branchId, financialYearId],
    queryFn: async () => {
      let query = supabase
        .from("fee_structures")
        .select("id, fee_amount, courses(course_name), tax_rate_id");

      if (branchId) query = query.eq("branch_id", branchId);
      if (financialYearId) query = query.eq("financial_year_id", financialYearId);

      query = query.order("id");
      const { data } = await query;
      return data || [];
    },
    enabled: !!branchId && !!financialYearId,
    staleTime: 5 * 60 * 1000,
  });

  // Load existing invoice if editing – scoped
  const { data: invoice, isLoading: loadingInvoice } = useQuery({
    queryKey: ["invoice", id, branchId, financialYearId],
    queryFn: () => getInvoice(id, branchId, financialYearId),
    enabled: isEditing && !!branchId && !!financialYearId,
  });

  useEffect(() => {
    if (invoice) {
      setForm({
        student_id: invoice.student_id || "",
        invoice_date: invoice.invoice_date || new Date().toISOString().split("T")[0],
        due_date: invoice.due_date || "",
        payment_terms: invoice.payment_terms || "",
        gst_applicable: invoice.gst_applicable || false,
        place_of_supply: invoice.place_of_supply || "",
        reverse_charge: invoice.reverse_charge || false,
      });
      if (invoice.invoice_items?.length) {
        setItems(
          invoice.invoice_items.map((item) => ({
            id: item.id,
            item_type: item.item_type || "fee_structure",
            item_id: item.item_id || "",
            description: item.description || "",
            hsn_sac_code: item.hsn_sac_code || "",
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            tax_rate_id: item.tax_rate_id || "",
          }))
        );
      }
      if (invoice.student_id) {
        const student = students.find((s) => s.id === invoice.student_id);
        if (student) setStudentDetails(student);
      }
    }
  }, [invoice, students]);

  // Handle student selection
  const handleStudentChange = (studentId) => {
    const student = students.find((s) => s.id === Number(studentId));
    setForm((prev) => ({
      ...prev,
      student_id: studentId,
      place_of_supply: student?.state_code || prev.place_of_supply,
      gst_applicable: !!student?.gstin,
    }));
    setStudentDetails(student || null);
  };

  // Auto-fill from GST lookup for student
  const handleGSTLookupSuccess = (data) => {
    if (studentDetails) {
      const updatedStudent = {
        ...studentDetails,
        legal_business_name: data.legal_name || studentDetails.legal_business_name,
        state_code: data.state_code || studentDetails.state_code,
        billing_address: data.address || studentDetails.billing_address,
        trade_name: data.trade_name || studentDetails.trade_name,
      };
      setStudentDetails(updatedStudent);
      setForm((prev) => ({
        ...prev,
        place_of_supply: data.state_code || prev.place_of_supply,
      }));
      toast.success("Student GST details updated");
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        item_type: "fee_structure",
        item_id: "",
        description: "",
        hsn_sac_code: "",
        quantity: 1,
        unit_price: 0,
        tax_rate_id: "",
      },
    ]);
  };

  const removeItem = (index) => {
    if (items.length === 1) {
      toast.error("At least one item is required");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
  };

  const handleFeeStructureSelect = (index, feeStructureId) => {
    const fs = feeStructures.find((f) => f.id === Number(feeStructureId));
    if (fs) {
      const updated = [...items];
      updated[index].item_id = fs.id;
      updated[index].description = fs.courses?.course_name || "";
      updated[index].unit_price = fs.fee_amount || 0;
      updated[index].tax_rate_id = fs.tax_rate_id || "";
      setItems(updated);
    }
  };

  // Compute totals
  const computeTotals = () => {
    let taxableTotal = 0;
    let totalGST = 0;
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;
    let totalAmount = 0;

    items.forEach((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      const taxable = qty * price;
      taxableTotal += taxable;

      const taxRate = taxRates.find((t) => t.id === Number(item.tax_rate_id));
      let rate = taxRate?.rate || 0;
      const place = form.place_of_supply || orgState;
      const split = splitGST(rate, place, orgState);
      const cgst = (taxable * split.cgst) / 100;
      const sgst = (taxable * split.sgst) / 100;
      const igst = (taxable * split.igst) / 100;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      totalGST += cgst + sgst + igst;
      totalAmount += taxable + cgst + sgst + igst;
    });

    const roundOff = Math.round(totalAmount) - totalAmount;
    const grandTotal = totalAmount + roundOff;

    return {
      taxableTotal,
      totalGST,
      totalCgst,
      totalSgst,
      totalIgst,
      totalAmount,
      roundOff,
      grandTotal,
    };
  };

  const totals = computeTotals();

  // Mutations – pass context (branchId & financialYearId)
  const createMutation = useMutation({
    mutationFn: (payload) => createInvoice(payload, ctx),
    onSuccess: (data) => {
      toast.success("Invoice created");
      queryClient.invalidateQueries(["invoices"]);
      navigate(`/invoices/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateInvoice(id, payload, ctx),
    onSuccess: (data) => {
      toast.success("Invoice updated");
      queryClient.invalidateQueries(["invoices"]);
      navigate(`/invoices/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const finalizeMutation = useMutation({
    mutationFn: (id) => finalizeInvoice(id, ctx),
    onSuccess: () => {
      toast.success("Invoice finalized");
      queryClient.invalidateQueries(["invoices"]);
      navigate("/invoices");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = async (e, finalize = false) => {
    e.preventDefault();
    setSaving(true);

    if (!form.student_id) {
      toast.error("Please select a student");
      setSaving(false);
      return;
    }
    if (items.some((item) => !item.description || !item.quantity || !item.unit_price)) {
      toast.error("All items must have description, quantity, and price");
      setSaving(false);
      return;
    }

    const payload = {
      student_id: form.student_id,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      payment_terms: form.payment_terms || "",
      gst_applicable: form.gst_applicable,
      place_of_supply: form.place_of_supply || orgState,
      reverse_charge: form.reverse_charge || false,
      items: items.map((item) => ({
        item_type: item.item_type,
        item_id: item.item_id || null,
        description: item.description,
        hsn_sac_code: item.hsn_sac_code || null,
        quantity: parseFloat(item.quantity) || 1,
        unit_price: parseFloat(item.unit_price) || 0,
        tax_rate_id: item.tax_rate_id || null,
      })),
    };

    try {
      let result;
      if (isEditing) {
        result = await updateMutation.mutateAsync({ id, payload });
      } else {
        result = await createMutation.mutateAsync(payload);
      }
      if (finalize) {
        await finalizeMutation.mutateAsync(result.id);
      }
    } catch (err) {
      // error handled by mutation
    } finally {
      setSaving(false);
    }
  };

  if (loadingInvoice) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">Loading invoice…</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <button
        onClick={() => navigate("/invoices")}
        className="inline-flex items-center gap-2 text-secondary hover:text-primary-dark mb-4 text-sm"
      >
        <ArrowLeft size={18} /> Back to Invoices
      </button>

      <h1 className="text-3xl font-righteous text-primary-dark mb-6">
        {isEditing ? "Edit Invoice" : "New Invoice"}
      </h1>

      <form className="bg-white rounded-xl shadow-sm p-6 space-y-6">
        {/* Header fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Student *
            </label>
            <select
              value={form.student_id}
              onChange={(e) => handleStudentChange(e.target.value)}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
              required
            >
              <option value="">Select Student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} ({s.admission_no})
                </option>
              ))}
            </select>
            {studentsLoading && <p className="text-xs text-gray-500 mt-1">Loading students...</p>}
            {studentsError && <p className="text-xs text-red-500 mt-1">Error loading students</p>}
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Invoice Date
            </label>
            <input
              type="date"
              value={form.invoice_date}
              onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Payment Terms
            </label>
            <input
              type="text"
              value={form.payment_terms}
              onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
              placeholder="e.g. 15 days"
            />
          </div>
        </div>

        {/* GST details */}
        {studentDetails && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-700">Student GST Details</p>
                {studentDetails.legal_business_name && (
                  <p className="text-sm">Legal Name: {studentDetails.legal_business_name}</p>
                )}
                {studentDetails.gstin && (
                  <p className="text-sm">GSTIN: {studentDetails.gstin}</p>
                )}
                {studentDetails.state_code && (
                  <p className="text-sm">State: {studentDetails.state_code}</p>
                )}
                {studentDetails.billing_address && (
                  <p className="text-sm">Address: {studentDetails.billing_address}</p>
                )}
                {!studentDetails.gstin && (
                  <p className="text-sm text-gray-500">No GSTIN – B2C customer</p>
                )}
              </div>
              {studentDetails.gstin && (
                <GSTLookup
                  gstin={studentDetails.gstin}
                  onSuccess={handleGSTLookupSuccess}
                  buttonText="Refresh GST Details"
                  className="flex-shrink-0"
                />
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">
              Place of Supply
            </label>
            <select
              value={form.place_of_supply}
              onChange={(e) => setForm({ ...form, place_of_supply: e.target.value })}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary"
            >
              <option value="">Default (Student State)</option>
              {students.find((s) => s.id === Number(form.student_id))?.state_code && (
                <option value={students.find((s) => s.id === Number(form.student_id)).state_code}>
                  Student State: {students.find((s) => s.id === Number(form.student_id)).state_code}
                </option>
              )}
              <option value={orgState}>Organization State: {orgState}</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.gst_applicable}
                onChange={(e) => setForm({ ...form, gst_applicable: e.target.checked })}
                className="rounded text-primary"
              />
              GST Applicable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.reverse_charge}
                onChange={(e) => setForm({ ...form, reverse_charge: e.target.checked })}
                className="rounded text-primary"
              />
              Reverse Charge
            </label>
          </div>
        </div>

        {/* Items table */}
        <div>
          <h3 className="text-lg font-semibold text-secondary-dark mb-3">Items</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left text-sm">Type</th>
                  <th className="p-2 text-left text-sm">Description</th>
                  <th className="p-2 text-left text-sm">HSN/SAC</th>
                  <th className="p-2 text-right text-sm">Qty</th>
                  <th className="p-2 text-right text-sm">Unit Price</th>
                  <th className="p-2 text-left text-sm">Tax Rate</th>
                  <th className="p-2 text-center text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <select
                        value={item.item_type}
                        onChange={(e) => updateItem(idx, "item_type", e.target.value)}
                        className="w-full border rounded p-1 text-sm"
                      >
                        <option value="fee_structure">Fee Structure</option>
                        <option value="product">Product</option>
                        <option value="service">Service</option>
                      </select>
                    </td>
                    <td className="p-2">
                      {item.item_type === "fee_structure" ? (
                        <select
                          value={item.item_id}
                          onChange={(e) => handleFeeStructureSelect(idx, e.target.value)}
                          className="w-full border rounded p-1 text-sm"
                        >
                          <option value="">Select Fee</option>
                          {feeStructures.map((fs) => (
                            <option key={fs.id} value={fs.id}>
                              {fs.courses?.course_name} (₹{fs.fee_amount})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          className="w-full border rounded p-1 text-sm"
                          placeholder="Description"
                        />
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={item.hsn_sac_code}
                        onChange={(e) => updateItem(idx, "hsn_sac_code", e.target.value)}
                        className="w-full border rounded p-1 text-sm"
                        placeholder="HSN/SAC"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        className="w-16 border rounded p-1 text-sm text-right"
                        min="1"
                        step="1"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                        className="w-24 border rounded p-1 text-sm text-right"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={item.tax_rate_id}
                        onChange={(e) => updateItem(idx, "tax_rate_id", e.target.value)}
                        className="w-full border rounded p-1 text-sm"
                      >
                        <option value="">No Tax</option>
                        {taxRates.map((tr) => (
                          <option key={tr.id} value={tr.id}>
                            {tr.name} ({tr.rate}%)
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 text-primary text-sm flex items-center gap-1"
          >
            <Plus size={16} /> Add Item
          </button>
        </div>

        {/* Totals */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-end">
            <div className="w-72 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Taxable Amount:</span>
                <span className="font-medium">₹ {totals.taxableTotal.toFixed(2)}</span>
              </div>
              {totals.totalCgst > 0 && (
                <div className="flex justify-between text-sm">
                  <span>CGST:</span>
                  <span>₹ {totals.totalCgst.toFixed(2)}</span>
                </div>
              )}
              {totals.totalSgst > 0 && (
                <div className="flex justify-between text-sm">
                  <span>SGST:</span>
                  <span>₹ {totals.totalSgst.toFixed(2)}</span>
                </div>
              )}
              {totals.totalIgst > 0 && (
                <div className="flex justify-between text-sm">
                  <span>IGST:</span>
                  <span>₹ {totals.totalIgst.toFixed(2)}</span>
                </div>
              )}
              {totals.totalGST > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Total GST:</span>
                  <span>₹ {totals.totalGST.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Total:</span>
                <span className="font-medium">₹ {totals.totalAmount.toFixed(2)}</span>
              </div>
              {totals.roundOff !== 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Round Off:</span>
                  <span>₹ {totals.roundOff.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-1">
                <span>Grand Total:</span>
                <span className="text-primary">₹ {totals.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => navigate("/invoices")}
            className="border border-secondary-light px-4 py-2 rounded-lg text-sm hover:bg-secondary-bg transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, false)}
            disabled={saving}
            className="bg-primary text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50"
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save size={16} />}
            {isEditing ? "Update Draft" : "Save Draft"}
          </button>
          {(!isEditing || (isEditing && invoice?.status === "Draft")) && (
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition disabled:opacity-50"
            >
              {saving ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle size={16} />}
              Finalize
            </button>
          )}
        </div>
      </form>
    </AdminLayout>
  );
}