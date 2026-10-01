import { makeProject } from "@revideo/core";
import reloj from "./scenes/reloj?scene";
export default makeProject({ scenes: [reloj], settings: { shared: { size: { x: 1280, y: 720 } } } });
