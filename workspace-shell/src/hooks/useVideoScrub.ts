import { useEffect, useRef } from 'react'

export function useVideoScrub(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    if (!video || !enabled || reduceMotion || coarsePointer || window.innerWidth < 768) return

    let previousX: number | null = null
    let targetTime = 0
    let seeking = false

    const performSeek = () => {
      if (!Number.isFinite(video.duration) || seeking) return
      const next = Math.max(0, Math.min(video.duration, targetTime))
      if (Math.abs(video.currentTime - next) < 0.015) return
      seeking = true
      video.currentTime = next
    }

    const onMove = (event: PointerEvent) => {
      if (!Number.isFinite(video.duration)) return
      if (previousX === null) {
        previousX = event.clientX
        targetTime = video.currentTime
        return
      }
      const delta = event.clientX - previousX
      previousX = event.clientX
      targetTime = Math.max(0, Math.min(video.duration, targetTime + (delta / window.innerWidth) * 0.8 * video.duration))
      performSeek()
    }

    const onSeeked = () => {
      seeking = false
      performSeek()
    }

    const onLoaded = () => {
      targetTime = Math.min(0.01, video.duration)
      performSeek()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('loadedmetadata', onLoaded)
    return () => {
      window.removeEventListener('pointermove', onMove)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [enabled])

  return videoRef
}

