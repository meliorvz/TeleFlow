import * as React from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface PageLayoutProps {
    variant?: 'full' | 'contained';
    className?: string;
    children: React.ReactNode;
}

/**
 * PageLayout provides consistent layout patterns across the app.
 * 
 * - `full`: Full-height layout with internal scroll management. 
 *   Use for pages like Conversations and Reports that need custom scroll behavior.
 * 
 * - `contained`: Centered content with max-width and page scroll.
 *   Use for form-like pages like Dashboard, BulkSend, Settings.
 */
export function PageLayout({ variant = 'contained', className, children }: PageLayoutProps) {
    if (variant === 'full') {
        return (
            <div className={cn("flex h-full flex-col overflow-hidden", className)}>
                {children}
            </div>
        )
    }

    return (
        <ScrollArea className="h-full">
            <div className={cn("mx-auto max-w-5xl p-6", className)}>
                {children}
            </div>
        </ScrollArea>
    )
}
