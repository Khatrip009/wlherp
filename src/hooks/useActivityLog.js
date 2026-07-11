import { supabase } from '../api/supabase';

export function useActivityLog() {
  const log = async (action, { entityType, entityId, details } = {}) => {
    try {
      await supabase.rpc('log_activity', {
        p_action: action,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_details: details,
      });
    } catch (err) {
      console.error('Activity log error:', err);
    }
  };
  return { log };
}