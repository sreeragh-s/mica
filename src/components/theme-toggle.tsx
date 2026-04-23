import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useMounted } from "@/hooks/use-mounted";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ThemeOption = "light" | "dark" | "system";

const themeIcons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} satisfies Record<ThemeOption, typeof Sun>;

export function ThemeToggle() {
  const mounted = useMounted();
  const { resolvedTheme, setTheme, theme } = useTheme();

  const activeTheme = (mounted ? theme : "system") as ThemeOption;
  const icon =
    themeIcons[
      activeTheme === "system"
        ? ((resolvedTheme ?? "system") as ThemeOption)
        : activeTheme
    ];

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label="Change theme"
            >
              {icon === Sun && <Sun className="size-4" />}
              {icon === Moon && <Moon className="size-4" />}
              {icon === Monitor && <Monitor className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={activeTheme}
          onValueChange={(value) => setTheme(value)}
        >
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
