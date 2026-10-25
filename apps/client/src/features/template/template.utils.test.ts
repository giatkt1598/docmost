import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@tiptap/extension-heading";
import { Text } from "@tiptap/extension-text";
import { ITemplate } from "@/features/template/types/template.types";
import { applyTemplateToPage } from "./template.utils";

const editors: Editor[] = [];

function pageEditor(content?: string) {
  const e = new Editor({ extensions: [StarterKit], content: content ?? "" });
  editors.push(e);
  return e;
}

function titleEditor(title = "") {
  const e = new Editor({
    extensions: [Document.extend({ content: "heading" }), Heading.configure({ levels: [1] }), Text],
    content: title ? `<h1>${title}</h1>` : "",
  });
  editors.push(e);
  return e;
}

const template = (over: Partial<ITemplate> = {}): ITemplate => ({
  id: "t1",
  title: "Weekly notes",
  description: null,
  icon: null,
  spaceId: null,
  workspaceId: "w",
  creatorId: null,
  lastUpdatedById: null,
  createdAt: "",
  updatedAt: "",
  content: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Agenda" }] }],
  },
  ...over,
});

afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

describe("applyTemplateToPage", () => {
  it("fills an empty page with the content and title", () => {
    const page = pageEditor();
    const title = titleEditor();
    expect(applyTemplateToPage(page, title, template())).toBe(true);
    expect(page.getText()).toBe("Agenda");
    expect(title.getText()).toBe("Weekly notes");
  });

  it("keeps a title the user already typed", () => {
    const page = pageEditor();
    const title = titleEditor("My page");
    expect(applyTemplateToPage(page, title, template())).toBe(true);
    expect(title.getText()).toBe("My page");
  });

  it("refuses a page that is no longer empty", () => {
    const page = pageEditor("<p>typed</p>");
    const title = titleEditor();
    expect(applyTemplateToPage(page, title, template())).toBe(false);
    expect(page.getText()).toBe("typed");
    expect(title.getText()).toBe("");
  });

  it("refuses destroyed or missing editors", () => {
    const page = pageEditor();
    const title = titleEditor();
    title.destroy();
    expect(applyTemplateToPage(page, title, template())).toBe(false);
    expect(applyTemplateToPage(null, null, template())).toBe(false);
  });

  it("accepts JSON string content and templates without content", () => {
    const page = pageEditor();
    const title = titleEditor();
    const asString = JSON.stringify(template().content);
    expect(applyTemplateToPage(page, title, template({ content: asString }))).toBe(true);
    expect(page.getText()).toBe("Agenda");

    const empty = pageEditor();
    const title2 = titleEditor();
    expect(applyTemplateToPage(empty, title2, template({ content: null, title: "Only title" }))).toBe(true);
    expect(empty.isEmpty).toBe(true);
    expect(title2.getText()).toBe("Only title");
  });
});
