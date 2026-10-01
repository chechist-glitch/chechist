import { renderVideo } from "@revideo/renderer";
const salida = await renderVideo({
  projectFile: "./src/project.ts",
  settings: {
    outFile: "revideo.mp4",
    outDir: ".",
    logProgress: true,
    projectSettings: { exporter: { name: "@revideo/core/ffmpeg", options: { format: "mp4" } } },
    puppeteer: { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
});
console.log("ok", salida);
