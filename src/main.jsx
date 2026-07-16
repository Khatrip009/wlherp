// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/ThemeContext";
import { OrganizationProvider } from "./context/OrganizationContext";
import { ScopeProvider } from "./context/ScopeContext";
import { Toaster } from "react-hot-toast";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import AntThemeWrapper from "./components/AntThemeWrapper";   // ← new import
import { App as AntApp } from 'antd';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <OrganizationProvider>
            <ScopeProvider>
              <ThemeProvider>
                <AntThemeWrapper>  
                   <AntApp>      {/* ← wraps ConfigProvider around the app */}
                  <Toaster position="top-right" />
                  <App />
                  </AntApp>
                </AntThemeWrapper>
              </ThemeProvider>
            </ScopeProvider>
          </OrganizationProvider>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>
);