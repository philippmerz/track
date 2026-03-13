import { renderMarkdownLine } from "./markdown.js";

export class NoteEditor {
  #root;
  #onChange;
  #lines = [""];
  #activeIndex = null;
  #pendingActivation = null;
  #transitionLock = false;

  constructor({ root, onChange }) {
    this.#root = root;
    this.#onChange = onChange;

    this.#root.addEventListener("pointerdown", (event) => this.#handlePointerDown(event));
    this.#root.addEventListener("click", (event) => this.#handleClick(event));
  }

  setValue(value) {
    this.#lines = value.length > 0 ? value.split("\n") : [""];
    this.#activeIndex = null;
    this.#pendingActivation = null;
    this.#render();
  }

  getValue() {
    return this.#lines.join("\n");
  }

  focusLastLine() {
    this.#activateLine(this.#lines.length - 1, this.#lines.at(-1)?.length ?? 0);
  }

  #handlePointerDown(event) {
    const lineElement = event.target.closest("[data-line-index]");
    const lineIndex = lineElement
      ? Number(lineElement.dataset.lineIndex)
      : this.#lines.length - 1;

    this.#pendingActivation = {
      lineIndex,
      caretOffset: this.#lines[lineIndex]?.length ?? 0,
    };
  }

  #handleClick() {
    if (!this.#pendingActivation) {
      return;
    }

    const { lineIndex, caretOffset } = this.#pendingActivation;
    this.#pendingActivation = null;

    if (lineIndex === this.#activeIndex) {
      const editor = this.#getActiveEditor();
      if (editor) {
        editor.focus();
      }
      return;
    }

    this.#activateLine(lineIndex, caretOffset);
  }

  #activateLine(index, caretOffset) {
    const nextIndex = Math.max(0, Math.min(index, this.#lines.length - 1));
    this.#activeIndex = nextIndex;
    this.#render();

    const editor = this.#getActiveEditor();
    if (!editor) {
      return;
    }

    editor.focus();
    const nextOffset = Math.max(0, Math.min(caretOffset, editor.value.length));
    editor.setSelectionRange(nextOffset, nextOffset);
    this.#syncEditorHeight(editor);
  }

  #render() {
    this.#root.textContent = "";

    this.#lines.forEach((line, index) => {
      const lineElement = document.createElement("div");
      lineElement.className = `note-line${index === this.#activeIndex ? " note-line-editing" : ""}`;
      lineElement.dataset.lineIndex = String(index);

      if (index === this.#activeIndex) {
        const editor = document.createElement("textarea");
        editor.className = "note-line-editor";
        editor.rows = 1;
        editor.spellcheck = false;
        editor.value = line;
        editor.dataset.lineEditor = "true";
        editor.addEventListener("input", () => this.#handleEditorInput(index, editor));
        editor.addEventListener("keydown", (event) => this.#handleEditorKeydown(event, index, editor));
        editor.addEventListener("blur", () => this.#handleEditorBlur(index, editor));
        lineElement.append(editor);
        requestAnimationFrame(() => this.#syncEditorHeight(editor));
      } else {
        lineElement.innerHTML = renderMarkdownLine(line);
      }

      this.#root.append(lineElement);
    });
  }

  #handleEditorInput(index, editor) {
    this.#lines[index] = editor.value;
    this.#syncEditorHeight(editor);
    this.#emitChange();
  }

  #handleEditorKeydown(event, index, editor) {
    const line = editor.value;
    const caretStart = editor.selectionStart;
    const caretEnd = editor.selectionEnd;

    if (event.key === "Enter") {
      event.preventDefault();
      this.#splitLine(index, line, caretStart, caretEnd);
      return;
    }

    if (event.key === "Backspace" && caretStart === caretEnd && caretStart === 0) {
      event.preventDefault();
      this.#backspaceAtLineStart(index, line);
      return;
    }

    if (event.key === "Delete" && caretStart === caretEnd && caretStart === line.length) {
      if (index < this.#lines.length - 1) {
        event.preventDefault();
        this.#mergeWithNextLine(index, line);
      }
      return;
    }

    if (event.key === "ArrowUp" && caretStart === caretEnd && caretStart === 0 && index > 0) {
      event.preventDefault();
      this.#lines[index] = line;
      this.#emitChange();
      this.#activateLine(index - 1, this.#lines[index - 1].length);
      return;
    }

    if (
      event.key === "ArrowDown" &&
      caretStart === caretEnd &&
      caretStart === line.length &&
      index < this.#lines.length - 1
    ) {
      event.preventDefault();
      this.#lines[index] = line;
      this.#emitChange();
      this.#activateLine(index + 1, 0);
    }
  }

  #handleEditorBlur(index, editor) {
    if (this.#transitionLock) {
      return;
    }

    this.#lines[index] = editor.value;
    this.#emitChange();

    if (this.#pendingActivation) {
      this.#activeIndex = null;
      this.#render();
      return;
    }

    this.#activeIndex = null;
    this.#render();
  }

  #splitLine(index, line, selectionStart, selectionEnd) {
    this.#transitionLock = true;
    const before = line.slice(0, selectionStart);
    const after = line.slice(selectionEnd);

    this.#lines[index] = before;
    this.#lines.splice(index + 1, 0, after);
    this.#emitChange();
    this.#activateLine(index + 1, 0);
    this.#releaseTransitionLock();
  }

  #backspaceAtLineStart(index, line) {
    if (index === 0) {
      return;
    }

    this.#transitionLock = true;
    const previousLine = this.#lines[index - 1];
    this.#lines[index - 1] = previousLine + line;
    this.#lines.splice(index, 1);
    this.#emitChange();
    this.#activateLine(index - 1, previousLine.length);
    this.#releaseTransitionLock();
  }

  #mergeWithNextLine(index, line) {
    this.#transitionLock = true;
    const nextLine = this.#lines[index + 1];
    this.#lines[index] = line + nextLine;
    this.#lines.splice(index + 1, 1);
    this.#emitChange();
    this.#activateLine(index, line.length);
    this.#releaseTransitionLock();
  }

  #syncEditorHeight(editor) {
    editor.style.height = "0px";
    editor.style.height = `${Math.max(editor.scrollHeight, 32)}px`;
  }

  #getActiveEditor() {
    return this.#root.querySelector("[data-line-editor='true']");
  }

  #emitChange() {
    this.#onChange?.(this.getValue());
  }

  #releaseTransitionLock() {
    queueMicrotask(() => {
      this.#transitionLock = false;
    });
  }
}
