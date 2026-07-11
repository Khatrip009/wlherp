import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import toast from "react-hot-toast";

export function useListQuery(queryKey, fetchFn, createFn, updateFn, deleteFn) {
  const queryClient = useQueryClient();

  const { data = [], isLoading, error } = useQuery({
    queryKey: [queryKey],
    queryFn: fetchFn,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (error) toast.error(`Failed to load ${queryKey}`);
  }, [error, queryKey]);

  const createMutation = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success(`${queryKey} created`);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: () => toast.error(`Failed to create ${queryKey}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateFn(id, payload),
    onSuccess: () => {
      toast.success(`${queryKey} updated`);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: () => toast.error(`Failed to update ${queryKey}`),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      toast.success(`${queryKey} deleted`);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: () => toast.error(`Failed to delete ${queryKey}`),
  });

  return {
    data,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}