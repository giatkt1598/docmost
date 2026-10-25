import { registerPropertyTypeComponents } from "@/features/base/registry/property-types";
import { ChoicesOptions } from "./choices-options";
import { NumberOptionsEditor } from "./number-options";
import { DateOptionsEditor } from "./date-options";
import { DefaultValueEditor, PersonOptionsEditor } from "./simple-options";

let registered = false;

// Attaches the options editors to the registry (formula has its own flow).
export function registerOptionsEditors() {
  if (registered) return;
  registered = true;
  for (const type of ["select", "status", "multiSelect"] as const) {
    registerPropertyTypeComponents(type, { OptionsEditor: ChoicesOptions });
  }
  registerPropertyTypeComponents("number", { OptionsEditor: NumberOptionsEditor });
  for (const type of ["date", "createdAt", "lastEditedAt"] as const) {
    registerPropertyTypeComponents(type, { OptionsEditor: DateOptionsEditor });
  }
  registerPropertyTypeComponents("person", { OptionsEditor: PersonOptionsEditor });
  for (const type of ["text", "longText", "url", "email", "checkbox"] as const) {
    registerPropertyTypeComponents(type, { OptionsEditor: DefaultValueEditor });
  }
}
