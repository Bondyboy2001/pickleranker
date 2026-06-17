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
    <th
      scope="col"
      aria-sort={isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={isActive ? 'sort-button active' : 'sort-button'}
        onClick={() => onSort(sortKey)}
        title={title}
      >
        {label}
        <span>{isActive ? (activeSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}
