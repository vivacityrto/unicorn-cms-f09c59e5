import * as React from "react"
import { Check, ArrowUpDown, Calendar, Mail, FolderOpen, Search, LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  icon?: LucideIcon // Icon component to display
  iconColor?: string // Color class for the icon
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
  showCreatedAt?: boolean
  autoWidth?: boolean // When true, popover width fits content instead of matching trigger
  showIcons?: boolean // When true, display icons for options
  showSeparators?: boolean // When true, show separators between items
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
  showAvatar = false,
  showCreatedAt = false,
  autoWidth = false,
  showIcons = false,
  showSeparators = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

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

  // Filter options based on search query
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options
    return options.filter(option =>
      option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (option.secondaryLabel && option.secondaryLabel.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [options, searchQuery])

  const groupKeys = Object.keys(groupedOptions)

  // Get selected option label
  const selectedOption = options.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between bg-card border-border/50 hover:bg-muted hover:border-primary/30 font-semibold rounded-lg shadow-sm", className)}
        >
          <span className="text-foreground">{selectedOption?.label || placeholder}</span>
          <ArrowUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground/60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className={cn(
          "p-2 rounded-lg shadow-lg border-border/50 bg-popover z-[100]", 
          autoWidth ? "w-auto min-w-[180px]" : "w-[var(--radix-popover-trigger-width)]"
        )} 
        align="start" 
        sideOffset={5}
      >
        {/* Search Input */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={searchPlaceholder}
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            className="pl-9 h-9 text-sm rounded-md" 
          />
        </div>
        
        {/* Options List */}
        <div className="max-h-[280px] overflow-y-auto">
          {filteredOptions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">{emptyText}</p>
          )}
          {filteredOptions.map((option, index) => {
            const Icon = option.icon
            const isSelected = value === option.value
            return (
              <div key={option.value}>
                <div 
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium cursor-pointer rounded-md transition-all flex items-center gap-2",
                    isSelected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  )} 
                  onClick={() => {
                    onValueChange(option.value === value ? "" : option.value)
                    setOpen(false)
                    setSearchQuery("")
                  }}
                >
                  {showIcons && Icon && <Icon className={cn("h-4 w-4", option.iconColor)} />}
                  {showColorDots && option.colorDot && (
                    <span className={cn("w-3 h-3 rounded-full shrink-0", option.colorDot)} />
                  )}
                  {showAvatar && (
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={option.avatarUrl} alt={option.label} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {option.avatarFallback || option.label.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className="flex flex-col flex-1 min-w-0">
                    <span>{option.label}</span>
                    {option.secondaryLabel && (
                      <span className="text-xs text-muted-foreground">{option.secondaryLabel}</span>
                    )}
                    {option.email && (
                      <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {option.email}
                      </span>
                    )}
                    {option.category && (
                      <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        {option.category}
                      </span>
                    )}
                  </div>
                  {option.status && (
                    <Badge 
                      variant="outline"
                      className={cn(
                        "text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px] ml-auto",
                        option.status === 'active' && "bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-600",
                        option.status === 'inactive' && "bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-600"
                      )}
                    >
                      {option.status}
                    </Badge>
                  )}
                  {showCreatedAt && option.createdAt && (
                    <span className="text-xs text-muted-foreground/70 flex items-center gap-1 shrink-0 ml-auto">
                      <Calendar className="h-3 w-3" />
                      {new Date(option.createdAt).toLocaleDateString()}
                    </span>
                  )}
                  {!hideCheck && isSelected && (
                    <Check className="ml-auto h-4 w-4 shrink-0" />
                  )}
                </div>
                {showSeparators && index < filteredOptions.length - 1 && (
                  <div className="mx-2 my-1 border-b border-border/50" />
                )}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
