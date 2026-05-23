import { Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings, type Theme } from "@/lib/settings";

const THEMES: { value: Theme; label: string }[] = [
  { value: "winter", label: "Winter ❄️" },
  { value: "spring", label: "Spring 🌸" },
  { value: "summer", label: "Summer ☀️" },
  { value: "autumn", label: "Autumn 🍂" },
  { value: "halloween", label: "Halloween 🎃" },
];

export function SettingsMenu() {
  const [settings, update] = useSettings();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Settings">
          <SettingsIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-4">
        <h4 className="font-semibold">Display</h4>

        <div className="space-y-2">
          <Label>Seasonal theme</Label>
          <Select value={settings.theme} onValueChange={(v) => update({ theme: v as Theme })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {THEMES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-images" className="cursor-pointer">Show skin images</Label>
          <Switch
            id="show-images"
            checked={settings.showImages}
            onCheckedChange={(v) => update({ showImages: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="show-effects" className="cursor-pointer">Effects</Label>
          <Switch
            id="show-effects"
            checked={settings.showEffects}
            onCheckedChange={(v) => update({ showEffects: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="low-perf" className="cursor-pointer">Low-performance mode</Label>
          <Switch
            id="low-perf"
            checked={settings.lowPerf}
            onCheckedChange={(v) => update({ lowPerf: v })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
