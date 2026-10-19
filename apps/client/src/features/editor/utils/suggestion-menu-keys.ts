// The slash and emoji menus handle navigation keys with a document-level
// listener, so the editor must not also act on them (e.g. Enter would
// insert a new line and close the menu before the command runs).
export function isSuggestionMenuKey(event: KeyboardEvent): boolean {
  if (
    ["ArrowUp", "ArrowDown", "Enter"].includes(event.key) &&
    document.querySelector("#slash-command")
  ) {
    return true;
  }
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(
      event.key,
    ) &&
    document.querySelector("#emoji-command")
  ) {
    return true;
  }
  return false;
}
