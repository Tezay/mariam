import { lazy, Suspense } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { SiteRef } from '@/lib/api/client';

const NotificationsContent = lazy(() => import('./NotificationsContent'));

interface NotificationsPanelProps {
  site: SiteRef;
  siteName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsPanel({
  site,
  siteName,
  open,
  onOpenChange,
}: NotificationsPanelProps) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const content = open && (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner className="size-8 text-site-brand" />
        </div>
      }
    >
      <NotificationsContent site={site} />
    </Suspense>
  );

  if (wide) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto border-site-line bg-site-surface p-0 text-site-text sm:max-w-md"
        >
          <SheetHeader className="border-b border-site-line p-6 text-left">
            <SheetTitle className="text-site-text">Notifications</SheetTitle>
            <SheetDescription className="text-site-subtle">{siteName}</SheetDescription>
          </SheetHeader>
          <div className="p-6">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex max-h-[92vh] flex-col bg-site-surface text-site-text">
        <DrawerHeader className="px-5 pb-3 pt-2 text-left">
          <DrawerTitle>Notifications</DrawerTitle>
          <DrawerDescription className="text-site-subtle">{siteName}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-5 pb-8">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}
