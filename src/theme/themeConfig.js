// src/theme/themeConfig.js
export const themeConfig = {
  token: {
    colorPrimary: '#2563eb',          // your primary blue
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    borderRadius: 6,
    fontFamily: `'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    colorBgLayout: '#f5f7fa',        // background for layout body
    colorBgContainer: '#ffffff',     // background for cards/tables
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#001529',
    },
    Menu: {
      darkItemBg: '#001529',
      darkItemSelectedBg: '#2563eb',
    },
  },
};