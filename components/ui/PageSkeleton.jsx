import PageHeader from '@/components/PageHeader';
import Skeleton, { SkeletonList } from '@/components/ui/Skeleton';

/**
 * The instant frame a route shows while its server render is in flight. Having
 * one means tapping a tab paints the new screen straight away instead of
 * leaving the previous screen on-stage until the data comes back.
 *
 * Pass `title` for the tab screens, whose heading is known ahead of time. Leave
 * it off on detail screens, where the heading depends on the record being
 * loaded, and a placeholder bar is shown instead.
 */
export default function PageSkeleton({ title, subtitle, count = 5, itemClassName = 'h-24' }) {
  return (
    <div>
      {title ? (
        <PageHeader title={title} subtitle={subtitle} />
      ) : (
        <div className="mb-4 pt-1">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="mt-2 h-4 w-24 rounded-md" />
        </div>
      )}
      <SkeletonList count={count} itemClassName={itemClassName} />
    </div>
  );
}
