import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from "recharts";

interface ChartsProps {
  packageData: { name: string; clients: number; completed: number }[];
  monthlyData: { month: string; tasks: number; completed: number }[];
  statusData: { name: string; value: number; color: string }[];
}

export const DashboardCharts = ({ packageData, monthlyData, statusData }: ChartsProps) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Package Overview */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Clients by Package</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={packageData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
                <Bar dataKey="clients" fill="hsl(275 54% 41%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" fill="hsl(188 74% 51%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Trend */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Monthly Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(275 54% 41%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(275 54% 41%)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(188 74% 51%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(188 74% 51%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="tasks" 
                  stroke="hsl(275 54% 41%)" 
                  fillOpacity={1} 
                  fill="url(#colorTasks)" 
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="completed" 
                  stroke="hsl(188 74% 51%)" 
                  fillOpacity={1} 
                  fill="url(#colorCompleted)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Status Distribution */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Client Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 min-w-[120px]">
              {statusData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                  <span className="text-sm font-semibold ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Performance Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Completion Rate</span>
              <span className="text-sm font-semibold">78%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '78%' }} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Document Progress</span>
              <span className="text-sm font-semibold">65%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-[hsl(188_74%_51%)] rounded-full" style={{ width: '65%' }} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Client Satisfaction</span>
              <span className="text-sm font-semibold">92%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: '92%' }} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Response Time</span>
              <span className="text-sm font-semibold">85%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 rounded-full" style={{ width: '85%' }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
