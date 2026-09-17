import { cn } from '@/lib/cn';

export default function Skeleton({ className }) {
  return <div className={cn('skeleton rounded-2xl', className)} />;
}

export function SkeletonList({ count = 4, className, itemClassName = 'h-24' }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={itemClassName} />
      ))}
    </div>
  );
}
