"use client";

import { useEffect, useState } from "react";

const DISPLAY_MS = 1600;

export default function ArcSplashLoader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
    }, DISPLAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="arc-splash" role="status" aria-live="polite" aria-label="Loading app">
      <div className="arc-splash__inner">
        <p className="arc-splash__label">Arc</p>
        <div className="arc-splash__barbell" aria-hidden="true">
          <span className="arc-splash__plate arc-splash__plate--left" />
          <span className="arc-splash__bar" />
          <span className="arc-splash__plate arc-splash__plate--right" />
        </div>
        <p className="arc-splash__text">Warming up your workout planner...</p>
        <div className="arc-splash__progress" aria-hidden="true">
          <span className="arc-splash__progress-fill" />
        </div>
      </div>
    </div>
  );
}
