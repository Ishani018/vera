import { VideoStudio } from '@/components/video/VideoStudio';

export const metadata = {
  title: 'Video & Audio Studio',
  description: 'In-house video and audio editor with real-time pitch shifting, tempo stretching, and waveform timeline.',
};

export default function VideoPage() {
  return <VideoStudio />;
}
