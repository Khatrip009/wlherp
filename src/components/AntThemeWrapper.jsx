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
    colorSuccess: theme?.accent_color || themeConfig.token.colorSuccess,   // or add a success color in your DB
    colorError: theme?.accent_color || themeConfig.token.colorError,       // adjust as needed
    colorWarning: "#faad14",              // static fallback
    colorInfo: theme?.primary_light_color || themeConfig.token.colorInfo,
    fontFamily: theme?.font_body || themeConfig.token.fontFamily,
    // Add more token overrides if you store them in your `themes` table.
    // e.g., borderRadius, etc.
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