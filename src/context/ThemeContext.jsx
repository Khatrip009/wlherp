// src/context/ThemeContext.jsx
import { createContext, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "./OrganizationContext";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const { org } = useOrg();

  const { data: theme, isLoading } = useQuery({
    queryKey: ["theme", org?.id],
    queryFn: async () => {
      if (!org?.id) return null;
      const { data } = await supabase
        .from("themes")
        .select("*")
        .eq("org_id", org.id)
        .maybeSingle();       // ← returns null if no row
      return data;
    },
    enabled: !!org?.id,
    staleTime: Infinity,
  });

  // Apply theme CSS variables only if a theme was returned
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    root.style.setProperty("--color-primary", theme.primary_color);
    root.style.setProperty("--color-primary-light", theme.primary_light_color);
    root.style.setProperty("--color-primary-dark", theme.primary_dark_color);
    root.style.setProperty("--color-accent", theme.accent_color);
    root.style.setProperty("--color-accent-light", theme.accent_light_color);
    root.style.setProperty("--color-accent-dark", theme.accent_dark_color);
    root.style.setProperty("--font-heading", theme.font_heading);
    root.style.setProperty("--font-body", theme.font_body);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}