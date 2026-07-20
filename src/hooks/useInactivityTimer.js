import { useEffect, useRef } from "react";

export function useInactivityTimer(onTimeout, timeout = 15 * 60 * 1000, enabled = true) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !onTimeout) {
      console.log("Inactivity timer disabled");
      return;
    }

    const resetTimer = () => {
      console.log("Activity detected, resetting timer");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        console.log("TIMEOUT FIRED – calling onTimeout");
        onTimeout();
      }, timeout);
    };

    const events = ["mousemove", "keydown", "scroll", "click", "touchstart"];
    events.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    resetTimer();

    return () => {
      console.log("Inactivity timer cleaned up");
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [onTimeout, timeout, enabled]);
}