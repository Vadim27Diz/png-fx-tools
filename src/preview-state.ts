import { ImageMimeType } from './types'

export type PreviewState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; bytes: Uint8Array; mimeType: ImageMimeType }
