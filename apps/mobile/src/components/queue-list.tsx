import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import {
  DropProvider,
  listToObject,
  SortableItem,
  useSortableList,
} from 'react-native-reanimated-dnd';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Fixed stride for every queue row.
 *
 * Rows are positioned absolutely at `index * itemHeight`, so this has to be a constant
 * that the row actually fills — a row that renders taller than this makes the drag land
 * on the wrong index. Rows therefore set this as a hard height rather than letting
 * content size them.
 */
export const QUEUE_ROW_HEIGHT = 96;

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

interface QueueItem {
  episodeGuid: string;
}

interface QueueListProps<T extends QueueItem> {
  items: T[];
  renderRow: (item: T) => React.ReactNode;
  /** Called with the dragged episode and its final index once the row is dropped. */
  onReorder: (episodeGuid: string, toIndex: number) => void;
  emptyText: string;
  /** Suppress the empty message while the first read is still in flight. */
  isLoading?: boolean;
}

/**
 * Hand-orderable episode queue. Long press a row to pick it up, drag to reposition.
 *
 * Deliberately not virtualized. Both queues are capped at `MAX_DOWNLOADS`, and drag needs
 * every row mounted so it can measure and shift them — a recycling list cannot offer a
 * stable target for a row being dragged past it.
 *
 * This builds the scroll container by hand instead of using the library's `Sortable`
 * wrapper. `Sortable` keys itself on a hash of the item ids, so it **remounts every row
 * on every reorder** — which threw away each thumbnail's decoded image and made the list
 * visibly blink. See `syncPositions` below for what that remount was doing for us.
 */
export function QueueList<T extends QueueItem>({
  items,
  emptyText,
  isLoading = false,
  ...rest
}: QueueListProps<T>) {
  if (items.length === 0) {
    return isLoading ? null : (
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
        {emptyText}
      </ThemedText>
    );
  }
  // Split so the sortable hooks below never mount against an empty list. They seed row
  // positions once, at their own mount, and each row reads its starting offset during its
  // first render — so mounting while the query is still empty pins every row to offset 0,
  // stacking the whole list on top of itself.
  return <SortableQueue items={items} {...rest} />;
}

function SortableQueue<T extends QueueItem>({
  items,
  renderRow,
  onReorder,
}: Omit<QueueListProps<T>, 'emptyText' | 'isLoading'>) {
  const theme = useTheme();

  // The sortable hooks key and track rows by `id`; our items are keyed by episode guid.
  const data = useMemo(
    () => items.map((item) => ({ ...item, id: item.episodeGuid })),
    [items],
  );

  const {
    positions,
    scrollViewRef,
    dropProviderRef,
    handleScroll,
    handleScrollEnd,
    contentHeight,
    getItemProps,
  } = useSortableList({ data, itemHeight: QUEUE_ROW_HEIGHT });

  // `useSortableList` seeds `positions` once and never updates it, so a reorder or an
  // add/remove that arrives while mounted would leave the rendered order stale. Re-seed it
  // instead of remounting the tree, which is how the library's own wrapper coped.
  //
  // Keyed on the id sequence rather than array identity: a refetch hands us a new array on
  // every invalidation, and re-seeding on those would be pointless churn.
  const idSequence = data.map((item) => item.id).join('|');
  useEffect(() => {
    // `.set()` rather than assigning `.value` — the latter reads as mutating a hook result
    // and the compiler rejects it.
    positions.set(listToObject(data));
    // `data` is intentionally not a dependency — `idSequence` is its meaningful identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSequence, positions]);

  return (
    <DropProvider ref={dropProviderRef}>
      <AnimatedScrollView
        ref={scrollViewRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
        simultaneousHandlers={dropProviderRef}
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentContainerStyle={{ height: contentHeight }}>
        {data.map((item, index) => (
          <SortableItem
            key={item.id}
            {...getItemProps(item, index)}
            data={item}
            onDrop={(id, position) => onReorder(id, position)}>
            {renderRow(item)}
          </SortableItem>
        ))}
      </AnimatedScrollView>
    </DropProvider>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    // Rows are absolutely positioned inside this, so it must establish the containing
    // block rather than let them escape to an ancestor.
    position: 'relative',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: Spacing.six,
  },
});
