import type { LessonContent } from '@oquplay/shared';
import { ApiError } from './api';

// Metro picks lessonExports.web.ts in the browser. Native exports need a file-sharing adapter.
export const videoSupported = () => false;
export async function downloadPresentation(_id: string): Promise<void> { throw new ApiError('export_web_only'); }
export function downloadMaterial(_lesson: LessonContent): void { throw new ApiError('export_web_only'); }
export async function downloadVideo(_lesson: LessonContent, _options: { signal: AbortSignal; onProgress: (progress: number) => void; secondsPerSlide?: number }): Promise<void> { throw new ApiError('video_unsupported'); }
