'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export { Tabs, TabsContent, TabsList, TabsTrigger };

export type AppTabItem = {
  value: string;
  label: string;
  content: React.ReactNode;
};

export function AppTabs({
  defaultValue,
  items,
  className,
  listClassName,
}: {
  defaultValue: string;
  items: AppTabItem[];
  className?: string;
  listClassName?: string;
}) {
  return (
    <Tabs defaultValue={defaultValue} className={className}>
      <TabsList className={listClassName}>
        {items.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
