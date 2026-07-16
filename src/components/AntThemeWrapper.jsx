// src/components/AntThemeWrapper.jsx
import { ConfigProvider } from "antd";
import { useTheme } from "../context/ThemeContext";
import { themeConfig } from "../theme/themeConfig";   // your base token file

export default function AntThemeWrapper({ children }) {
  const { theme } = useTheme();

  // Build Ant Design token overrides from your custom theme.
  // Use fallbacks if theme hasn't loaded yet.
  const dynamicToken = {
    colorPrimary: theme?.primary_color || themeConfig.token.colorPrimary,
    colorSuccess: "#10b981",                  // static fallback – add a success_color field later if needed
    colorError: "#ef4444",                    // static fallback
    colorWarning: "#faad14",                  // static fallback
    colorInfo: theme?.primary_light_color || themeConfig.token.colorInfo,
    fontFamily: theme?.font_body || themeConfig.token.fontFamily,
    // Add more token overrides if you store them in your `themes` table.
    // e.g., borderRadius, colorBgLayout, etc.
  };

  // Merge your static config with the dynamic token overrides
  const mergedConfig = {
    ...themeConfig,
    token: {
      ...themeConfig.token,
      ...dynamicToken,
    },
  };

  return <ConfigProvider theme={mergedConfig}>{children}</ConfigProvider>;
}