import React from 'react';
import { VideoCirclePlayer } from './VideoCirclePlayer';

interface VideoSquarePlayerProps {
  src: string;
}

export const VideoSquarePlayer: React.FC<VideoSquarePlayerProps> = ({ src }) => {
  return <VideoCirclePlayer src={src} />;
};
