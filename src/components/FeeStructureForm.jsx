// src/components/FeeStructureForm.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { useOrg } from '../context/OrganizationContext';
import toast from 'react-hot-toast';
import { X, Plus, Trash2 } from 'lucide-react';

export default function FeeStructureForm({ isOpen, onClose, onSuccess, initialData = null }) {
  const { org, branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id ? Number(branch.id) : null;
  const financialYearId = selectedFinancialYear?.id ? Number(selectedFinancialYear.id) : null;
  const organizationId = org?.id;

  const [form, setForm] = useState({
    course_id: '',
    installment_allowed: false,
  });

  const [components, setComponents] = useState([
    { component_name: '', amount: '', tax_rate_id: '', is_taxable: true, tax_inclusive: true },
  ]);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState([]);
  const [taxRates, setTaxRates] = useState([]);

  // Reset form on modal open / initialData change
  useEffect(() => {
    if (initialData) {
      setForm({
        course_id: initialData.course_id || '',
        installment_allowed: initialData.installment_allowed || false,
      });
      const comps = (initialData.fee_structure_components || []).map((c) => ({
        component_name: c.component_name || '',
        amount: c.amount || '',
        tax_rate_id: c.tax_rate_id || '',
        is_taxable: c.is_taxable !== undefined ? c.is_taxable : true,
        tax_inclusive: c.tax_inclusive !== undefined ? c.tax_inclusive : true,
      }));
      setComponents(comps.length ? comps : [{ component_name: '', amount: '', tax_rate_id: '', is_taxable: true, tax_inclusive: true }]);
    } else {
      setForm({ course_id: '', installment_allowed: false });
      setComponents([{ component_name: '', amount: '', tax_rate_id: '', is_taxable: true, tax_inclusive: true }]);
    }
  }, [initialData]);

  useEffect(() => {
    if (!isOpen || !branchId || !financialYearId || !organizationId) return;
    fetchData();
  }, [isOpen, branchId, financialYearId, organizationId]);

  const fetchData = async () => {
    try {
      // Courses – now scoped by organization and filtered out soft-deleted
      let coursesQuery = supabase
        .from('courses')
        .select('id, course_name')
        .eq('status', true)
        .eq('organization_id', organizationId)
        .is('deleted_at', null);          // ✅ exclude soft-deleted

      if (financialYearId) coursesQuery = coursesQuery.eq('financial_year_id', financialYearId);

      // Tax rates – also scoped by organization (if the table supports it)
      let taxQuery = supabase
  .from('tax_rates')
  .select('id, name, rate')
  .eq('is_active', true)
  .eq('organization_id', organizationId);   // ✅ now org‑scoped

if (financialYearId) taxQuery = taxQuery.eq('financial_year_id', financialYearId);

      const [coursesRes, taxRes] = await Promise.all([coursesQuery, taxQuery]);
      setCourses(coursesRes.data || []);
      setTaxRates(taxRes.data || []);
    } catch (err) {
      toast.error('Failed to load dropdown data');
      console.error(err);
    }
  };

  const handleCourseChange = (e) => setForm({ ...form, course_id: e.target.value });
  const handleInstallmentChange = (e) => setForm({ ...form, installment_allowed: e.target.checked });

  const handleComponentChange = (index, field, value) => {
    const updated = [...components];
    updated[index][field] = value;
    setComponents(updated);
  };

  const addComponent = () => {
    setComponents([
      ...components,
      { component_name: '', amount: '', tax_rate_id: '', is_taxable: true, tax_inclusive: true },
    ]);
  };

  const removeComponent = (index) => {
    if (components.length === 1) {
      toast.error('At least one component is required');
      return;
    }
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!branchId || !financialYearId) {
      toast.error('Branch and Financial Year must be selected');
      return;
    }
    if (!form.course_id) {
      toast.error('Please select a course');
      return;
    }
    for (const comp of components) {
      if (!comp.component_name.trim() || !comp.amount) {
        toast.error('All components need a name and amount');
        return;
      }
      if (isNaN(parseFloat(comp.amount)) || parseFloat(comp.amount) <= 0) {
        toast.error(`Invalid amount for "${comp.component_name}"`);
        return;
      }
    }

    setLoading(true);
    try {
      const courseId = Number(form.course_id);
      const totalFee = components.reduce((sum, c) => sum + parseFloat(c.amount), 0);

      const feeStructurePayload = {
        course_id: courseId,
        fee_amount: totalFee,
        installment_allowed: form.installment_allowed,
        tax_rate_id: null,
        branch_id: branchId,
        financial_year_id: financialYearId,
      };

      let feeStructureId;

      if (initialData?.id) {
        // UPDATE MODE – check if already assigned to students
        const { data: existingComponents } = await supabase
          .from('fee_structure_components')
          .select('id')
          .eq('fee_structure_id', initialData.id)
          .eq('branch_id', branchId)
          .eq('financial_year_id', financialYearId);

        if (existingComponents && existingComponents.length > 0) {
          const componentIds = existingComponents.map(c => c.id);
          const { data: linkedFees, error: linkError } = await supabase
            .from('student_fee_components')
            .select('id')
            .in('fee_structure_component_id', componentIds)
            .limit(1);

          if (linkError) throw linkError;

          if (linkedFees && linkedFees.length > 0) {
            toast.error(
              'Cannot edit this fee structure because it is already assigned to students. Please create a new one instead.'
            );
            setLoading(false);
            return;
          }
        }

        // Update the fee_structure record
        const { error: updateError } = await supabase
          .from('fee_structures')
          .update(feeStructurePayload)
          .eq('id', initialData.id)
          .eq('branch_id', branchId)
          .eq('financial_year_id', financialYearId);
        if (updateError) throw updateError;
        feeStructureId = initialData.id;

        // Delete old components (safe now)
        const { error: deleteError } = await supabase
          .from('fee_structure_components')
          .delete()
          .eq('fee_structure_id', initialData.id)
          .eq('branch_id', branchId)
          .eq('financial_year_id', financialYearId);
        if (deleteError) throw deleteError;
      } else {
        // CREATE MODE
        const { data: inserted, error: insertError } = await supabase
          .from('fee_structures')
          .insert([feeStructurePayload])
          .select()
          .single();
        if (insertError) throw insertError;
        feeStructureId = inserted.id;
      }

      // Insert new components
      const componentInserts = components.map((comp, idx) => ({
        fee_structure_id: feeStructureId,
        component_name: comp.component_name.trim(),
        amount: parseFloat(comp.amount),
        tax_rate_id: comp.tax_rate_id ? Number(comp.tax_rate_id) : null,
        is_taxable: comp.is_taxable !== undefined ? comp.is_taxable : true,
        tax_inclusive: comp.tax_inclusive !== undefined ? comp.tax_inclusive : true,
        sort_order: idx,
        branch_id: branchId,
        financial_year_id: financialYearId,
      }));

      const { error: compError } = await supabase
        .from('fee_structure_components')
        .insert(componentInserts);
      if (compError) throw compError;

      toast.success(initialData?.id ? 'Fee structure updated!' : 'Fee structure created!');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Supabase error:', err);
      toast.error(err.message || 'An error occurred while saving');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalAmount = components.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-light px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-xl font-righteous text-primary-dark">
            {initialData?.id ? 'Edit Fee Structure' : 'New Fee Structure'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary-bg rounded-lg">
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Course *</label>
            <select
              value={form.course_id}
              onChange={handleCourseChange}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            >
              <option value="">Select Course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="installment_allowed"
              checked={form.installment_allowed}
              onChange={handleInstallmentChange}
              className="rounded accent-primary h-4 w-4"
            />
            <label htmlFor="installment_allowed" className="text-sm font-montserrat text-secondary-dark">
              Allow Installments
            </label>
          </div>

          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-2">Fee Components</label>
            <div className="space-y-3">
              {components.map((comp, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-center border p-3 rounded">
                  <input
                    type="text"
                    placeholder="Name"
                    value={comp.component_name}
                    onChange={(e) => handleComponentChange(idx, 'component_name', e.target.value)}
                    className="col-span-2 border rounded p-2 text-sm"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={comp.amount}
                    onChange={(e) => handleComponentChange(idx, 'amount', e.target.value)}
                    className="col-span-1 border rounded p-2 text-sm"
                    required
                  />
                  <select
                    value={comp.tax_rate_id}
                    onChange={(e) => handleComponentChange(idx, 'tax_rate_id', e.target.value)}
                    className="col-span-1 border rounded p-2 text-sm"
                  >
                    <option value="">No Tax</option>
                    {taxRates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.rate}%)
                      </option>
                    ))}
                  </select>
                  <div className="col-span-1 flex items-center gap-1">
                    <label className="text-xs whitespace-nowrap">Incl.</label>
                    <input
                      type="checkbox"
                      checked={comp.tax_inclusive !== false}
                      onChange={(e) => handleComponentChange(idx, 'tax_inclusive', e.target.checked)}
                      className="rounded accent-primary h-4 w-4"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeComponent(idx)}
                    className="text-red-500 justify-self-end"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addComponent}
              className="text-primary text-sm mt-2 flex items-center gap-1"
            >
              <Plus size={16} /> Add Component
            </button>
          </div>

          <div className="border-t pt-3 text-right">
            <span className="text-sm font-medium text-secondary-dark">
              Total Fee:
            </span>
            <span className="text-lg font-bold text-primary ml-2">
              ₹ {totalAmount.toLocaleString('en-IN')}
            </span>
            <div className="text-xs text-gray-500 mt-1">
              * Tax handling per component (Inclusive/Exclusive)
            </div>
          </div>

          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-60"
            >
              {loading ? 'Saving...' : initialData?.id ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto border border-secondary-light text-secondary-dark hover:bg-secondary-bg px-6 py-2.5 rounded-lg font-montserrat transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}