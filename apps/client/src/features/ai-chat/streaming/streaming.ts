import DOMPurify from "dompurify";
import { flattenHtmlBlocks, markdownToHtml } from "@docmost/editor-ext";
import { useCallback, useEffect, useRef, useState } from "react";
import "./streaming.css";

// Smooth rendering of a streaming AI answer: the text is revealed a few words
// per frame instead of in network bursts, new words fade in, and the chat
// glides to the bottom while it grows.

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FENCE = /^\s*(```|~~~)/;

// Closes what the end of a half-streamed answer leaves open, so the preview
// renders as the finished text will instead of flashing raw markdown.
export function closeOpenMarkdown(text: string): string {
  const lines = text.split("\n");
  const fences = lines.filter((line) => FENCE.test(line)).length;
  if (fences % 2 === 1) {
    return `${text}\n\`\`\``;
  }

  // a table row still being written would render as a broken row
  const last = lines[lines.length - 1];
  if (last.trimStart().startsWith("|") && !last.trimEnd().endsWith("|")) {
    lines.pop();
  }

  let closed = lines.join("\n");
  // a tag still being written would show as text until its ">" arrives
  closed = closed.replace(/<\/?[A-Za-z][^<>\n]*$/, "");
  // a link still being written would flash as brackets before turning into
  // a link: hold it back until it closes
  const openLink = /\[[^\]\n]*(\]\([^)\s]*)?$/.exec(closed);
  if (openLink && !/\]\([^)\s]*\)$/.test(openLink[0])) {
    closed = closed.slice(0, openLink.index);
  }
  // inline marks only span the current paragraph
  const paragraph = closed.slice(closed.lastIndexOf("\n\n") + 1);
  const count = (mark: string) => paragraph.split(mark).length - 1;
  if (count("`") % 2 === 1) {
    closed += "`";
  } else {
    if (count("**") % 2 === 1) closed += "**";
    if (count("~~") % 2 === 1) closed += "~~";
  }
  return closed;
}

// How long newly shown words take to fade in; matches .ai-reveal.
export const REVEAL_MS = 400;

// Text shown at one frame, as offsets into the rendered text, fading in
// from `at`.
export interface RevealMark {
  from: number;
  to: number;
  at: number;
}

// Model output is untrusted (page content can steer it): always sanitized.
function markdownFragment(text: string): DocumentFragment {
  const html = text.trim()
    ? (markdownToHtml(flattenHtmlBlocks(closeOpenMarkdown(text))) as string)
    : "";
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    RETURN_DOM_FRAGMENT: true,
  });
}

// How much text the rendered answer shows: the unit reveal marks count in.
export const renderedLength = (text: string) =>
  markdownFragment(text).textContent?.length ?? 0;

// The answer so far as safe HTML. Text in `marks` is wrapped to fade in; each
// wrapper starts its animation part way in, by how long ago its words
// appeared, so rebuilding the HTML every frame never restarts a fade. "Ago"
// is measured from `now`, the time of the rebuild: measured from the newest
// mark instead, a rebuild that adds no words (a chunk ending mid-word) would
// fade the latest words in again from nothing, and the answer would flicker.
export function renderStreamingMarkdown(
  text: string,
  marks: RevealMark[] = [],
  now: number = performance.now(),
): string {
  const root = markdownFragment(text);
  if (marks.length > 0) fadeIn(root, marks, now);
  const holder = document.createElement("div");
  holder.append(root);
  return holder.innerHTML;
}

function fadeIn(root: DocumentFragment, marks: RevealMark[], now: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);

  let offset = 0;
  for (const text of texts) {
    const start = offset;
    const end = start + text.data.length;
    offset = end;
    const pieces: Node[] = [];
    let cursor = start;
    for (const mark of marks) {
      const from = Math.max(mark.from, cursor);
      const to = Math.min(mark.to, end);
      if (from >= to) continue;
      if (from > cursor) {
        pieces.push(
          document.createTextNode(
            text.data.slice(cursor - start, from - start),
          ),
        );
      }
      const span = document.createElement("span");
      span.className = "ai-reveal";
      const elapsed = Math.round(now - mark.at);
      if (elapsed > 0) span.style.animationDelay = `-${elapsed}ms`;
      span.textContent = text.data.slice(from - start, to - start);
      pieces.push(span);
      cursor = to;
    }
    if (pieces.length === 0) continue;
    if (cursor < end) {
      pieces.push(document.createTextNode(text.data.slice(cursor - start)));
    }
    text.replaceWith(...pieces);
  }
}

