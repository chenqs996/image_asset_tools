import { useEffect, useRef } from 'react'

export interface HorizontalImageScrollerItem {
  id: string
  imageUrl: string
  title: string
  metaLines?: string[]
}

interface HorizontalImageScrollerProps {
  title?: string
  items: HorizontalImageScrollerItem[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  onZoom?: (id: string) => void
  emptyText?: string
  itemWidth?: number
}

export function HorizontalImageScroller({
  title,
  items,
  selectedId = null,
  onSelect,
  onZoom,
  emptyText = '暂无内容',
  itemWidth = 160,
}: HorizontalImageScrollerProps) {
  const listRef = useRef<HTMLDivElement | null>(null)

  const hasItems = items.length > 0

  const selectedIndex = selectedId ? items.findIndex((item) => item.id === selectedId) : -1

  const clampIndex = (index: number) => Math.max(0, Math.min(items.length - 1, index))

  const centerItem = (id: string, behavior: ScrollBehavior = 'smooth') => {
    const el = listRef.current
    if (!el) return
    const target = Array.from(el.children).find((child) => {
      const node = child as HTMLElement
      return node.dataset.itemId === id
    }) as HTMLElement | undefined
    if (!target) return

    const listRect = el.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)
    const centered = el.scrollLeft + (targetRect.left - listRect.left) - (el.clientWidth - targetRect.width) / 2
    const left = Math.max(0, Math.min(maxScroll, centered))
    el.scrollTo({ left, behavior })
  }

  const centerItemNextFrame = (id: string, behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      centerItem(id, behavior)
    })
  }

  const selectByIndex = (index: number) => {
    if (!hasItems) return
    const safeIndex = clampIndex(index)
    const id = items[safeIndex]?.id
    if (!id) return
    onSelect?.(id)
    centerItemNextFrame(id)
  }

  const selectByOffset = (offset: number) => {
    if (!hasItems) return
    if (selectedIndex < 0) {
      selectByIndex(offset >= 0 ? 0 : items.length - 1)
      return
    }
    selectByIndex(selectedIndex + offset)
  }

  const canSelectPrev = hasItems && selectedIndex !== 0
  const canSelectNext = hasItems && selectedIndex !== items.length - 1

  useEffect(() => {
    if (!hasItems || !selectedId) return
    centerItemNextFrame(selectedId, 'auto')
  }, [hasItems, items, selectedId])

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const el = listRef.current
    if (!el) return

    event.preventDefault()

    const rawDelta = event.deltaY !== 0 ? event.deltaY : event.deltaX
    const normalizedDelta =
      event.deltaMode === 1
        ? rawDelta * 16
        : event.deltaMode === 2
          ? rawDelta * el.clientWidth
          : rawDelta

    const direction = Math.sign(normalizedDelta)
    if (direction === 0) return

    const minStep = itemWidth * 0.85
    const amplified = Math.abs(normalizedDelta) * 2.9
    const step = Math.max(minStep, amplified)

    el.scrollBy({
      left: direction * step,
      behavior: 'smooth',
    })
  }

  return (
    <div className="image-scroller">
      <div className="image-scroller-head">
        <h4>{title ?? '素材列表'}</h4>
      </div>

      {!hasItems ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="image-scroller-track">
          <button
            type="button"
            className="btn ghost slice-scroll-btn"
            onClick={() => selectByOffset(-1)}
            disabled={!canSelectPrev}
            aria-label="选择上一张"
          >
            ←
          </button>

          <div
            ref={listRef}
            className="slice-thumb-list"
            onWheel={handleWheel}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                selectByOffset(-1)
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                selectByOffset(1)
              }
            }}
            tabIndex={0}
            role="listbox"
            aria-label={title ?? '素材列表'}
          >
            {items.map((item) => (
              <div
                key={item.id}
                data-item-id={item.id}
                className={selectedId === item.id ? 'slice-thumb-item active' : 'slice-thumb-item'}
                style={{ width: itemWidth, minWidth: itemWidth, maxWidth: itemWidth }}
                onClick={() => {
                  onSelect?.(item.id)
                  centerItemNextFrame(item.id)
                }}
                role="option"
                aria-selected={selectedId === item.id}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    selectByOffset(-1)
                    return
                  }
                  if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    selectByOffset(1)
                    return
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect?.(item.id)
                    centerItemNextFrame(item.id)
                  }
                }}
              >
                {onZoom && (
                  <button
                    type="button"
                    className="thumb-zoom-btn"
                    aria-label="放大查看"
                    onClick={(event) => {
                      event.stopPropagation()
                      onZoom(item.id)
                    }}
                  >
                    ⤢
                  </button>
                )}
                <img src={item.imageUrl} alt={item.title} />
                <div className="slice-thumb-meta">
                  <div>{item.title}</div>
                  {item.metaLines?.map((line) => (
                    <div key={`${item.id}-${line}`}>{line}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn ghost slice-scroll-btn"
            onClick={() => selectByOffset(1)}
            disabled={!canSelectNext}
            aria-label="选择下一张"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
