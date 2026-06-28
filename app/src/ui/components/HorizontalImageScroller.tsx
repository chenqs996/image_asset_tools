import { useEffect, useRef, useState } from 'react'

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
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const hasItems = items.length > 0

  const updateScrollState = () => {
    const el = listRef.current
    if (!el) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }

  useEffect(() => {
    updateScrollState()
    const el = listRef.current
    if (!el) return
    const onScroll = () => updateScrollState()
    const onResize = () => updateScrollState()
    el.addEventListener('scroll', onScroll)
    window.addEventListener('resize', onResize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [items])

  const scrollByDirection = (direction: 'left' | 'right') => {
    const el = listRef.current
    if (!el) return
    const delta = Math.max(160, Math.floor(el.clientWidth * 0.7))
    el.scrollBy({
      left: direction === 'left' ? -delta : delta,
      behavior: 'smooth',
    })
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const el = listRef.current
    if (!el) return
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX) && event.deltaX === 0) return

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
    const amplified = Math.abs(normalizedDelta) * 2.4
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
        <div className="slice-scroll-actions">
          <button
            type="button"
            className="btn ghost slice-scroll-btn"
            onClick={() => scrollByDirection('left')}
            disabled={!canScrollLeft}
            aria-label="向左滚动"
          >
            ←
          </button>
          <button
            type="button"
            className="btn ghost slice-scroll-btn"
            onClick={() => scrollByDirection('right')}
            disabled={!canScrollRight}
            aria-label="向右滚动"
          >
            →
          </button>
        </div>
      </div>

      {!hasItems ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div ref={listRef} className="slice-thumb-list" onWheel={handleWheel}>
          {items.map((item) => (
            <div
              key={item.id}
              className={selectedId === item.id ? 'slice-thumb-item active' : 'slice-thumb-item'}
              style={{ width: itemWidth, minWidth: itemWidth, maxWidth: itemWidth }}
              onClick={() => onSelect?.(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect?.(item.id)
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
      )}
    </div>
  )
}
