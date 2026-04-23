import type { PropsWithChildren } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ThemePresetSync } from "./theme-preset-sync";

export function ThemeProvider({ children }: PropsWithChildren) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemePresetSync />
      {children}
    </NextThemesProvider>
  );
}
