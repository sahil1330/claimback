"use client";

import { useEffect } from "react";

export function MarketingMotion() {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>("[data-marketing-page]");
    if (!page) return;

    const progress = page.querySelector<HTMLElement>("[data-marketing-progress]");
    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const fraction = scrollable > 0 ? window.scrollY / scrollable : 0;
      progress?.style.setProperty("--marketing-progress", String(Math.max(0, Math.min(1, fraction))));
    };
    const scheduleProgress = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", scheduleProgress);

    let observer: IntersectionObserver | undefined;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
      const reveals = Array.from(page.querySelectorAll<HTMLElement>("[data-marketing-reveal]"));
      const visibleEdge = window.innerHeight * 0.94;
      for (const element of reveals) {
        if (element.getBoundingClientRect().top < visibleEdge) element.dataset.visible = "true";
      }
      page.dataset.motionReady = "true";
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = "true";
            observer?.unobserve(entry.target);
          }
        }
      }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
      for (const element of reveals) {
        if (!element.dataset.visible) observer.observe(element);
      }
    }

    return () => {
      window.removeEventListener("scroll", scheduleProgress);
      window.removeEventListener("resize", scheduleProgress);
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      delete page.dataset.motionReady;
    };
  }, []);

  return null;
}
