// src/components/FeeStructureForm.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../api/supabase';
import { useOrg } from '../context/OrganizationContext';
import toast from 'react-hot-toast';
import { X, Plus, Trash2 } from 'lucide-react';

export default function FeeStructureForm({ isOpen, onClose, onSuccess, initialData = null }) {
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [form, setForm] = useState({
    course_id: '',
    installment_allowed: false,
  });

  const [components, setComponents] = useState([
    { component_name: '', amount: '', tax_rate_id: '' },
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
      }));
      setComponents(comps.length ? comps : [{ component_name: '', amount: '', tax_rate_id: '' }]);
    } else {
      setForm({ course_id: '', installment_allowed: false });
      setComponents([{ component_name: '', amount: '', tax_rate_id: '' }]);
    }
  }, [initialData]);

  // Fetch dropdown data when modal opens and branch/FY are ready
  useEffect(() => {
    if (!isOpen || !branchId || !financialYearId) return;
    fetchData();
  }, [isOpen, branchId, financialYearId]);

  const fetchData = async () => {
    // Conditionally scope courses & tax rates to current branch & FY
    let coursesQuery = supabase
      .from('courses')
      .select('id, course_name')
      .eq('status', true);
    if (branchId) coursesQuery = coursesQuery.eq('branch_id', branchId);
    if (financialYearId) coursesQuery = coursesQuery.eq('financial_year_id', financialYearId);

    let taxQuery = supabase
      .from('tax_rates')
      .select('id, name, rate')
      .eq('is_active', true);
    if (branchId) taxQuery = taxQuery.eq('branch_id', branchId);
    if (financialYearId) taxQuery = taxQuery.eq('financial_year_id', financialYearId);

    const [coursesRes, taxRes] = await Promise.all([coursesQuery, taxQuery]);
    setCourses(coursesRes.data || []);
    setTaxRates(taxRes.data || []);
  };

  const handleCourseChange = (e) => {
    setForm({ ...form, course_id: e.target.value });
  };

  const handleInstallmentChange = (e) => {
    setForm({ ...form, installment_allowed: e.target.checked });
  };

  const handleComponentChange = (index, field, value) => {
    const updated = [...components];
    updated[index][field] = value;
    setComponents(updated);
  };

  const addComponent = () => {
    setComponents([...components, { component_name: '', amount: '', tax_rate_id: '' }]);
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
      const totalFee = components.reduce((sum, c) => sum + parseFloat(c.amount), 0);

      const feeStructurePayload = {
        course_id: form.course_id,
        fee_amount: totalFee,
        installment_allowed: form.installment_allowed,
        tax_rate_id: null,
        tax_inclusive: false,
        branch_id: branchId,
        financial_year_id: financialYearId,
      };

      let feeStructureId;
      if (initialData?.id) {
        const { data: updated, error: updateError } = await supabase
          .from('fee_structures')
          .update(feeStructurePayload)
          .eq('id', initialData.id)
          .select()
          .single();
        if (updateError) throw updateError;
        feeStructureId = initialData.id;

        // Delete old components – scoped to prevent cross-branch tampering
        let deleteQuery = supabase
          .from('fee_structure_components')
          .delete()
          .eq('fee_structure_id', initialData.id);
        if (branchId) deleteQuery = deleteQuery.eq('branch_id', branchId);
        if (financialYearId) deleteQuery = deleteQuery.eq('financial_year_id', financialYearId);
        await deleteQuery;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('fee_structures')
          .insert([feeStructurePayload])
          .select()
          .single();
        if (insertError) throw insertError;
        feeStructureId = inserted.id;
      }

      // Insert new components with branch and FY
      const componentInserts = components.map((comp, idx) => ({
        fee_structure_id: feeStructureId,
        component_name: comp.component_name.trim(),
        amount: parseFloat(comp.amount),
        tax_rate_id: comp.tax_rate_id || null,
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
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
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
                <div key={idx} className="grid grid-cols-5 gap-2 items-center border p-2 rounded">
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
            <span className="text-sm font-medium text-secondary-dark">Total Fee: </span>
            <span className="text-lg font-bold text-primary">
              ₹{' '}
              {components
                .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)
                .toLocaleString('en-IN')}
            </span>
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