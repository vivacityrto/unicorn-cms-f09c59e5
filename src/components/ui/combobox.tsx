import * as React from "react"
import { Check, ArrowUpDown, Calendar, Mail, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  secondaryLabel?: string
  group?: string
  createdAt?: string
  status?: string
  colorDot?: string // CSS class for color dot (e.g., 'bg-green-500')
  email?: string
  avatarUrl?: string // URL for user avatar
  avatarFallback?: string // Fallback initials for avatar
  category?: string // Category name to display below label
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  showColorDots?: boolean
  hideCheck?: boolean
  showAvatar?: boolean
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  emptyText = "No option found.",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  showColorDots = false,
  hideCheck = false,
  showAvatar = true,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  // Group options by their group property
  const groupedOptions = React.useMemo(() => {
    const groups: Record<string, ComboboxOption[]> = {}
    options.forEach(option => {
      const groupKey = option.group || 'default'
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(option)
    })
    return groups
  }, [options])

  const groupKeys = Object.keys(groupedOptions)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black", className)}
        >
          {value
            ? options.find((option) => option.value === value)?.label
            : placeholder}
          <ArrowUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-[10px] bg-background z-[100] w-[var(--radix-popover-trigger-width)]" align="start" sideOffset={5}>
        <Command className="bg-background !p-0">
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList className="overflow-y-auto !p-0 max-h-[320px]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groupKeys.map((groupKey, groupIndex) => (
              <React.Fragment key={groupKey}>
                {groupIndex > 0 && <CommandSeparator className="my-1" />}
                <CommandGroup className="!p-0">
                  {groupedOptions[groupKey].map((option) => (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.secondaryLabel || ''}`}
                      onSelect={() => {
                        onValueChange(option.value === value ? "" : option.value);
                        setOpen(false);
                      }}
                      className="rounded-none cursor-pointer hover:!bg-[hsl(196deg_100%_93.53%)] hover:!text-black data-[selected=true]:bg-[hsl(196deg_100%_93.53%)] data-[selected=true]:text-black border-b border-border last:border-b-0"
                      style={{ lineHeight: '20px', fontSize: '15px' }}
                    >
                      <div className="flex items-center justify-between w-full gap-3">
                        <div className="flex flex-col pb-2.5 flex-1 min-w-0">
                          <div className="flex items-center justify-between w-full">
                            <span className="font-medium">{option.label}</span>
                            <div className="flex items-center gap-2">
                              {option.status && (
                                <Badge 
                                  variant="outline"
                                  className={cn(
                                    "text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]",
                                    option.status === 'active' && "bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600",
                                    option.status === 'inactive' && "bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-600"
                                  )}
                                >
                                  {option.status}
                                </Badge>
                              )}
                              {showColorDots && option.colorDot && (
                                <span className={cn("w-3 h-3 rounded-full shrink-0", option.colorDot)} />
                              )}
                            </div>
                          </div>
                          {option.secondaryLabel && (
                            <span className="text-xs text-muted-foreground mt-0.5">{option.secondaryLabel}</span>
                          )}
                          {option.email && (
                            <span className="text-xs text-muted-foreground/70 pt-[5px] flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {option.email}
                            </span>
                          )}
                          {option.category && (
                            <span className="text-xs text-muted-foreground/70 pt-[5px] flex items-center gap-1">
                              <FolderOpen className="h-3 w-3" />
                              {option.category}
                            </span>
                          )}
                        </div>
                        {option.createdAt && (
                          <span className="text-xs text-muted-foreground/70 flex items-center gap-1 shrink-0">
                            <Calendar className="h-3 w-3" />
                            {new Date(option.createdAt).toLocaleDateString()}
                          </span>
                        )}
                        {showAvatar && (
                          <Avatar className="h-8 w-8 shrink-0 self-center">
                            <AvatarImage src={option.avatarUrl} alt={option.label} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {option.avatarFallback || option.label.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      {!hideCheck && (
                        <Check className={cn("ml-auto h-4 w-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
