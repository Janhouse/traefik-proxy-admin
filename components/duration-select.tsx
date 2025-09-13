import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DURATION_PRESETS } from "@/lib/duration-presets";

interface DurationSelectProps {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  disabled?: boolean;
}

export function DurationSelect({ value, onValueChange, disabled }: DurationSelectProps) {
  const handleValueChange = (selectedValue: string) => {
    // Ignore empty string changes - this seems to be a spurious event from the Select component
    if (selectedValue === "") {
      return;
    }

    let duration: number | null;
    if (selectedValue === "forever") {
      duration = null;
    } else {
      const parsed = parseInt(selectedValue);
      duration = isNaN(parsed) ? null : parsed;
    }
    onValueChange(duration);
  };

  const getSelectValue = () => {
    if (value === null || value === undefined || isNaN(value as number)) {
      return "forever";
    }
    return value.toString();
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="duration">Auto-disable Duration</Label>
      <Select
        value={getSelectValue()}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select duration" />
        </SelectTrigger>
        <SelectContent>
          {DURATION_PRESETS.map((preset) => (
            <SelectItem
              key={preset.value === null ? "forever" : preset.value.toString()}
              value={preset.value === null ? "forever" : preset.value.toString()}
            >
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-gray-500">
        Service will automatically disable after this duration.
      </p>
    </div>
  );
}