import React from "react";
import { Composition } from "remotion";
import { Tiempo } from "./Tiempo";

export const Raiz: React.FC = () => (
  <Composition id="Tiempo" component={Tiempo} durationInFrames={300} fps={30} width={1280} height={720} defaultProps={{ ciudad: "Sevilla" }} />
);
