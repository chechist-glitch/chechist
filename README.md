# chechist
life

## Vídeos con HyperFrames

`primer-video/` es un proyecto de [HyperFrames](https://github.com/heygen-com/hyperframes): el vídeo se escribe en HTML + GSAP y se renderiza a MP4.

```bash
cd primer-video
npm run check    # lint + validación
npm run render   # saca el MP4 en renders/
npm run dev      # preview en el navegador (Studio)
```

GSAP y las fuentes están en `primer-video/assets/`, así que no hace falta tirar de CDN para renderizar.

En las sesiones de Claude Code en la web, `.claude/hooks/session-start.sh` instala solo lo necesario al arrancar: ffmpeg, el Chrome headless y las skills de HyperFrames.
