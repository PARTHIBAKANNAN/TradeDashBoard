import { useEffect, useRef, useState } from "react";

// Reports whether an element is in, or near, the viewport — the "overscan"
// margin (rootMargin) means it flips true slightly before the element is
// actually visible, so a chart's data fetch has a head start by the time the
// user actually scrolls to it. Used by ChartRow to decide whether to mount a
// real chart or a lightweight placeholder.
export function useInViewport(rootMargin = "800px 0px") {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView];
}
