import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, UserPlus, Package, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Activity {
  id: string;
  type: "document" | "user" | "package" | "task" | "inspection";
  title: string;
  description: string;
  timestamp: Date;
  user?: { name: string; avatar?: string };
}

interface RecentActivityProps {
  activities: Activity[];
  recentClients: { id: number; name: string; status: string; package?: string; created_at: string }[];
}

const activityIcons = {
  document: <FileText className="h-4 w-4" />,
  user: <UserPlus className="h-4 w-4" />,
  package: <Package className="h-4 w-4" />,
  task: <CheckCircle className="h-4 w-4" />,
  inspection: <AlertCircle className="h-4 w-4" />,
};

const activityColors = {
  document: "bg-blue-500/10 text-blue-600",
  user: "bg-green-500/10 text-green-600",
  package: "bg-purple-500/10 text-purple-600",
  task: "bg-primary/10 text-primary",
  inspection: "bg-orange-500/10 text-orange-600",
};

export const RecentActivity = ({ activities, recentClients }: RecentActivityProps) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Recent Activity */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-4">
            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="flex gap-4 items-start p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`p-2 rounded-lg ${activityColors[activity.type]}`}>
                    {activityIcons[activity.type]}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">{activity.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                    </div>
                  </div>
                  {activity.user && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={activity.user.avatar} />
                      <AvatarFallback className="text-xs">
                        {activity.user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Recent Clients */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Recent Clients</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-4">
            <div className="space-y-3">
              {recentClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {client.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{client.name}</p>
                      {client.package && (
                        <p className="text-xs text-muted-foreground">{client.package}</p>
                      )}
                    </div>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={
                      client.status === 'active' 
                        ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                        : client.status === 'pending'
                        ? 'bg-orange-500/10 text-orange-600 border-orange-500/30'
                        : 'bg-muted text-muted-foreground'
                    }
                  >
                    {client.status}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
