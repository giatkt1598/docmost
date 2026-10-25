import { registerPropertyTypeComponents } from "@/features/base/registry/property-types";
import {
  CheckboxValue,
  ChoiceValue,
  DateValue,
  FileValue,
  FormulaValue,
  LinkValue,
  LongTextValue,
  NumberValue,
  PageValue,
  PersonValue,
  TextValue,
} from "./cell-renderers";
import {
  EmailEditor,
  LongTextEditor,
  NumberEditor,
  TextEditor,
  UrlEditor,
} from "./text-editors";
import { DateEditor } from "./date-editor";
import { ChoiceEditor } from "./choice-editor";
import { PersonEditor } from "./person-editor";
import { PageEditor } from "./page-editor";
import { FileEditor } from "./file-editor";

let registered = false;

// Attaches the cell renderers and editors to the property type registry.
// Safe to call more than once.
export function registerCellComponents() {
  if (registered) return;
  registered = true;

  registerPropertyTypeComponents("text", { Cell: TextValue, Editor: TextEditor, editorMode: "inline" });
  registerPropertyTypeComponents("longText", {
    Cell: LongTextValue,
    Editor: LongTextEditor,
    editorMode: "popover",
  });
  registerPropertyTypeComponents("number", {
    Cell: NumberValue,
    Editor: NumberEditor,
    editorMode: "inline",
  });
  for (const type of ["select", "status", "multiSelect"] as const) {
    registerPropertyTypeComponents(type, {
      Cell: ChoiceValue,
      Editor: ChoiceEditor,
      editorMode: "popover",
    });
  }
  registerPropertyTypeComponents("date", { Cell: DateValue, Editor: DateEditor, editorMode: "popover" });
  registerPropertyTypeComponents("person", {
    Cell: PersonValue,
    Editor: PersonEditor,
    editorMode: "popover",
  });
  registerPropertyTypeComponents("file", { Cell: FileValue, Editor: FileEditor, editorMode: "popover" });
  registerPropertyTypeComponents("page", { Cell: PageValue, Editor: PageEditor, editorMode: "popover" });
  registerPropertyTypeComponents("checkbox", {
    Cell: CheckboxValue,
    activate: (value) => value !== true,
  });
  registerPropertyTypeComponents("url", { Cell: LinkValue, Editor: UrlEditor, editorMode: "inline" });
  registerPropertyTypeComponents("email", { Cell: LinkValue, Editor: EmailEditor, editorMode: "inline" });
  registerPropertyTypeComponents("createdAt", { Cell: DateValue });
  registerPropertyTypeComponents("lastEditedAt", { Cell: DateValue });
  registerPropertyTypeComponents("lastEditedBy", { Cell: PersonValue });
  registerPropertyTypeComponents("formula", { Cell: FormulaValue });
}
