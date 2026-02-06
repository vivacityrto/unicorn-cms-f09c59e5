import { AcademyLayout } from "@/components/layout/AcademyLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ThumbsUp, Users, TrendingUp } from "lucide-react";

const discussions = [
  {
    id: 1,
    title: "Tips for preparing for your first ASQA audit",
    author: "Sarah M.",
    avatar: null,
    replies: 24,
    likes: 42,
    category: "Compliance",
    timeAgo: "2 hours ago",
  },
  {
    id: 2,
    title: "How do you handle student complaints effectively?",
    author: "James P.",
    avatar: null,
    replies: 18,
    likes: 31,
    category: "Student Management",
    timeAgo: "5 hours ago",
  },
  {
    id: 3,
    title: "Resources for training assessors - share your favourites!",
    author: "Emily R.",
    avatar: null,
    replies: 35,
    likes: 67,
    category: "Resources",
    timeAgo: "1 day ago",
  },
];

const AcademyCommunity = () => {
  return (
    <AcademyLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Community</h1>
            <p className="text-muted-foreground">
              Connect with fellow learners and industry professionals
            </p>
          </div>
          <Button>
            <MessageSquare className="mr-2 h-4 w-4" />
            Start Discussion
          </Button>
        </div>

        {/* Community Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,234</div>
              <p className="text-xs text-muted-foreground">+56 this month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Discussions</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">456</div>
              <p className="text-xs text-muted-foreground">12 new today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Topics</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">89</div>
              <p className="text-xs text-muted-foreground">This week</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Discussions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Discussions</CardTitle>
            <CardDescription>Join the conversation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {discussions.map((discussion) => (
              <div
                key={discussion.id}
                className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={discussion.avatar || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {discussion.author
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h4 className="font-medium hover:text-primary transition-colors">
                    {discussion.title}
                  </h4>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span>{discussion.author}</span>
                    <span>•</span>
                    <span>{discussion.timeAgo}</span>
                    <Badge variant="outline" className="text-xs">
                      {discussion.category}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-4 w-4" />
                    {discussion.replies}
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-4 w-4" />
                    {discussion.likes}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AcademyLayout>
  );
};

export default AcademyCommunity;
