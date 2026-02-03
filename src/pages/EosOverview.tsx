import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Target, ListTodo, AlertCircle, Calendar, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEosRocks, useEosIssues, useEosTodos, useEosMeetings } from '@/hooks/useEos';
import { Badge } from '@/components/ui/badge';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ReadinessCard } from '@/components/eos/ReadinessCard';
import { HealthScoreWidget } from '@/components/eos/HealthScoreWidget';

export default function EosOverview() {
  return (
    <DashboardLayout>
      <OverviewContent />
    </DashboardLayout>
  );
}

function OverviewContent() {
  const { rocks } = useEosRocks();
  const { issues } = useEosIssues();
  const { todos } = useEosTodos();
  const { meetings } = useEosMeetings();

  const activeRocks = rocks?.filter(r => r.status !== 'complete').length || 0;
  const openIssues = issues?.filter(i => i.status === 'open').length || 0;
  const pendingTodos = todos?.filter(t => t.status === 'pending').length || 0;
  const upcomingMeetings = meetings?.filter(m => !m.is_complete).length || 0;

  const quickStats = [
    { 
      title: 'Active Rocks', 
      value: activeRocks, 
      icon: Target, 
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      link: '/eos/rocks'
    },
    { 
      title: 'Open Issues', 
      value: openIssues, 
      icon: AlertCircle, 
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      link: '/eos/issues'
    },
    { 
      title: 'Pending To-Dos', 
      value: pendingTodos, 
      icon: ListTodo, 
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      link: '/eos/todos'
    },
    { 
      title: 'Upcoming Meetings', 
      value: upcomingMeetings, 
      icon: Calendar, 
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      link: '/eos/meetings'
    },
  ];

  const eosModules = [
    {
      title: 'Vision/Traction Organizer',
      description: 'Define your vision and track traction with the V/TO',
      icon: TrendingUp,
      link: '/eos/vto',
      color: 'bg-gradient-to-br from-blue-500 to-blue-600'
    },
    {
      title: 'Accountability Chart',
      description: 'Visualize your organizational structure and responsibilities',
      icon: Users,
      link: '/eos/accountability',
      color: 'bg-gradient-to-br from-green-500 to-green-600'
    },
    {
      title: 'Scorecard',
      description: 'Track key metrics and performance indicators weekly',
      icon: TrendingUp,
      link: '/eos/scorecard',
      color: 'bg-gradient-to-br from-purple-500 to-purple-600'
    },
    {
      title: 'Rocks (90-Day Goals)',
      description: 'Set and track quarterly priorities and goals',
      icon: Target,
      link: '/eos/rocks',
      color: 'bg-gradient-to-br from-orange-500 to-orange-600'
    },
    {
      title: 'Issues List',
      description: 'Identify, discuss, and solve organizational issues',
      icon: AlertCircle,
      link: '/eos/issues',
      color: 'bg-gradient-to-br from-red-500 to-red-600'
    },
    {
      title: 'Level 10 Meetings',
      description: 'Run structured, high-performance weekly meetings',
      icon: Calendar,
      link: '/eos/meetings',
      color: 'bg-gradient-to-br from-indigo-500 to-indigo-600'
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="EOS Overview"
        description="Entrepreneurial Operating System - Manage your business with clarity and accountability"
      />

      {/* Readiness Card */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link to="/eos/rocks">
          <StatCard
            label="Active Rocks"
            value={activeRocks}
            icon={Target}
            intent="info"
            onClick={() => {}}
          />
        </Link>
        <Link to="/eos/issues">
          <StatCard
            label="Open Issues"
            value={openIssues}
            icon={AlertCircle}
            intent="danger"
            onClick={() => {}}
          />
        </Link>
        <Link to="/eos/todos">
          <StatCard
            label="Pending To-Dos"
            value={pendingTodos}
            icon={ListTodo}
            intent="success"
            onClick={() => {}}
          />
        </Link>
        <Link to="/eos/meetings">
          <StatCard
            label="Upcoming Meetings"
            value={upcomingMeetings}
            icon={Calendar}
            onClick={() => {}}
          />
          </Link>
          </div>
        </div>
        <div className="lg:col-span-1 space-y-4">
          <HealthScoreWidget />
          <ReadinessCard />
        </div>
      </div>

      {/* EOS Modules */}
      <div>
        <h2 className="text-2xl font-bold mb-4">EOS Tools & Modules</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {eosModules.map((module) => (
            <Link key={module.title} to={module.link}>
              <Card className="hover:shadow-lg transition-all hover:scale-105 cursor-pointer h-full">
                <CardHeader>
                  <div className={`${module.color} w-12 h-12 rounded-lg flex items-center justify-center mb-3`}>
                    <module.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  <CardDescription>{module.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Getting Started */}
      <Card>
        <CardHeader>
          <CardTitle>Getting Started with EOS</CardTitle>
          <CardDescription>
            New to EOS? Here's how to get started with the Entrepreneurial Operating System
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">1</Badge>
              Define Your Vision
            </h3>
            <p className="text-sm text-muted-foreground ml-8">
              Start with the V/TO to clarify your company's vision, core values, and 10-year target
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">2</Badge>
              Build Your Accountability Chart
            </h3>
            <p className="text-sm text-muted-foreground ml-8">
              Map out your organizational structure with clear roles and responsibilities
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">3</Badge>
              Set Your Rocks
            </h3>
            <p className="text-sm text-muted-foreground ml-8">
              Identify 3-7 quarterly priorities (Rocks) to focus your team's efforts
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">4</Badge>
              Run Level 10 Meetings
            </h3>
            <p className="text-sm text-muted-foreground ml-8">
              Conduct weekly 90-minute meetings using the proven Level 10 format
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
