// This file is intentionally empty.
// The QueryClient is configured and provided in src/main.jsx.
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async () => {
        // This default will be used when no queryFn is provided.
        // You can throw a meaningful error, or just return null.
        throw new Error("Missing queryFn – add it to your useQuery hook.");
      },
      staleTime: 30_000,   // optional, but a good default
    },
  },
});

export default queryClient;