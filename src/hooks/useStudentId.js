import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../api/supabase";

export function useStudentId() {
  const { user } = useAuth();
  const { data: studentId, isLoading } = useQuery({
    queryKey: ["student-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .single();
      return data?.id || null;
    },
    enabled: !!user?.id,
  });
  return { studentId, isLoading };
}