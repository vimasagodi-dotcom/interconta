import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: ReactNode;
  className?: string;
}

const StatCard = ({ title, value, change, changeType = "neutral", icon, className }: StatCardProps) => {
  return (
    <div className={cn("elevated-card rounded-xl p-5 animate-fade-in-up", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {change && (
            <p
              className={cn(
                "text-xs font-medium",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground"
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
          {icon}
        </div>
      </div>
    </div>
  );
};

export default StatCard;
