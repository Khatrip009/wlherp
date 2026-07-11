import React, { useState } from 'react';
import { supabase } from '../api/supabase';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrganizationContext';   // NEW
import toast from 'react-hot-toast';

export default function CreateOnlineClass() {
  const { profile } = useAuth();
  const { branch, selectedFinancialYear } = useOrg();      // NEW

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [batchId, setBatchId] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch active batches for dropdown
  const [batches, setBatches] = useState([]);
  React.useEffect(() => {
    const fetchBatches = async () => {
      const { data } = await supabase
        .from('batches')
        .select('id, batch_name')
        .eq('status', 'active');
      setBatches(data || []);
    };
    fetchBatches();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !startTime || !batchId) {
      toast.error('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      // Generate a unique room name (using timestamp)
      const roomName = `class-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Get teacher ID from profile
      const { data: teacherData } = await supabase
        .from('teachers')
        .select('id')
        .eq('user_id', profile.id)
        .single();

      const { data, error } = await supabase
        .from('online_classes')
        .insert({
          title,
          description,
          start_time: startTime,
          duration_minutes: Number(duration),
          batch_id: batchId,
          teacher_id: teacherData?.id || null,
          room_name: roomName,
          status: 'scheduled',
          branch_id: branch?.id,                         // NEW
          financial_year_id: selectedFinancialYear?.id,  // NEW
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Class created!');
      // Optionally clear form
      setTitle('');
      setDescription('');
      setStartTime('');
      setDuration(60);
      setBatchId('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow">
      <h2 className="text-2xl font-bold mb-4">Create Online Class</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded p-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border rounded p-2"
            rows="3"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Start Time *</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full border rounded p-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Duration (minutes)</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full border rounded p-2"
            min="15"
            step="5"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Select Batch *</label>
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="w-full border rounded p-2"
            required
          >
            <option value="">-- Choose batch --</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batch_name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-white px-4 py-2 rounded hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Class'}
        </button>
      </form>
    </div>
  );
}