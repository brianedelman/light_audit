import { useEffect, useRef } from 'react'
import 'pannellum/build/pannellum.js'

interface Props {
  url: string
  alt: string
  onClose: () => void
}

export default function PanoramaViewer({ url, alt, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const pv = window.pannellum.viewer(containerRef.current, {
      type: 'equirectangular',
      panorama: url,
      autoLoad: true,
      showControls: true,
    })
    return () => {
      pv.destroy()
    }
  }, [url])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      data-testid="panorama-viewer"
    >
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm text-gray-300">{alt}</span>
        <button
          className="text-white text-2xl font-bold"
          onClick={onClose}
          data-testid="panorama-close"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div ref={containerRef} className="flex-1" data-testid="panorama-container" />
    </div>
  )
}
