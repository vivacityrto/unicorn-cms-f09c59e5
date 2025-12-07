import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, AlertCircle, Target } from 'lucide-react';
import { useState } from 'react';

interface SWOTPaneProps {
  meetingId: string;
}

export const SWOTPane = ({ meetingId }: SWOTPaneProps) => {
  const [swot, setSwot] = useState({
    strengths: '',
    weaknesses: '',
    opportunities: '',
    threats: '',
  });

  const categories = [
    { 
      key: 'strengths' as const, 
      title: 'Strengths', 
      icon: TrendingUp,
      color: 'text-green-600',
      placeholder: 'What are we doing well? What advantages do we have?' 
    },
    { 
      key: 'weaknesses' as const, 
      title: 'Weaknesses', 
      icon: TrendingDown,
      color: 'text-red-600',
      placeholder: 'Where can we improve? What are our limitations?' 
    },
    { 
      key: 'opportunities' as const, 
      title: 'Opportunities', 
      icon: Target,
      color: 'text-blue-600',
      placeholder: 'What trends or changes can we leverage? What markets can we explore?' 
    },
    { 
      key: 'threats' as const, 
      title: 'Threats', 
      icon: AlertCircle,
      color: 'text-orange-600',
      placeholder: 'What external challenges do we face? What risks should we monitor?' 
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">SWOT Analysis</h3>
        <p className="text-sm text-muted-foreground">
          Capture Strengths, Weaknesses, Opportunities, and Threats. These will feed into the Issues List.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {categories.map(({ key, title, icon: Icon, color, placeholder }) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={placeholder}
                value={swot[key]}
                onChange={(e) => setSwot({ ...swot, [key]: e.target.value })}
                rows={6}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline">Convert to Issues</Button>
        <Button>Save SWOT Analysis</Button>
      </div>
    </div>
  );
};