// Where the word that starts at or after `from` ends, or -1 when the text
// runs out first.
const wordEnd = (text: string, from: number) => {
  const space = /\s/g;
  space.lastIndex = from;
  return space.exec(text)?.index ?? -1;
};

// After the last whole word, so a word still arriving never shows cut in half.
const safeEnd = (text: string) => {
  const match = /\s(?=\S*$)/.exec(text);
  return match ? match.index + 1 : 0;
};

// Reveals `target` a few words per frame instead of in the bursts the network
// delivers. The pace follows what is left: steady while the model writes,
// quick to catch up after a burst, done in a moment once `finished`. Reduced
// motion or `skip` shows everything at once.
export function useSmoothText(target: string, finished: boolean, skip = false) {
  const instant = skip || prefersReducedMotion();
  const [length, setLength] = useState(0);
  const [marks, setMarks] = useState<RevealMark[]>([]);
  const current = useRef(0);
  const rendered = useRef(0);
  const shownLength = instant ? target.length : Math.min(length, target.length);

  useEffect(() => {
    if (instant) return undefined;
    let frame = 0;
    const tick = () => {
      const from = Math.min(current.current, target.length);
      const backlog = target.length - from;
      if (backlog === 0) return;
      const step = Math.max(2, Math.ceil(backlog / (finished ? 4 : 10)));
      let next = Math.min(target.length, from + step);
      if (next < target.length) {
        const end = wordEnd(target, next);
        next = end !== -1 ? end : finished ? target.length : safeEnd(target);
      } else if (!finished) {
        next = safeEnd(target);
      }
      next = Math.max(from, next);
      current.current = next;
      setLength(next);
      // the words this frame shows, in rendered text, to fade in; marks whose
      // fade has ended are dropped
      const at = performance.now();
      const shownRendered = renderedLength(target.slice(0, next));
      const mark = {
        from: Math.min(rendered.current, shownRendered),
        to: shownRendered,
        at,
      };
      rendered.current = shownRendered;
      // the same list when nothing changed, so the HTML is not rebuilt
      setMarks((list) => {
        const kept = list.filter((item) => at - item.at < REVEAL_MS);
        if (mark.to > mark.from) return [...kept, mark];
        return kept.length === list.length ? list : kept;
      });
      // while the model writes, the last word waits for the space after it
      if (next < (finished ? target.length : safeEnd(target))) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, finished, instant]);

  return {
    shown: target.slice(0, shownLength),
    marks: instant ? [] : marks,
    caughtUp: finished && shownLength >= target.length,
  };
}

// How close to the bottom still counts as reading the latest.
const STICK_DISTANCE = 64;

// Keeps a scrolling area at its bottom while its content grows, gliding there
// instead of jumping. It lets go as soon as the person scrolls up, and takes
// hold again when they scroll back down or `stick` is called.
export function useStickToBottom<
  Scroll extends HTMLElement,
  Content extends HTMLElement,
>() {
  const scroll = useRef<Scroll>(null);
  const content = useRef<Content>(null);
  const stuck = useRef(true);
  const lastTop = useRef(0);
  const frame = useRef(0);

  const glide = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const reduced = prefersReducedMotion();
    const step = () => {
      const element = scroll.current;
      if (!element || !stuck.current) return;
      const target = element.scrollHeight - element.clientHeight;
      const gap = target - element.scrollTop;
      if (gap <= 1 || reduced) {
        element.scrollTop = target;
        lastTop.current = element.scrollTop;
        return;
      }
      element.scrollTop += Math.max(1, gap * 0.25);
      lastTop.current = element.scrollTop;
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  // back to the bottom at once, e.g. after sending or opening a chat
  const stick = useCallback(() => {
    stuck.current = true;
    const element = scroll.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
      lastTop.current = element.scrollTop;
    }
  }, []);

  const onScroll = useCallback(() => {
    const element = scroll.current;
    if (!element) return;
    const gap = element.scrollHeight - element.clientHeight - element.scrollTop;
    // only the person scrolls up; the glide only ever moves down
    if (element.scrollTop < lastTop.current - 1 && gap > STICK_DISTANCE) {
      stuck.current = false;
    } else if (gap <= STICK_DISTANCE) {
      stuck.current = true;
    }
    lastTop.current = element.scrollTop;
  }, []);

  useEffect(() => {
    const element = content.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(glide);
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [glide]);

  return { scroll, content, onScroll, stick, glide };
}
