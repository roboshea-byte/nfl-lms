import React from 'react';
import {Composition} from 'remotion';
import {AdminExplainer} from './AdminExplainer';

export const RemotionRoot = () => (
  <Composition
    id="AdminExplainer"
    component={AdminExplainer}
    durationInFrames={3570}
    fps={30}
    width={1920}
    height={1080}
  />
);
