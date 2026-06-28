export interface FrameTimeline {
  frameIds: string[]
  fps: number
  loop: boolean
}

export const DEFAULT_TIMELINE: FrameTimeline = {
  frameIds: [],
  fps: 12,
  loop: true,
}

export function moveFrame(frameIds: string[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= frameIds.length || to >= frameIds.length) return frameIds
  const next = [...frameIds]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
