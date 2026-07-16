// src/hooks/useStudentId.js
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useAuth } from "../context/AuthContext";

export function useStudentId() {
  const { user } = useAuth();

  const { data: studentId, isLoading, error } = useQuery({
    queryKey: ["student-id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle(); // ✅ prevents 406 when no row exists

      if (error) throw error;
      return data?.id || null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return { studentId, isLoading, error };
}