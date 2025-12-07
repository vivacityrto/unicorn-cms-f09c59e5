import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle } from 'lucide-react';

interface AuditSectionNavProps {
  sections: any[];
  selectedSection: number;
  onSelectSection: (index: number) => void;
}

export const AuditSectionNav = ({ sections, selectedSection, onSelectSection }: AuditSectionNavProps) => {
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">Sections</h3>
      <div className="space-y-2">
        {sections.map((section, idx) => (
          <button
            key={section.section_id}
            onClick={() => onSelectSection(idx)}
            className={`w-full text-left p-3 rounded-lg transition-colors ${
              selectedSection === idx
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4" />
              <div className="flex-1">
                <p className="font-medium text-sm">{section.title}</p>
                <p className="text-xs opacity-80">{section.standard_code}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
};
