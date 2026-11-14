import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeOpenMarkdown,
  renderStreamingMarkdown,
  useSmoothText,
} from "./streaming";

describe("closeOpenMarkdown", () => {
  it("closes an open code fence", () => {
    expect(closeOpenMarkdown("Run:\n```ts\nconst a = 1;")).toBe(
      "Run:\n```ts\nconst a = 1;\n```",
    );
  });

  it("closes bold, strikethrough and inline code left open in the last paragraph", () => {
    expect(closeOpenMarkdown("Done.\n\nThis is **bold")).toBe(
      "Done.\n\nThis is **bold**",
    );
    expect(closeOpenMarkdown("Old ~~text")).toBe("Old ~~text~~");
    expect(closeOpenMarkdown("Call `get_page")).toBe("Call `get_page`");
    expect(closeOpenMarkdown("**Done** already")).toBe("**Done** already");
  });

  it("holds back a link until it closes", () => {
    expect(closeOpenMarkdown("See [Intro](/s/space/p/intro")).toBe("See ");
    expect(closeOpenMarkdown("See [Intro")).toBe("See ");
    expect(closeOpenMarkdown("See [Intro](/p/intro)")).toBe(
      "See [Intro](/p/intro)",
    );
  });

  it("holds back a table row still being written", () => {
    expect(closeOpenMarkdown("| A | B |\n| --- | --- |\n| 1 | Pay")).toBe(
      "| A | B |\n| --- | --- |",
    );
  });
});

describe("renderStreamingMarkdown", () => {
  it("renders markdown with single newlines as breaks", () => {
    const html = renderStreamingMarkdown(
      "**Bold**\nnext\n\n| A |\n| - |\n| 1 |",
    );
    expect(html).toContain("<strong>Bold</strong><br>");
    expect(html).toContain("<table>");
  });

  it("renders a half-written answer as the finished one will look", () => {
    expect(renderStreamingMarkdown("This is **bo")).toContain(
      "<strong>bo</strong>",
    );
    expect(renderStreamingMarkdown("```\ncode")).toContain("<pre>");
  });

  it("wraps newly shown text to fade in, part way through when it appeared earlier", () => {
    const html = renderStreamingMarkdown(
      "Hello **big** world",
      [
        { from: 0, to: 6, at: 1000 },
        { from: 6, to: 15, at: 1250 },
      ],
      1250,
    );
    expect(html).toContain(
      '<span class="ai-reveal" style="animation-delay: -250ms;">Hello </span>',
    );
    expect(html).toContain(
      '<strong><span class="ai-reveal">big</span></strong><span class="ai-reveal"> world</span>',
    );
  });

  it("keeps fades going when the HTML is rebuilt without new words", () => {
    // a chunk ending mid-word rebuilds the HTML 100ms later with the same marks
    const html = renderStreamingMarkdown(
      "Hello world",
      [{ from: 0, to: 6, at: 1000 }],
      1100,
    );
    expect(html).toContain('style="animation-delay: -100ms;">Hello </span>');
  });

  it("strips scripts and event handlers from model output", () => {
    const html = renderStreamingMarkdown(
      'Hi <script>alert(1)</script><img src=x onerror="alert(1)">',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});

describe("useSmoothText", () => {
  afterEach(() => vi.useRealTimers());

  it("reveals whole words over several frames and finishes once the text is complete", () => {
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
    });
    const text =
      "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
    const { result, rerender } = renderHook(
      ({ target, finished }) => useSmoothText(target, finished),
      { initialProps: { target: text, finished: false } },
    );
    expect(result.current.shown).toBe("");

    act(() => vi.advanceTimersToNextFrame());
    const first = result.current.shown;
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(text.length);
    expect(text.startsWith(first)).toBe(true);
    expect(text[first.length]).toMatch(/\s/);

    // the last word may still grow, so it waits until the answer is finished
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.shown).toBe(text.slice(0, text.lastIndexOf(" ") + 1));
    expect(result.current.caughtUp).toBe(false);

    rerender({ target: text, finished: true });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.shown).toBe(text);
    expect(result.current.caughtUp).toBe(true);
  });

  it("shows everything at once when skipped", () => {
    const { result } = renderHook(() => useSmoothText("all of it", true, true));
    expect(result.current).toEqual({
      shown: "all of it",
      marks: [],
      caughtUp: true,
    });
  });
});

describe("html layouts in answers", () => {
  const layout =
    'Picture it:\n\n<div class="stack">\n  <div>\n\n**AI MODEL**\n\n  </div>\n  <div class="chips">\n' +
    '    <span><svg viewBox="0 0 24 24"><path d="M0 0"/></svg>\n    Jira\n  </span>\n\n\n    <span>Git</span>\n  </div>\n</div>\n\n' +
    "```\n<div>kept</div>\n```";

  it("renders an html layout as its text", () => {
    const html = renderStreamingMarkdown(layout);
    expect(html).toContain("<strong>AI MODEL</strong>");
    expect(html).toMatch(/<p>Jira<\/p>\s*<p>Git<\/p>/);
    expect(html).not.toContain("<div");
    expect(html).not.toContain("svg");
    expect(html).toContain("&lt;div&gt;kept&lt;/div&gt;");
  });

  it("renders indented Markdown inside a layout as lists, not literal text", () => {
    const answer =
      '<div class="features">\n  <div>\n\n  **Soạn thảo tài liệu**\n\n  - Trình soạn thảo trực quan.\n  - Hỗ trợ Markdown.\n\n  </div>\n</div>\n\n## 2. Ưu điểm\n\n- Open Source';
    const html = renderStreamingMarkdown(answer);
    expect(html).toContain("<strong>Soạn thảo tài liệu</strong>");
    expect(html).toMatch(/<li>Trình soạn thảo trực quan.<\/li>/);
    expect(html).toContain("<h2>2. Ưu điểm</h2>");
    expect(html).not.toContain("<div");
  });

  it("never shows a tag that is still being written", () => {
    expect(closeOpenMarkdown('Done.\n\n<div class="ca')).toBe("Done.\n\n");
    expect(closeOpenMarkdown("a < b")).toBe("a < b");
  });

  it("shows earlier text unchanged while a layout streams in", () => {
    const text = (html: string) => {
      const holder = document.createElement("div");
      holder.innerHTML = html;
      return holder.textContent ?? "";
    };
    let previous = "";
    for (let end = 1; end <= layout.length; end++) {
      const shown = text(renderStreamingMarkdown(layout.slice(0, end)))
        .replace(/\s+/g, " ")
        .trim();
      // text already shown never disappears or changes, it only grows
      const stable = previous.slice(0, Math.max(0, previous.length - 12));
      expect(shown.startsWith(stable)).toBe(true);
      previous = shown;
    }
  });
});
