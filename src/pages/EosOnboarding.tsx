import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  CheckCircle, 
  Circle, 
  ChevronDown, 
  AlertCircle, 
  Rocket, 
  ArrowRight,
  Target,
  Users,
  Calendar,
  BarChart3,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { useEosReadiness } from '@/hooks/useEosReadiness';
import { READINESS_STATE_COLORS } from '@/types/eosReadiness';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { OnboardingCategory, OnboardingChecklistItem } from '@/types/eosReadiness';

const CATEGORY_ICONS: Record<OnboardingCategory['id'], typeof Target> = {
  foundation: Users,
  vision: Target,
  execution: Rocket,
  weekly: Calendar,
  quarterly: BarChart3,
  people: MessageSquare,
};

const CATEGORY_LINKS: Record<OnboardingCategory['id'], string> = {
  foundation: '/eos/accountability',
  vision: '/eos/vto',
  execution: '/eos/rocks',
  weekly: '/eos/meetings',
  quarterly: '/eos/flight-plan',
  people: '/eos/qc',
};

export default function EosOnboarding() {
  return (
    <DashboardLayout>
      <OnboardingContent />
    </DashboardLayout>
  );
}

function OnboardingContent() {
  const { readiness, isLoading } = useEosReadiness();
  const { isFacilitatorMode } = useFacilitatorMode();
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['foundation', 'vision']);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!readiness) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Unable to load readiness data.</p>
      </div>
    );
  }

  const colors = READINESS_STATE_COLORS[readiness.state];

  // Find next incomplete item for facilitator guidance
  const nextIncompleteItem = readiness.categories
    .flatMap(c => c.items)
    .find(item => !item.isComplete);

  return (
    <div className="space-y-6">
      <PageHeader
        title="EOS Onboarding Checklist"
        description="Track your progress implementing the Entrepreneurial Operating System"
      />

      {/* Status Overview Card */}
      <Card className={cn('border-2', colors.border)}>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* State Badge */}
            <div className="flex items-center gap-4">
              <div className={cn('p-3 rounded-xl', colors.bg)}>
                <Rocket className={cn('h-8 w-8', colors.text)} />
              </div>
              <div>
                <Badge 
                  variant="outline" 
                  className={cn('text-sm font-semibold mb-1', colors.bg, colors.text, colors.border)}
                >
                  {readiness.stateLabel}
                </Badge>
                <p className="text-sm text-muted-foreground max-w-md">
                  {readiness.stateDescription}
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-semibold">{readiness.overallProgress}%</span>
              </div>
              <Progress value={readiness.overallProgress} className="h-3" />
              <p className="text-xs text-muted-foreground mt-1">
                {readiness.completedItems} of {readiness.totalItems} items complete
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Facilitator Guidance */}
      {isFacilitatorMode && nextIncompleteItem && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-primary">Next Recommended Step</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {nextIncompleteItem.label}: {nextIncompleteItem.description}
                </p>
                {nextIncompleteItem.incompleteReason && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {nextIncompleteItem.incompleteReason}
                  </p>
                )}
              </div>
              <Link to={CATEGORY_LINKS[nextIncompleteItem.category]}>
                <Button size="sm" variant="outline">
                  Go to {nextIncompleteItem.category}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checklist Categories */}
      <div className="space-y-4">
        {readiness.categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            isExpanded={expandedCategories.includes(category.id)}
            onToggle={() => toggleCategory(category.id)}
            isFacilitatorMode={isFacilitatorMode}
          />
        ))}
      </div>

      {/* Mature State Celebration */}
      {readiness.state === 'mature' && (
        <Card className="border-primary bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold text-primary mb-2">
              EOS Fully Embedded! 🎉
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your organization is running EOS at full maturity. Continue the rhythm 
              to maintain discipline and drive results.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface CategoryCardProps {
  category: OnboardingCategory;
  isExpanded: boolean;
  onToggle: () => void;
  isFacilitatorMode: boolean;
}

function CategoryCard({ category, isExpanded, onToggle, isFacilitatorMode }: CategoryCardProps) {
  const Icon = CATEGORY_ICONS[category.id];
  const link = CATEGORY_LINKS[category.id];
  const progressPercent = category.totalCount > 0 
    ? Math.round((category.completedCount / category.totalCount) * 100) 
    : 0;

  return (
    <Card className={cn(
      'transition-all',
      category.isComplete && 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10'
    )}>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className={cn(
                'p-2 rounded-lg',
                category.isComplete 
                  ? 'bg-emerald-100 dark:bg-emerald-900/50' 
                  : 'bg-muted'
              )}>
                <Icon className={cn(
                  'h-5 w-5',
                  category.isComplete 
                    ? 'text-emerald-600 dark:text-emerald-400' 
                    : 'text-muted-foreground'
                )} />
              </div>

              {/* Title and Description */}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  {category.title}
                  {category.isComplete && (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  )}
                </CardTitle>
                <CardDescription className="text-sm">
                  {category.description}
                </CardDescription>
              </div>

              {/* Progress Badge */}
              <Badge variant={category.isComplete ? 'default' : 'secondary'} className="ml-auto">
                {category.completedCount}/{category.totalCount}
              </Badge>

              {/* Expand Icon */}
              <ChevronDown className={cn(
                'h-5 w-5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180'
              )} />
            </div>

            {/* Progress Bar */}
            <Progress value={progressPercent} className="h-1 mt-3" />
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <div className="space-y-3 pl-12">
              {category.items.map((item) => (
                <ChecklistItemRow 
                  key={item.id} 
                  item={item} 
                  showReason={isFacilitatorMode}
                />
              ))}

              {/* Link to relevant page */}
              <div className="pt-2">
                <Link to={link}>
                  <Button variant="ghost" size="sm" className="text-primary">
                    Go to {category.title.replace(/^\d+\.\s*/, '')}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

interface ChecklistItemRowProps {
  item: OnboardingChecklistItem;
  showReason?: boolean;
}

function ChecklistItemRow({ item, showReason }: ChecklistItemRowProps) {
  return (
    <div className={cn(
      'flex items-start gap-3 p-2 rounded-md',
      item.isComplete && 'bg-emerald-50/50 dark:bg-emerald-950/20'
    )}>
      {item.isComplete ? (
        <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium',
          item.isComplete && 'text-emerald-700 dark:text-emerald-300'
        )}>
          {item.label}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.description}
        </p>
        {!item.isComplete && item.incompleteReason && showReason && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {item.incompleteReason}
          </p>
        )}
      </div>
    </div>
  );
}
