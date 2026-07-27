// src/context/ThemeContext.jsx
import { createContext, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../api/supabase";
import { useOrg } from "./OrganizationContext";

const ThemeContext = createContext();

// Helper: generate a light tint (adds 20% opacity white)
function getLightTint(hex) {
  // For background uses, a low‑opacity version is perfect
  return hex + "20"; // ~12.5% opacity
}

export function ThemeProvider({ children }) {
  const { org } = useOrg();

  // Fetch theme for the current organisation (now always org 3)
  const { data: theme, isLoading } = useQuery({
    queryKey: ["theme", org?.id],
    queryFn: async () => {
      if (!org?.id) return null;
      const { data } = await supabase
        .from("themes")
        .select("*")
        .eq("org_id", org.id)
        .maybeSingle();
      return data;
    },
    enabled: !!org?.id,
    staleTime: Infinity,
  });

  // Apply all CSS variables as soon as the theme data arrives
  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;

    // Main colours (from database)
    root.style.setProperty("--theme-primary", theme.primary_color);
    root.style.setProperty("--theme-primary-light", theme.primary_light_color);
    root.style.setProperty("--theme-primary-dark", theme.primary_dark_color);
    root.style.setProperty("--theme-accent", theme.accent_color);
    root.style.setProperty("--theme-accent-light", theme.accent_light_color);
    root.style.setProperty("--theme-accent-dark", theme.accent_dark_color);

    // Computed light backgrounds (used by bg-primary-bg, etc.)
    root.style.setProperty("--theme-primary-bg", getLightTint(theme.primary_color));
    root.style.setProperty("--theme-accent-bg", getLightTint(theme.accent_color));

    // Fonts
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