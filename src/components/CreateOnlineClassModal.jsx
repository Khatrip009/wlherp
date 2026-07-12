// src/components/OnlineClassModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrganizationContext';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';

export default function OnlineClassModal({ isOpen, onClose, onSuccess, initialData = null }) {
  const { profile } = useAuth();
  const { branch, selectedFinancialYear } = useOrg();
  const branchId = branch?.id;
  const financialYearId = selectedFinancialYear?.id;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [batchId, setBatchId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [batchTeachers, setBatchTeachers] = useState([]);

  const isEdit = !!initialData;
  const userRole = profile?.role?.toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isTeacher = userRole === 'teacher';

  // Fetch dropdown data – scoped
  useEffect(() => {
    if (!isOpen || !branchId || !financialYearId) return;

    const fetchData = async () => {
      // Batches for the current branch & FY
      const { data: batchesData } = await supabase
        .from('batches')
        .select('id, batch_name, course_id, courses(course_name)')
        .eq('status', 'active')
        .eq('branch_id', branchId)
        .eq('financial_year_id', financialYearId)
        .order('batch_name');
      setBatches(batchesData || []);

      // Teachers – admin sees all in the branch, teacher gets self
      if (isAdmin) {
        const { data: teachersData } = await supabase
          .from('teachers')
          .select('id, first_name, last_name, employee_code')
          .eq('status', 'active')
          .eq('branch_id', branchId)
          .eq('financial_year_id', financialYearId)
          .order('first_name');
        setTeachers(teachersData || []);
      } else if (isTeacher && profile?.id) {
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('id')
          .eq('user_id', profile.id)
          .eq('branch_id', branchId)
          .eq('financial_year_id', financialYearId)
          .maybeSingle();

        if (teacherData) {
          setTeacherId(teacherData.id);
        }
      }
    };

    fetchData();
  }, [isOpen, isAdmin, isTeacher, profile?.id, branchId, financialYearId]);

  // When batch changes, fetch batch_teachers (scoped)
  useEffect(() => {
    if (!batchId || !branchId || !financialYearId) {
      setBatchTeachers([]);
      if (!isAdmin) setTeacherId(''); // reset if not admin and no batch
      return;
    }

    const fetchBatchTeachers = async () => {
      const { data } = await supabase
        .from('batch_teachers')
        .select('teacher_id, teachers(first_name, last_name, employee_code)')
        .eq('batch_id', batchId)
        .eq('branch_id', branchId)
        .eq('financial_year_id', financialYearId);

      const teachersList = data?.map(item => ({
        id: item.teacher_id,
        ...item.teachers,
      })) || [];
      setBatchTeachers(teachersList);

      // Auto-select teacher if applicable
      const currentId = teacherId ? parseInt(teacherId) : null;
      const stillExists = teachersList.some(t => t.id === currentId);
      if (currentId && !stillExists) {
        setTeacherId('');
      } else if (!currentId && !isAdmin && teachersList.length === 1) {
        setTeacherId(teachersList[0].id);
      }
    };

    fetchBatchTeachers();
  }, [batchId, isAdmin, teacherId, branchId, financialYearId]);

  // Populate form when editing
  useEffect(() => {
    if (isEdit && initialData) {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setStartTime(initialData.start_time ? new Date(initialData.start_time).toISOString().slice(0, 16) : '');
      setDuration(initialData.duration_minutes || 60);
      setBatchId(initialData.batch_id || '');
      setTeacherId(initialData.teacher_id || '');
    }
  }, [isEdit, initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !startTime || !batchId) {
      toast.error('Please fill all required fields');
      return;
    }
    if (!teacherId) {
      toast.error('Please select a teacher');
      return;
    }

    setLoading(true);
    try {
      const context = {
        branch_id: branchId,
        financial_year_id: financialYearId,
      };

      if (isEdit) {
        const { data, error } = await supabase
          .from('online_classes')
          .update({
            title,
            description,
            start_time: startTime,
            duration_minutes: Number(duration),
            batch_id: batchId,
            teacher_id: Number(teacherId),
            ...context,
          })
          .eq('id', initialData.id)
          .select()
          .single();
        if (error) throw error;
        toast.success('Class updated!');
      } else {
        const roomName = `Room-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const { data, error } = await supabase
          .from('online_classes')
          .insert({
            title,
            description,
            start_time: startTime,
            duration_minutes: Number(duration),
            batch_id: batchId,
            teacher_id: Number(teacherId),
            room_name: roomName,
            status: 'scheduled',
            ...context,
          })
          .select()
          .single();
        if (error) throw error;
        toast.success('Class created!');
      }

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
            {isEdit ? 'Edit Online Class' : 'Create Online Class'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary-bg rounded-lg">
            <X size={20} className="text-secondary-dark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Start Time *</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Duration (minutes)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min="15"
              step="5"
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Select Batch *</label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
              required
            >
              <option value="">-- Choose batch --</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name} ({b.courses?.course_name || 'N/A'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-montserrat text-secondary-dark mb-1">Teacher *</label>
            {isAdmin ? (
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="w-full border border-secondary-light rounded p-2.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                required
              >
                <option value="">Select teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.first_name} {t.last_name} ({t.employee_code})
                  </option>
                ))}
              </select>
            ) : isTeacher ? (
              <input
                type="text"
                value={
                  batchTeachers.find(t => t.id === parseInt(teacherId))?.first_name ||
                  teachers.find(t => t.id === parseInt(teacherId))?.first_name ||
                  'You'
                }
                className="w-full border border-secondary-light rounded p-2.5 bg-gray-100"
                disabled
              />
            ) : (
              <input
                type="text"
                value="Not available"
                className="w-full border border-secondary-light rounded p-2.5 bg-gray-100"
                disabled
              />
            )}
          </div>

          <div className="flex flex-col sm:flex-row-reverse gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto bg-primary hover:bg-primary-light text-white px-6 py-2.5 rounded-lg font-montserrat transition disabled:opacity-60"
            >
              {loading ? 'Saving...' : (isEdit ? 'Update Class' : 'Create Class')}
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