import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">Welcome to Unicorn</h1>
        <p className="text-xl text-muted-foreground mb-8">Compliance Management System</p>
        <Link to="/login">
          <Button size="lg">Go to Login</Button>
        </Link>
      </div>
    </div>
  );
};

export default Index;
