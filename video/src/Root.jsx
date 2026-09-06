import React from 'react';
import {Composition} from 'remotion';
import {AdminExplainer, totalFrames} from './AdminExplainer';

export const RemotionRoot = () => (
  <Composition
    id="AdminExplainer"
    component={AdminExplainer}
    durationInFrames={totalFrames}
    fps={30}
    width={1920}
    height={1080}
  />
);
