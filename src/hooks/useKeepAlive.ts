import { useEffect } from 'react';

export default function useKeepAlive(): void {
  useEffect(() => {
    let rafId: number | undefined;
    let userInteracted = false;

    const audio = document.createElement('audio');
    const baseUrl = import.meta.env.BASE_URL || '/';
    audio.src = baseUrl + 'silent-loop.mp3';
    audio.loop = true;
    audio.muted = true;
    (audio as unknown as Record<string, unknown>).playsInline = true;
    audio.setAttribute('tabindex', '-1');
    audio.style.display = 'none';
    document.body.appendChild(audio);

    function startAudioPlayback() {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => console.log('[KeepAlive] Silent audio playing'))
          .catch(err => {
            console.warn('[KeepAlive] Autoplay blocked, waiting for user interaction...', err);
            if (!userInteracted) {
              const resume = () => {
                userInteracted = true;
                audio.play().then(
                  () => console.log('[KeepAlive] Audio started after user interaction')
                ).catch(e => console.warn('[KeepAlive] Still blocked:', e));
                window.removeEventListener('pointerdown', resume, true);
                window.removeEventListener('touchstart', resume, true);
              };
              window.addEventListener('pointerdown', resume, true);
              window.addEventListener('touchstart', resume, true);
            }
          });
      }
    }

    startAudioPlayback();

    const nudgeInterval = setInterval(() => {
      document.body.style.opacity = '0.999';
      setTimeout(() => { document.body.style.opacity = '1'; }, 50);
      document.body.style.setProperty('--keepalive-nudge', String(Math.random()));
      console.log('[KeepAlive] CSS nudge');
    }, 60000);

    function rafNudge() {
      document.body.dataset.keepalive = String(Date.now() % 2);
      rafId = requestAnimationFrame(rafNudge);
    }
    rafId = requestAnimationFrame(rafNudge);

    function onVisibilityChange() {
      console.log('[KeepAlive] Document visibility:', document.visibilityState);
      if (document.visibilityState === 'visible' && audio.paused) {
        startAudioPlayback();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      audio.pause();
      document.body.removeChild(audio);
      clearInterval(nudgeInterval);
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointerdown', () => {}, true);
      window.removeEventListener('touchstart', () => {}, true);
    };
  }, []);
}
