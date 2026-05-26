declare module 'pannellum/build/pannellum.js' {
  // side-effect only import — sets window.pannellum global
}

interface PannellumViewerInstance {
  destroy(): void
  isLoaded(): boolean
}

interface PannellumConfig {
  type?: string
  panorama: string
  autoLoad?: boolean
  showControls?: boolean
  compass?: boolean
  showZoomCtrl?: boolean
  showFullscreenCtrl?: boolean
  [key: string]: unknown
}

interface Window {
  pannellum: {
    viewer(container: HTMLElement | string, config: PannellumConfig): PannellumViewerInstance
  }
}
