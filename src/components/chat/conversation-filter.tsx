import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ConversationFilter({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string
  all: string
  value?: string
  options: Array<{ id: string; name: string }>
  onChange: (value: string | undefined) => void
}) {
  return (
    <Select
      value={value || "all"}
      onValueChange={(next) =>
        onChange(next && next !== "all" ? next : undefined)
      }
    >
      <SelectTrigger aria-label={label} className="max-w-[48%] min-w-0">
        <SelectValue>
          {options.find((option) => option.id === value)?.name ?? all}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">{all}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
