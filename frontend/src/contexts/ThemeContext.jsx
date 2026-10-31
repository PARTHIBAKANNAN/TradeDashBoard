import React, { createContext, useContext, useEffect, useState, useMemo } from "react";

const STORAGE_KEY = "td-theme"; // kept in sync with index.html's inline FOUC script
const CHART_THEME_KEY = "td-chart-theme";
const CHART_CUSTOM_COLORS_KEY = "td-chart-custom-colors";

export const CHART_PALETTES = {
  classic: {
    id: "classic",
    name: "Classic TradingView",
    desc: "Forest Emerald & Crimson Red",
    upColor: "#089981",
    downColor: "#f23645",
    bgColor: "transparent",
    gridColor: "rgba(255, 255, 255, 0.06)",
  },
  cyber: {
    id: "cyber",
    name: "Cyber Neon",
    desc: "High-voltage Cyan & Neon Magenta",
    upColor: "#00f5d4",
    downColor: "#f72585",
    bgColor: "transparent",
    gridColor: "rgba(0, 245, 212, 0.08)",
  },
  mint: {
    id: "mint",
    name: "Pastel Mint & Coral",
    desc: "Soft Mint Bull & Warm Coral Bear",
    upColor: "#2dd4bf",
    downColor: "#fb7185",
    bgColor: "transparent",
    gridColor: "rgba(255, 255, 255, 0.06)",
  },
  monochrome: {
    id: "monochrome",
    name: "Monochrome Institutional",
    desc: "Clean White Bull & Slate Bear",
    upColor: "#f8fafc",
    downColor: "#64748b",
    bgColor: "transparent",
    gridColor: "rgba(255, 255, 255, 0.05)",
  },
};

const DEFAULT_CUSTOM_COLORS = {
  upColor: "#10b981",
  downColor: "#ef4444",
  bgColor: "#090d16",
  gridColor: "rgba(255, 255, 255, 0.06)",
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // App Theme: "obsidian" | "oled" | "light" | "cyber"
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "theme-light") return "light";
    if (saved === "oled" || saved === "theme-oled") return "oled";
    if (saved === "cyber" || saved === "theme-cyber") return "cyber";
    return "obsidian"; // Default dark
  });

  // Chart Palette: "classic" | "cyber" | "mint" | "monochrome" | "custom"
  const [chartTheme, setChartTheme] = useState(() => {
    return localStorage.getItem(CHART_THEME_KEY) || "classic";
  });

  // Custom Chart Colors
  const [customChartColors, setCustomChartColors] = useState(() => {
    try {
      const saved = localStorage.getItem(CHART_CUSTOM_COLORS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_CUSTOM_COLORS;
    } catch {
      return DEFAULT_CUSTOM_COLORS;
    }
  });

  // Apply application theme classes to root
  useEffect(() => {
    const root = document.documentElement;
    // Clear all existing theme classes
    root.classList.remove(
      "dark",
      "light",
      "theme-obsidian",
      "theme-oled",
      "theme-light",
      "theme-cyber",
    );

    if (theme === "light") {
      root.classList.add("light", "theme-light");
    } else if (theme === "oled") {
      root.classList.add("dark", "theme-oled");
    } else if (theme === "cyber") {
      root.classList.add("dark", "theme-cyber");
    } else {
      root.classList.add("dark", "theme-obsidian");
    }

    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Persist chart theme
  useEffect(() => {
    localStorage.setItem(CHART_THEME_KEY, chartTheme);
  }, [chartTheme]);

  // Persist custom chart colors
  useEffect(() => {
    localStorage.setItem(
      CHART_CUSTOM_COLORS_KEY,
      JSON.stringify(customChartColors),
    );
  }, [customChartColors]);

  const toggleTheme = () =>
    setTheme((t) => (t === "light" ? "obsidian" : "light"));

  // Active chart palette resolver
  const activeChartPalette = useMemo(() => {
    if (chartTheme === "custom") {
      return {
        id: "custom",
        name: "Custom Palette",
        desc: "User-defined colors",
        ...customChartColors,
      };
    }
    return CHART_PALETTES[chartTheme] || CHART_PALETTES.classic;
  }, [chartTheme, customChartColors]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isDark: theme !== "light",
        chartTheme,
        setChartTheme,
        customChartColors,
        setCustomChartColors,
        activeChartPalette,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
