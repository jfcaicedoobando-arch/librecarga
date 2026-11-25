import { useEffect, useRef, type ComponentProps } from "react";
import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { revelarElementoHorizontal } from "./utils/revelarElementoHorizontal";

type Props = Omit<ComponentProps<typeof TabsList>, "ref"> & { activeValue: string };

export function ScrollableTabsList({ activeValue, className, ...props }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;

    const reveal = () => {
      const active = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (active) revelarElementoHorizontal(list, active);
    };

    reveal();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeValue]);

  return <TabsList {...props} ref={ref} className={cn("max-w-full justify-start overflow-x-auto", className)} />;
}
