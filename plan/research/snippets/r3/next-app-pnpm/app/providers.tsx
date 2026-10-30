"use client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
const theme = createTheme({ cssVariables: { colorSchemeSelector: "class" }, colorSchemes: { light: true, dark: true }, palette: { primary: { main: "#2F5597" } } });
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme} defaultMode="light">
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
