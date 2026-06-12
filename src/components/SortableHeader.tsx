import type { SortDirection } from '../lib/types'

export function SortableHeader<T extends string>({
  label,
  sortKey,
  activeSort,
  onSort,
  title,
}: {
  label: string
  sortKey: T
  activeSort: { key: T; direction: SortDirection }
  onSort: (key: T) => void
  title?: string
}) {
  const isActive = activeSort.key === sortKey
  return (
    <th>
      <button
        type="button"
        className={isActive ? 'sort-button active' : 'sort-button'}
        onClick={() => onSort(sortKey)}
        aria-sort={
          isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
        }
        title={title}
      >
        {label}
        <span>{isActive ? (activeSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}
